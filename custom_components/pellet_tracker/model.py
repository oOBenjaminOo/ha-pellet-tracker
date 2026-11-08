"""Pure ledger and FIFO valuation. No Home Assistant or network dependency."""

from __future__ import annotations

import calendar
import re
from collections import defaultdict, deque
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

KINDS = {"use", "purchase", "clean", "start", "adjust", "loss", "note"}


def decimal(value, minimum=None):
    """Reject NaN, infinity, booleans and unreasonable precision."""
    try:
        if isinstance(value, bool):
            raise TypeError("Invalid number")
        result = Decimal(str(value))
        if not result.is_finite() or abs(result) > 1000000:
            raise ValueError("Number outside supported range")
        if minimum is not None and result < minimum:
            raise ValueError("Number below minimum")
        if result.as_tuple().exponent < -4:
            raise ValueError("At most four decimal places")
        return result
    except (InvalidOperation, TypeError) as err:
        raise ValueError("Invalid number") from err


def season_for(day: str, month: int = 7) -> str:
    d = date.fromisoformat(day)
    year = d.year if d.month >= month else d.year - 1
    return f"{year}/{year + 1}"


def validate(raw: dict, today: str) -> dict:
    """Normalize a single operation; dates are local calendar dates."""
    if not isinstance(raw, dict) or raw.get("kind") not in KINDS:
        raise ValueError("Unknown operation")
    day = date.fromisoformat(str(raw.get("date", today))).isoformat()
    if day > today:
        raise ValueError("Future operations are not supported")
    kind = raw["kind"]
    qty = decimal(raw.get("quantity", 0))
    if kind in {"use", "purchase", "loss"} and qty <= 0:
        raise ValueError("Quantity must be positive")
    if kind in {"clean", "start", "note"}:
        qty = Decimal(0)
    price = raw.get("unit_price")
    price = None if price in (None, "") else str(decimal(price, Decimal(0)))
    if price is not None and (
        kind not in {"purchase", "adjust"} or kind == "adjust" and qty <= 0
    ):
        raise ValueError("Only incoming lots can have a price")
    season = raw.get("season")
    if season and (
        not re.fullmatch(r"\d{4}/\d{4}", str(season))
        or int(season[5:]) != int(season[:4]) + 1
    ):
        raise ValueError("Invalid season")
    out = {
        "kind": kind,
        "date": day,
        "quantity": str(qty),
        "unit_price": price,
        "comment": str(raw.get("comment", ""))[:2000],
        "supplier": str(raw.get("supplier", ""))[:200],
        "brand": str(raw.get("brand", ""))[:200],
    }
    if season:
        out["season"] = season
    # Historical consumption before the first inventory remains unvalued.
    if raw.get("untracked") is True and kind in {"use", "loss"}:
        out["untracked"] = True
    if raw.get("purchases_unknown") is True and kind in {"start", "note"}:
        out["purchases_unknown"] = True
    return out


