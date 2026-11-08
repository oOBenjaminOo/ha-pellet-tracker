"""Actual delivery coordinator tested with fake HA service and storage boundaries."""

import importlib.util
import sys
import types
import unittest
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parents[1] / "custom_components/pellet_tracker"


class NotificationDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.clock = datetime(2018, 11, 7, 8, tzinfo=UTC)
        self.cards = {}
        self.calls = []
        self.events = []
        self.fail = False
        self.cfg = {
            "low_stock": 10,
            "cleaning_bags": 5,
            "cleaning_days": 7,
            "low_autonomy_days": 7,
            "notify_enabled": True,
            "notify_actions": False,
            "notification_action": "notify.mobile_app_test",
            "repeat_days": 3,
            "notify_recovery": False,
        }
        modules = {
            name: types.ModuleType(name)
            for name in [
                "homeassistant",
                "homeassistant.components",
                "homeassistant.components.persistent_notification",
                "homeassistant.helpers",
                "homeassistant.helpers.storage",
                "homeassistant.helpers.event",
                "homeassistant.util",
                "homeassistant.util.dt",
                "notifier_test",
            ]
        }
        modules["notifier_test"].__path__ = [str(ROOT)]
        modules["homeassistant.helpers.event"].async_track_point_in_utc_time = (
            lambda *args: lambda: None
        )
        modules["homeassistant.components.persistent_notification"].async_create = (
            lambda hass, message, title, identifier: self.cards.update(
                {identifier: message}
            )
        )
        modules["homeassistant.components.persistent_notification"].async_dismiss = (
            lambda hass, identifier: self.cards.pop(identifier, None)
        )
        modules["homeassistant.util.dt"].utcnow = lambda: self.clock

        class Store:
            def __init__(self, *args):
                self.value = None

            async def async_load(self):
                return deepcopy(self.value)

            async def async_save(self, value):
                self.value = deepcopy(value)

        modules["homeassistant.helpers.storage"].Store = Store
        with patch.dict(sys.modules, modules):
            spec = importlib.util.spec_from_file_location(
                "notifier_test.notifications", ROOT / "notifications.py"
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        self.Notifications = module.Notifications

        async def call(domain, service, data, blocking):
            self.calls.append((domain, service, data))
            if self.fail:
                raise OSError("Offline test target")

        self.hass = types.SimpleNamespace(
            services=types.SimpleNamespace(async_call=call),
            bus=types.SimpleNamespace(
                async_fire=lambda name, data: self.events.append((name, data))
            ),
        )
        self.ledger = types.SimpleNamespace(
            entry=types.SimpleNamespace(entry_id="test", title="Test"),
            settings=self.cfg,
            data={
                "stock": 8,
                "bags_since_clean": 0,
                "days_since_clean": 0,
                "autonomy_days": None,
            },
        )
        self.manager = module.Notifications(self.hass, self.ledger)
        await self.manager.async_load()

    async def test_english_delivery_and_buttons_preserve_stove_name(self):
        self.cfg["language"] = "en"
        self.ledger.entry.title = "Poêle chez François"
        await self.manager.async_test()
        self.assertEqual(
            self.calls[-1][2]["message"], "Pellet Tracker test notification."
        )
        self.assertIn("Poêle chez François", self.calls[-1][2]["title"])
        self.cfg["notify_actions"] = True
        self.ledger.journal = {"revision": 4}
        buttons = await self.manager.action_buttons("alert")
        self.assertEqual(
            [button["title"] for button in buttons],
            ["Cleaning done", "+1 bag used", "Remind in 24 h"],
        )

    async def test_mobile_actions_are_scoped_single_use_and_revision_bound(self):
        self.cfg["notify_actions"] = True
        self.ledger.journal = {"revision": 4}
        calls = []

        async def transact(operation, payload, revision, actor):
            if revision != self.ledger.journal["revision"]:
                raise ValueError("stale")
            calls.append((operation, payload, revision, actor))
            self.ledger.journal["revision"] += 1

        self.ledger.transact = transact
        await self.manager.external(
            "notify.mobile_app_test", "Title", "Message", "alert"
        )
        buttons = self.calls[-1][2]["data"]["actions"]
        event = types.SimpleNamespace(
            data={"action": buttons[0]["action"]},
            context=types.SimpleNamespace(user_id="user"),
        )
        foreign = types.SimpleNamespace(
            data={"action": "PELLET_foreign_clean"}, context=event.context
        )
        await self.manager.async_action(foreign)
        self.assertEqual(calls, [])
        await self.manager.async_action(event)
        await self.manager.async_action(event)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1]["kind"], "clean")
        await self.manager.external(
            "notify.mobile_app_test", "Title", "Message", "alert"
        )
        old = self.calls[-1][2]["data"]["actions"][1]["action"]
        self.ledger.journal["revision"] += 1
        await self.manager.async_action(
            types.SimpleNamespace(data={"action": old}, context=event.context)
        )
        self.assertEqual(len(calls), 1)

    async def test_snooze_suppresses_external_alerts_for_24_hours(self):
        self.cfg["notify_actions"] = True
        self.ledger.journal = {"revision": 1}
        await self.manager.async_check()
        button = self.calls[-1][2]["data"]["actions"][2]["action"]
        await self.manager.async_action(
            types.SimpleNamespace(
                data={"action": button}, context=types.SimpleNamespace(user_id="user")
            )
        )
        self.clock += timedelta(hours=12)
        await self.manager.async_check(reminders=True)
        self.assertEqual(len(self.calls), 1)
        self.clock += timedelta(hours=12, seconds=1)
        await self.manager.async_wake(self.clock)
        self.assertEqual(len(self.calls), 2)

    async def test_deduplication_survives_reload_and_repeats_only_when_due(self):
        await self.manager.async_check()
        await self.manager.async_check()
        self.assertEqual(len(self.calls), 1)
        replacement = self.Notifications(self.hass, self.ledger)
        replacement.store = self.manager.store
        await replacement.async_load()
        await replacement.async_check()
        self.assertEqual(len(self.calls), 1)
        self.clock += timedelta(days=3)
        await replacement.async_check(reminders=True)
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(len(self.cards), 1)

    async def test_failures_back_off_and_recover_without_losing_local_alert(self):
        self.fail = True
        await self.manager.async_check()
        self.assertEqual(len(self.cards), 1)
        self.assertIsNotNone(self.manager.last_error)
        await self.manager.async_check()
        self.assertEqual(len(self.calls), 1)
        self.clock += timedelta(hours=1)
        self.fail = False
        await self.manager.async_check()
        self.assertEqual(len(self.calls), 2)
        self.assertIsNone(self.manager.last_error)

    async def test_recovery_and_disabled_notifications(self):
        self.cfg["notify_recovery"] = True
        await self.manager.async_check()
        self.ledger.data["stock"] = 20
        await self.manager.async_check()
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(len(self.cards), 0)
        self.cfg["notify_enabled"] = False
        self.ledger.data["stock"] = 1
        await self.manager.async_check()
        self.assertEqual(len(self.calls), 2)

    async def test_local_default_and_explicit_test(self):
        self.cfg["notification_action"] = ""
        await self.manager.async_check()
        self.assertEqual(self.calls, [])
        await self.manager.async_test()
        self.assertIn("pellet_tracker_test_test", self.cards)

    async def test_notify_entity_and_script_variable_adapters(self):
        await self.manager.external("entity:notify.test", "Title", "Message", "alert")
        self.assertEqual(self.calls[-1][:2], ("notify", "send_message"))
        self.assertEqual(self.calls[-1][2]["entity_id"], "notify.test")
        await self.manager.external("script.test", "Title", "Message", "alert")
        self.assertEqual(self.calls[-1][:2], ("script", "turn_on"))
        self.assertEqual(self.calls[-1][2]["variables"]["message"], "Message")
