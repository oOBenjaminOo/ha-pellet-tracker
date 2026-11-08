"""Minimal diagnostics without journal contents or notification recipients."""

from .const import DOMAIN, VERSION


async def async_get_config_entry_diagnostics(hass, entry):
    ledger = hass.data[DOMAIN][entry.entry_id]
    return {
        "version": VERSION,
        "revision": ledger.journal["revision"],
        "operation_count": len(ledger.journal["events"]),
        "season_count": len(ledger.data["seasons"]),
        "estimate_status": ledger.data["estimate_status"],
        "notification_enabled": ledger.settings["notify_enabled"],
        "external_notification_configured": bool(
            ledger.settings["notification_action"]
        ),
        "notification_delivery_error": bool(ledger.notifier.last_error),
    }
