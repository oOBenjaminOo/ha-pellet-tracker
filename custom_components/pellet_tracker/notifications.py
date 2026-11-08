"""Grouped local alerts and optional delivery to an explicitly selected target."""

import asyncio
import logging
from datetime import datetime, timedelta
from uuid import uuid4

from homeassistant.components import persistent_notification
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .alert_model import active_alerts, delivery_due
from .const import DOMAIN
from .i18n import text

_LOGGER = logging.getLogger(__name__)


class Notifications:
    def __init__(self, hass, ledger):
        self.hass, self.ledger = hass, ledger
        self.store = Store(hass, 1, f"{DOMAIN}_notifications.{ledger.entry.entry_id}")
        self.state = {}
        self.lock = asyncio.Lock()
        self.last_error = None
        self.closed = False
        self.cancel_snooze = None

    def tr(self, message):
        return text(self.ledger.settings.get("language", "fr"), message)

    @property
    def notification_id(self):
        return f"{DOMAIN}_{self.ledger.entry.entry_id}"

    async def async_load(self):
        self.state = await self.store.async_load() or {}
        self.schedule_snooze()

    def schedule_snooze(self):
        if self.cancel_snooze:
            self.cancel_snooze()
            self.cancel_snooze = None
        until = self.state.get("snooze_until")
        if until and datetime.fromisoformat(until) > dt_util.utcnow():
            self.cancel_snooze = async_track_point_in_utc_time(
                self.hass, self.async_wake, datetime.fromisoformat(until)
            )

    async def async_wake(self, _now):
        self.cancel_snooze = None
        await self.async_check(reminders=True)

    async def action_buttons(self, kind):
        """Persist scoped, revision-bound, short-lived action capabilities before sending."""
        if kind != "alert" or not self.ledger.settings.get("notify_actions", True):
            return []
        token = uuid4().hex
        self.state["buttons"] = {
            "token": token,
            "revision": self.ledger.journal["revision"],
            "at": dt_util.utcnow().isoformat(),
            "destination": self.ledger.settings["notification_action"],
        }
        await self.store.async_save(self.state)
        return [
            {"action": f"PELLET_{token}_{key}", "title": title}
            for key, title in (
                ("clean", self.tr("Nettoyage fait")),
                ("use", self.tr("+1 sac utilisé")),
                ("snooze", self.tr("Rappeler dans 24 h")),
            )
        ]

    async def async_action(self, event):
        """Ignore foreign, expired, replayed and stale notification buttons."""
        async with self.lock:
            buttons = self.state.get("buttons", {})
            action = event.data.get("action", "")
            prefix = f"PELLET_{buttons.get('token', '')}_"
            if (
                self.closed
                or not buttons
                or not isinstance(action, str)
                or not action.startswith(prefix)
            ):
                return
            kind = action[len(prefix) :]
            if kind not in {"clean", "use", "snooze"}:
                return
            now = dt_util.utcnow()
            if not active_alerts(self.ledger.data, self.ledger.settings):
                return
            if (
                now - datetime.fromisoformat(buttons["at"]) > timedelta(days=1)
                or buttons["destination"] != self.ledger.settings["notification_action"]
                or not self.ledger.settings.get("notify_actions", True)
                or not self.ledger.settings["notify_enabled"]
            ):
                return
            try:
                if kind == "snooze":
                    self.state["snooze_until"] = (now + timedelta(days=1)).isoformat()
                    destination = self.ledger.settings["notification_action"]
                    self.state.setdefault(destination, {})["signature"] = "snoozed"
                else:
                    await self.ledger.transact(
                        "add",
                        {
                            "kind": kind,
                            "quantity": 1 if kind == "use" else 0,
                            "request_id": f"notification:{buttons['token']}",
                            "comment": self.tr("Action depuis une notification"),
                        },
                        buttons["revision"],
                        event.context.user_id or "notification",
                    )
                self.state.pop("buttons", None)
                await self.store.async_save(self.state)
                if kind == "snooze":
                    self.schedule_snooze()
            except (ValueError, TypeError, KeyError, OSError) as err:
                persistent_notification.async_create(
                    self.hass,
                    self.tr(
                        "Cette action n’a pas été enregistrée. Le journal a peut-être changé ; vérifiez le suivi avant de recommencer."
                    ),
                    self.ledger.entry.title,
                    f"{self.notification_id}_action",
                )
                _LOGGER.warning("Pellet notification action refused: %s", err)

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
            data = {"title": title, "message": message}
            if action.startswith("notify.mobile_app_"):
                buttons = await self.action_buttons(kind)
                if buttons:
                    data["data"] = {"actions": buttons, "tag": self.notification_id}
            await self.hass.services.async_call(
                "notify",
                action.split(".", 1)[1],
                data,
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
        message = self.tr("Notification de test du suivi des granulés.")
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
                else self.tr("Le stock et l’entretien sont à jour.")
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
                if (
                    channel != "persistent"
                    and alerts
                    and self.state.get("snooze_until", "") > now
                ):
                    continue
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
