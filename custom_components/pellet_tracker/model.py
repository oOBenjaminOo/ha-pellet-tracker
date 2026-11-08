"""Pure ledger and FIFO valuation. No Home Assistant or network dependency."""
from __future__ import annotations

from collections import defaultdict, deque
from datetime import date
from decimal import Decimal, InvalidOperation
import re

KINDS = {"use", "purchase", "clean", "start", "adjust", "loss", "note"}


def decimal(value, minimum=None):
    """Reject NaN, infinity, booleans and unreasonable precision."""
    try:
        if isinstance(value, bool):
            raise ValueError("Invalid number")
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
    if price is not None and kind not in {"purchase", "adjust"}:
        raise ValueError("Only incoming lots can have a price")
    season = raw.get("season")
    if season and (not re.fullmatch(r"\d{4}/\d{4}", str(season)) or int(season[5:]) != int(season[:4]) + 1):
        raise ValueError("Invalid season")
    out = {"kind": kind, "date": day, "quantity": str(qty), "unit_price": price,
           "comment": str(raw.get("comment", ""))[:2000],
           "supplier": str(raw.get("supplier", ""))[:200],
           "brand": str(raw.get("brand", ""))[:200]}
    if season:
        out["season"] = season
    # Historical consumption before the first inventory remains unvalued.
    if raw.get("untracked") is True and kind in {"use", "loss"}:
        out["untracked"] = True
    return out


def calculate(events: list[dict], today: str, month: int = 7) -> dict:
    """Replay the journal, preserving unknown prices and rejecting shortages."""
    seasons = defaultdict(lambda: {"used": Decimal(0), "purchased": Decimal(0),
        "lost": Decimal(0), "cleanings": 0, "spend_known": Decimal(0),
        "purchase_unpriced": Decimal(0), "cost_known": Decimal(0),
        "use_unpriced": Decimal(0), "loss_cost_known": Decimal(0),
        "loss_unpriced": Decimal(0), "first_start": None, "prices": []})
    lots = deque()
    stock = Decimal(0)
    last_clean = None
    since_clean = Decimal(0)
    points = []
    for event in sorted((e for e in events if not e.get("voided")), key=lambda e: (e["date"], e["order"])):
        s = seasons[event.get("season") or season_for(event["date"], month)]
        kind, qty = event["kind"], Decimal(event["quantity"])
        price = None if event["unit_price"] is None else Decimal(event["unit_price"])
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
        outgoing = qty if kind in {"use", "loss"} else -qty if kind == "adjust" and qty < 0 else Decimal(0)
        if outgoing:
            cost, unknown = Decimal(0), Decimal(0)
            if event.get("untracked"):
                unknown = outgoing
            else:
                if outgoing > stock:
                    raise ValueError(f"Insufficient stock on {event['date']} ({event['id']})")
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
                prefix = "use" if kind == "use" else "loss"
                s["cost_known" if kind == "use" else "loss_cost_known"] += cost
                s[f"{prefix}_unpriced"] += unknown
        if kind == "clean":
            s["cleanings"] += 1
            last_clean, since_clean = event["date"], Decimal(0)
        if kind == "start":
            s["first_start"] = min(s["first_start"] or event["date"], event["date"])
        points.append({"date": event["date"], "stock": float(stock)})
    current = season_for(today, month)
    seasons[current]  # Ensure sensors exist even with an empty journal.
    output = {}
    for key, s in sorted(seasons.items()):
        prices = s.pop("prices")
        priced = s["purchased"] - s["purchase_unpriced"]
        s["average_price"] = s["spend_known"] / priced if priced else None
        s["min_price"], s["max_price"] = (min(prices), max(prices)) if prices else (None, None)
        s["spend"] = s["spend_known"] if not s["purchase_unpriced"] else None
        s["cost"] = s["cost_known"] if not s["use_unpriced"] else None
        output[key] = {k: float(v) if isinstance(v, Decimal) else v for k, v in s.items()}
    unknown_stock = sum((q for q, p in lots if p is None), Decimal(0))
    known_value = sum((q * p for q, p in lots if p is not None), Decimal(0))
    return {"stock": float(stock), "stock_value": None if unknown_stock else float(known_value),
            "stock_value_known": float(known_value), "stock_unpriced": float(unknown_stock),
            "season": current, "seasons": output, "last_clean": last_clean,
            "days_since_clean": (date.fromisoformat(today) - date.fromisoformat(last_clean)).days if last_clean else None,
            "bags_since_clean": float(since_clean), "stock_history": points,
            "lots": [{"quantity": float(q), "unit_price": None if p is None else str(p)} for q, p in lots]}
