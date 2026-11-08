"""Pure alert decisions and persisted reminder policy."""

from datetime import datetime, timedelta


def active_alerts(summary: dict, settings: dict) -> dict:
    alerts = {}
    if summary["stock"] <= settings["low_stock"]:
        alerts["low_stock"] = f"Stock faible : {summary['stock']:g} sacs restants."
    days = summary["days_since_clean"]
    if (
        summary["bags_since_clean"] >= settings["cleaning_bags"]
        or settings["cleaning_days"]
        and summary["bags_since_clean"] > 0
        and days is not None
        and days >= settings["cleaning_days"]
    ):
        elapsed = f", {days} jours" if days is not None else ""
        alerts["cleaning_due"] = (
            f"Nettoyage à prévoir : {summary['bags_since_clean']:g} sacs{elapsed} depuis le dernier nettoyage."
        )
    autonomy = summary["autonomy_days"]
    if (
        settings["low_autonomy_days"]
        and autonomy is not None
        and autonomy <= settings["low_autonomy_days"]
    ):
        alerts["low_autonomy"] = f"Autonomie estimée courte : {autonomy:g} jours."
    return alerts


def delivery_due(
    previous: dict, signature: str, now: str, repeat_days: int, reminders: bool
) -> bool:
    """No repeat after reload; failed destinations retry after one hour."""
    moment = datetime.fromisoformat(now)
    attempt = previous.get("failed_at")
    if attempt and moment - datetime.fromisoformat(attempt) < timedelta(hours=1):
        return False
    if previous.get("signature") != signature:
        return True
    return bool(
        signature
        and reminders
        and repeat_days
        and moment - datetime.fromisoformat(previous["at"])
        >= timedelta(days=repeat_days)
    )