def calculate(events: list[dict], today: str, month: int = 7, window: int = 30) -> dict:
    """Replay the journal, preserving unknown prices and rejecting shortages."""
    seasons = defaultdict(
        lambda: {
            "used": Decimal(0),
            "purchased": Decimal(0),
            "lost": Decimal(0),
            "cleanings": 0,
            "spend_known": Decimal(0),
            "purchase_unpriced": Decimal(0),
            "cost_known": Decimal(0),
            "use_unpriced": Decimal(0),
            "loss_cost_known": Decimal(0),
            "loss_unpriced": Decimal(0),
            "first_start": None,
            "prices": [],
            "purchases_complete": True,
        }
    )
    lots = deque()
    stock = Decimal(0)
    last_clean = None
    since_clean = Decimal(0)
    points = []
    inventory_started = False
    valuations = {}
    for event in sorted(
        (e for e in events if not e.get("voided")),
        key=lambda e: (e["date"], e["order"]),
    ):
        s = seasons[event.get("season") or season_for(event["date"], month)]
        kind, qty = event["kind"], Decimal(event["quantity"])
        price = None if event["unit_price"] is None else Decimal(event["unit_price"])
        if event.get("purchases_unknown"):
            s["purchases_complete"] = False
        if kind in {"purchase", "adjust"}:
            inventory_started = True
        if kind in {"purchase", "adjust"} and qty > 0:
            lots.append([qty, price])
            stock += qty
        if kind == "purchase":
            s["purchased"] += qty
            if price is None:
                s["purchase_unpriced"] += qty
            else:
                s["spend_known"] += qty * price
                s["prices"].append(price)
        if kind == "use":
            s["used"] += qty
            since_clean += qty
        if kind == "loss":
            s["lost"] += qty
        outgoing = (
            qty
            if kind in {"use", "loss"}
            else -qty
            if kind == "adjust" and qty < 0
            else Decimal(0)
        )
        if outgoing:
            cost, unknown = Decimal(0), Decimal(0)
            if event.get("untracked"):
                unknown = outgoing
            else:
                if outgoing > stock:
                    raise ValueError(
                        f"Insufficient stock on {event['date']} ({event['id']})"
                    )
                stock -= outgoing
                remaining = outgoing
                while remaining:
                    take = min(remaining, lots[0][0])
                    if lots[0][1] is None:
                        unknown += take
                    else:
                        cost += take * lots[0][1]
                    remaining -= take
                    lots[0][0] -= take
                    if not lots[0][0]:
                        lots.popleft()
            if kind in {"use", "loss"}:
                valuations[event["id"]] = (cost, unknown)
                prefix = "use" if kind == "use" else "loss"
                s["cost_known" if kind == "use" else "loss_cost_known"] += cost
                s[f"{prefix}_unpriced"] += unknown
        if kind == "clean":
            s["cleanings"] += 1
            last_clean, since_clean = event["date"], Decimal(0)
        if kind == "start":
            s["first_start"] = min(s["first_start"] or event["date"], event["date"])
        if inventory_started and (
            not points or stock != Decimal(str(points[-1]["stock"]))
        ):
            points.append({"date": event["date"], "stock": float(stock)})
    current = season_for(today, month)
    seasons[current]  # Ensure sensors exist even with an empty journal.
    output = {}
    for key, s in sorted(seasons.items()):
        prices = s.pop("prices")
        priced = s["purchased"] - s["purchase_unpriced"]
        s["average_price"] = s["spend_known"] / priced if priced else None
        s["min_price"], s["max_price"] = (
            (min(prices), max(prices)) if prices else (None, None)
        )
        s["spend"] = s["spend_known"] if not s["purchase_unpriced"] else None
        s["purchased_recorded"] = s["purchased"]
        if not s["purchases_complete"]:
            s["purchased"], s["spend"] = None, None
        s["cost"] = s["cost_known"] if not s["use_unpriced"] else None
        output[key] = {
            k: float(v) if isinstance(v, Decimal) else v for k, v in s.items()
        }
    unknown_stock = sum((q for q, p in lots if p is None), Decimal(0))
    known_value = sum((q * p for q, p in lots if p is not None), Decimal(0))
    result = {
        "stock": float(stock),
        "stock_value": None if unknown_stock else float(known_value),
        "stock_value_known": float(known_value),
        "stock_unpriced": float(unknown_stock),
        "season": current,
        "seasons": output,
        "last_clean": last_clean,
        "days_since_clean": (
            date.fromisoformat(today) - date.fromisoformat(last_clean)
        ).days
        if last_clean
        else None,
        "bags_since_clean": float(since_clean),
        "stock_history": points,
        "lots": [
            {"quantity": float(q), "unit_price": None if p is None else str(p)}
            for q, p in lots
        ],
    }
    result.update(analytics(events, today, month, window, result, valuations))
    return result


def period_summary(
    events: list[dict], valuations: dict, purchases_complete=True
) -> dict:
    """Summarize matching operations using the ledger's actual FIFO allocations."""
    used = purchased = spend = cost = unknown_purchase = unknown_use = Decimal(0)
    cleanings = 0
    prices = []
    for event in events:
        quantity = Decimal(event["quantity"])
        if event["kind"] == "use":
            used += quantity
            known, unknown = valuations[event["id"]]
            cost += known
            unknown_use += unknown
        elif event["kind"] == "purchase":
            purchased += quantity
            if event["unit_price"] is None:
                unknown_purchase += quantity
            else:
                price = Decimal(event["unit_price"])
                prices.append(price)
                spend += quantity * price
        elif event["kind"] == "clean":
            cleanings += 1
    priced = purchased - unknown_purchase
    return {
        "used": float(used),
        "purchased": float(purchased) if purchases_complete else None,
        "spend": float(spend) if purchases_complete and not unknown_purchase else None,
        "spend_known": float(spend),
        "cost": float(cost) if not unknown_use else None,
        "cost_known": float(cost),
        "cleanings": cleanings,
        "purchase_unpriced": float(unknown_purchase),
        "use_unpriced": float(unknown_use),
        "average_price": float(spend / priced) if priced else None,
        "min_price": float(min(prices)) if prices else None,
        "max_price": float(max(prices)) if prices else None,
    }


