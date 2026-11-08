"""Grouped local alerts and optional delivery to an explicitly selected target."""

import asyncio
import logging

from homeassistant.components import persistent_notification
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .alert_model import active_alerts, delivery_due
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class Notifications:
    def __init__(self, hass, ledger):
        self.hass, self.ledger = hass, ledger
        self.store = Store(hass, 1, f"{DOMAIN}_notifications.{ledger.entry.entry_id}")
        self.state = {}
        self.lock = asyncio.Lock()
        self.last_error = None
        self.closed = False

    @property
    def notification_id(self):
        return f"{DOMAIN}_{self.ledger.entry.entry_id}"

    async def async_load(self):
        self.state = await self.store.async_load() or {}

    async def external(self, action, title, message, kind):
        if action.startswith("entity:notify."):
            await self.hass.services.async_call(
                "notify",
                "send_message",
                {
                    "entity_id": action.removeprefix("entity:"),
                    "title": title,
                    "message": message,
                },
                blocking=True,
            )
        elif action.startswith("notify."):
            await self.hass.services.async_call(
                "notify",
                action.split(".", 1)[1],
                {"title": title, "message": message},
                blocking=True,
            )
        elif action.startswith("script."):
            await self.hass.services.async_call(
                "script",
                "turn_on",
                {
                    "entity_id": action,
                    "variables": {
                        "title": title,
                        "message": message,
                        "kind": kind,
                        "entry_id": self.ledger.entry.entry_id,
                    },
                },
                blocking=True,
            )
        else:
            raise ValueError("Unsupported notification destination")

    async def async_test(self):
        title = f"🔥 {self.ledger.entry.title}"
        message = "Notification de test du suivi des granulés."
        persistent_notification.async_create(
            self.hass, message, title, f"{self.notification_id}_test"
        )
        action = self.ledger.settings["notification_action"]
        if action:
            await self.external(action, title, message, "test")

    async def async_check(self, reminders=False):
        if self.closed:
            return
        async with self.lock:
            if self.closed:
                return
            settings = self.ledger.settings
            alerts = (
                active_alerts(self.ledger.data, settings)
                if settings["notify_enabled"]
                else {}
            )
            signature = ",".join(sorted(alerts))
            title = f"🔥 {self.ledger.entry.title}"
            message = (
                "\n".join(alerts.values())
                if alerts
                else "Le stock et l’entretien sont à jour."
            )
            now = dt_util.utcnow().isoformat()
            self.last_error = None
            channels = ["persistent"]
            action = settings["notification_action"]
            if action:
                channels.append(action)
            # Dismiss only this journal's own alert when disabled or recovered.
            if not alerts:
                persistent_notification.async_dismiss(self.hass, self.notification_id)
            else:
                persistent_notification.async_create(
                    self.hass, message, title, self.notification_id
                )
            for channel in channels:
                previous = self.state.get(channel, {})
                if not delivery_due(
                    previous, signature, now, settings["repeat_days"], reminders
                ):
                    continue
                if not alerts and (
                    not settings["notify_enabled"]
                    or not settings["notify_recovery"]
                    or not previous.get("signature")
                ):
                    self.state[channel] = {"signature": signature, "at": now}
                    continue
                try:
                    if channel == "persistent":
                        if alerts:
                            persistent_notification.async_create(
                                self.hass, message, title, self.notification_id
                            )
                    else:
                        await self.external(
                            channel, title, message, "alert" if alerts else "recovery"
                        )
                    self.state[channel] = {"signature": signature, "at": now}
                except Exception as err:  # A delivery failure must never undo a saved journal operation.
                    self.last_error = str(err)
                    self.state[channel] = {
                        **previous,
                        "failed_at": now,
                        "error": str(err),
                    }
                    _LOGGER.warning(
                        "Pellet notification delivery failed for %s: %s",
                        self.ledger.entry.entry_id,
                        err,
                    )
            if signature != self.state.get("active"):
                self.hass.bus.async_fire(
                    "pellet_tracker_alert",
                    {
                        "entry_id": self.ledger.entry.entry_id,
                        "alerts": list(alerts),
                        "title": title,
                        "message": message,
                    },
                )
                self.state["active"] = signature
            self.last_error = (
                "; ".join(
                    self.state.get(c, {}).get("error", "")
                    for c in channels
                    if self.state.get(c, {}).get("failed_at")
                )
                or None
            )
            await self.store.async_save(self.state)
