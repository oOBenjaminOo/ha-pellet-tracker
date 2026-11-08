"""Pure alert decisions and persisted reminder policy."""

from datetime import datetime, timedelta

from .i18n import text


def active_alerts(summary: dict, settings: dict) -> dict:
    alerts = {}
    language = settings.get("language", "fr")
    if summary["stock"] <= settings["low_stock"]:
        alerts["low_stock"] = text(
            language, "Stock faible : {stock:g} sacs restants.", stock=summary["stock"]
        )
    days = summary["days_since_clean"]
    if (
        settings["cleaning_bags"]
        and summary["bags_since_clean"] >= settings["cleaning_bags"]
        or settings["cleaning_days"]
        and summary["bags_since_clean"] > 0
        and days is not None
        and days >= settings["cleaning_days"]
    ):
        elapsed = (
            text(language, ", {days} jours", days=days) if days is not None else ""
        )
        alerts["cleaning_due"] = text(
            language,
            "Nettoyage à prévoir : {bags:g} sacs{elapsed} depuis le dernier nettoyage.",
            bags=summary["bags_since_clean"],
            elapsed=elapsed,
        )
    autonomy = summary["autonomy_days"]
    if (
        settings["low_autonomy_days"]
        and autonomy is not None
        and autonomy <= settings["low_autonomy_days"]
    ):
        alerts["low_autonomy"] = text(
            language,
            "Autonomie estimée courte : {autonomy:g} jours.",
            autonomy=autonomy,
        )
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