def analytics(
    events: list[dict],
    today: str,
    month: int,
    window: int,
    ledger: dict,
    valuations: dict,
) -> dict:
    """Calendar comparisons and conservative rolling usage estimate."""
    now = date.fromisoformat(today)
    active = [e for e in events if not e.get("voided")]
    monthly, same_date = {}, []
    for season, totals in ledger["seasons"].items():
        year = int(season[:4])
        rows = [
            e
            for e in active
            if (e.get("season") or season_for(e["date"], month)) == season
        ]
        monthly[season] = []
        for offset in range(12):
            index = year * 12 + month - 1 + offset
            first = date(index // 12, index % 12 + 1, 1)
            key = first.strftime("%Y-%m")
            result = period_summary(
                [e for e in rows if e["date"].startswith(key)],
                valuations,
                totals["purchases_complete"],
            )
            result.update(month=key, future=first > now)
            monthly[season].append(result)
        cutoff_year = year + (now.month < month)
        cutoff = date(
            cutoff_year,
            now.month,
            min(now.day, calendar.monthrange(cutoff_year, now.month)[1]),
        )
        snapshot = period_summary(
            [e for e in rows if e["date"] <= cutoff.isoformat()],
            valuations,
            totals["purchases_complete"],
        )
        snapshot.update(season=season, cutoff=cutoff.isoformat())
        same_date.append(snapshot)
    current = next(x for x in same_date if x["season"] == ledger["season"])
    previous_key = f"{int(ledger['season'][:4]) - 1}/{int(ledger['season'][:4])}"
    previous = next((x for x in same_date if x["season"] == previous_key), None)
    delta = None
    if previous and previous["used"]:
        delta = (current["used"] - previous["used"]) / previous["used"] * 100
    cutoff = now - timedelta(days=window - 1)
    recent = [
        e
        for e in active
        if e["kind"] == "use"
        and cutoff.isoformat() <= e["date"] <= today
        and (e.get("season") or season_for(e["date"], month)) == ledger["season"]
    ]
    first_start = ledger["seasons"][ledger["season"]]["first_start"]
    earliest = min((date.fromisoformat(e["date"]) for e in recent), default=now)
    observation_start = max(
        cutoff,
        min(date.fromisoformat(first_start), earliest) if first_start else earliest,
    )
    observation_days = (now - observation_start).days + 1
    sample_days = len({e["date"] for e in recent})
    last_use = max((date.fromisoformat(e["date"]) for e in recent), default=None)
    valid = (
        observation_days >= 7
        and sample_days >= 3
        and last_use is not None
        and (now - last_use).days <= min(14, window)
    )
    rate = (
        sum((Decimal(e["quantity"]) for e in recent), Decimal(0)) / observation_days
        if valid
        else None
    )
    autonomy = float(Decimal(str(ledger["stock"])) / rate) if rate else None
    if ledger["stock"] == 0:
        autonomy = 0.0
    # Dates beyond ten years do not constitute a useful heating forecast.
    exhaustion = (
        (now + timedelta(days=int(autonomy))).isoformat()
        if autonomy is not None and autonomy <= 3650
        else None
    )
    return {
        "monthly": monthly,
        "same_date": same_date,
        "usage_change_percent": delta,
        "daily_rate": float(rate) if rate else None,
        "autonomy_days": round(autonomy, 1) if autonomy is not None else None,
        "exhaustion_date": exhaustion,
        "estimate_window": window,
        "estimate_observation_days": observation_days,
        "estimate_sample_days": sample_days,
        "estimate_status": "empty"
        if ledger["stock"] == 0
        else "indicative"
        if valid and sample_days >= 5 and observation_days >= 14
        else "limited"
        if valid
        else "insufficient",
    }
