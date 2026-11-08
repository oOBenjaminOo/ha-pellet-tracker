"""Card subscription behavior with independent HA boundaries and no private journal export."""

import ast
import json
import types
import unittest
from pathlib import Path

from test_reports import dashboard

ROOT = Path(__file__).parents[1] / "custom_components/pellet_tracker"


def load_functions():
    source = ast.parse((ROOT / "__init__.py").read_text())
    names = {"registered_entities", "card_payload", "ws_card_updates"}
    body = [
        node
        for node in source.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name in names
    ]
    for node in body:
        node.decorator_list = []
    registry = types.SimpleNamespace()
    namespace = {
        "DOMAIN": "pellet_tracker",
        "POLICY_READ": "read",
        "callback": lambda fn: fn,
        "er": types.SimpleNamespace(
            async_get=lambda hass: registry,
            async_entries_for_config_entry=lambda _reg, _entry: registry.entities,
        ),
        "mushroom_card": dashboard.mushroom_card,
    }
    exec(
        compile(
            ast.Module(body=body, type_ignores=[]), str(ROOT / "__init__.py"), "exec"
        ),
        namespace,
    )
    return namespace, registry


class CardBackendTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.functions, self.registry = load_functions()
        self.registry.entities = [
            types.SimpleNamespace(
                platform="pellet_tracker",
                unique_id="entry_stock",
                entity_id="sensor.stock",
                disabled_by=None,
                name="Stock",
            )
        ]
        self.listeners = []
        self.registry_listeners = []

        def subscribe(collection, callback):
            collection.append(callback)
            return lambda: collection.remove(callback)

        settings = {
            "language": "fr",
            "stove_control_enabled": True,
            "stove_control_entity": "switch.stove",
        }
        self.ledger = types.SimpleNamespace(
            entry=types.SimpleNamespace(entry_id="entry", title="Poêle"),
            settings=settings,
            journal={
                "revision": 2,
                "audit": [
                    {
                        "action": "add",
                        "revision": 2,
                        "after": [{"comment": "PRIVATE SECRET"}],
                    }
                ],
            },
            async_add_listener=lambda cb: subscribe(self.listeners, cb),
        )
        self.hass = types.SimpleNamespace(
            data={"pellet_tracker": {"entry": self.ledger}},
            states=types.SimpleNamespace(
                get=lambda _id: types.SimpleNamespace(state="on", name="Stock")
            ),
            bus=types.SimpleNamespace(
                async_listen=lambda _event, cb: subscribe(self.registry_listeners, cb)
            ),
        )
        self.events = []
        self.errors = []
        self.results = []
        self.connection = types.SimpleNamespace(
            user=types.SimpleNamespace(is_admin=True),
            subscriptions={},
            send_event=lambda _id, payload: self.events.append(payload),
            send_error=lambda *args: self.errors.append(args),
            send_result=lambda _id: self.results.append(_id),
        )

    async def test_live_settings_registry_updates_and_subscription_cleanup(self):
        await self.functions["ws_card_updates"](
            self.hass, self.connection, {"id": 7, "entry_id": "entry"}
        )
        self.assertEqual(self.results, [7])
        self.assertEqual(len(self.events), 1)
        self.assertNotIn("PRIVATE SECRET", json.dumps(self.events))
        self.assertEqual(set(self.events[0]), {"language", "config"})
        self.ledger.settings["language"] = "en"
        self.listeners[0]()
        self.assertEqual(self.events[-1]["language"], "en")
        self.registry.entities[0].entity_id = "sensor.stock_renamed"
        self.registry_listeners[0](None)
        self.assertIn("sensor.stock_renamed", json.dumps(self.events[-1]))
        self.connection.subscriptions[7]()
        self.assertEqual(self.listeners, [])
        self.assertEqual(self.registry_listeners, [])

    async def test_read_permission_failure_has_no_subscription_or_data_leak(self):
        self.connection.user = types.SimpleNamespace(
            is_admin=False,
            permissions=types.SimpleNamespace(
                check_entity=lambda _entity, _policy: False
            ),
        )
        await self.functions["ws_card_updates"](
            self.hass, self.connection, {"id": 7, "entry_id": "entry"}
        )
        self.assertEqual(self.events, [])
        self.assertEqual(self.listeners, [])
        self.assertEqual(self.errors[0][1], "unauthorized")

    async def test_read_only_view_has_no_stove_control_or_undo_hotspots(self):
        self.connection.user = types.SimpleNamespace(
            is_admin=False,
            permissions=types.SimpleNamespace(
                check_entity=lambda _entity, _policy: True
            ),
        )
        await self.functions["ws_card_updates"](
            self.hass, self.connection, {"id": 7, "entry_id": "entry"}
        )
        config = json.dumps(self.events[-1])
        self.assertNotIn("pellet_tracker.control_stove", config)
        self.assertNotIn("pellet_tracker.undo_last", config)
