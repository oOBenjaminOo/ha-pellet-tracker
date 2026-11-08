"""Optional budgets, heating summaries and price comparisons, without HA dependencies."""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from .model import purchase_price, season_for


def enrich_summary(summary, events, budgets, month):
    active = [e for e in events if not e.get("voided")]
    comparisons = defaultdict(
        lambda: {
            "quantity": Decimal(0),
            "priced_quantity": Decimal(0),
            "spend_known": Decimal(0),
            "unknown_quantity": Decimal(0),
            "prices": [],
        }
    )
    for event in active:
        if event["kind"] != "purchase":
            continue
        season = event.get("season") or season_for(event["date"], month)
        for dimension in ("supplier", "brand"):
            name = " ".join(event.get(dimension, "").split()) or "Non renseigné"
            group = comparisons[(season, dimension, name.casefold())]
            group["name"], group["season"], group["dimension"] = name, season, dimension
            quantity = Decimal(event["quantity"])
            group["quantity"] += quantity
            price = purchase_price(event)
            if price is None:
                group["unknown_quantity"] += quantity
            else:
                group["priced_quantity"] += quantity
                group["spend_known"] += quantity * price
                group["prices"].append(price)
    prices = []
    for group in comparisons.values():
        values = group.pop("prices")
        group["average_price"] = (
            group["spend_known"] / group["priced_quantity"]
            if group["priced_quantity"]
            else None
        )
        group["min_price"] = min(values) if values else None
        group["max_price"] = max(values) if values else None
        group["spend"] = group["spend_known"] if not group["unknown_quantity"] else None
        prices.append(
            {k: float(v) if isinstance(v, Decimal) else v for k, v in group.items()}
        )
    summary["price_comparisons"] = prices
    for season, result in summary["seasons"].items():
        budget = Decimal(str(budgets[season])) if season in budgets else None
        spend = Decimal(str(result["spend"])) if result["spend"] is not None else None
        result["budget"] = float(budget) if budget is not None else None
        result["budget_remaining"] = (
            float(budget - spend) if budget is not None and spend is not None else None
        )
        result["budget_percent"] = (
            float(spend / budget * 100) if budget and spend is not None else None
        )
        start, end = result["first_start"], result.get("last_end")
        duration = (
            (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
            if start and end
            else None
        )
        uses = [
            e
            for e in active
            if e["kind"] == "use"
            and (e.get("season") or season_for(e["date"], month)) == season
        ]
        heating_used = (
            sum(
                (
                    Decimal(e["quantity"])
                    for e in uses
                    if start and end and start <= e["date"] <= end
                ),
                Decimal(0),
            )
            if duration
            else None
        )
        result["heating_days"] = duration
        result["heating_used"] = (
            float(heating_used) if heating_used is not None else None
        )
        result["heating_daily_rate"] = (
            float(heating_used / duration) if duration else None
        )
        result["outside_heating_used"] = (
            result["used"] - float(heating_used) if heating_used is not None else None
        )
    return summary
