"""Persistence and concurrency behavior using minimal HA boundary doubles."""

import asyncio
import importlib.util
import sys
import types
import unittest
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parents[1] / "custom_components/pellet_tracker"


def load_ledger():
    modules = {}
    for name in (
        "homeassistant",
        "homeassistant.helpers",
        "homeassistant.helpers.storage",
        "homeassistant.helpers.update_coordinator",
        "homeassistant.util",
        "homeassistant.util.dt",
        "pellet_test",
    ):
        modules[name] = types.ModuleType(name)
    modules["pellet_test"].__path__ = [str(ROOT)]

    class Store:
        def __init__(self, *args):
            self.value = None
            self.fail = False

        async def async_load(self):
            return deepcopy(self.value)

        async def async_save(self, value):
            await asyncio.sleep(0)
            if self.fail:
                raise OSError("Disk full")
            self.value = deepcopy(value)

    class Coordinator:
        def __init__(self, *args, **kwargs):
            self.data = None

        def async_set_updated_data(self, data):
            self.data = data

    modules["homeassistant.helpers.storage"].Store = Store
    modules[
        "homeassistant.helpers.update_coordinator"
    ].DataUpdateCoordinator = Coordinator
    modules["homeassistant.util.dt"].now = lambda: datetime(2018, 11, 7, tzinfo=UTC)
    modules["homeassistant.util.dt"].utcnow = modules["homeassistant.util.dt"].now
    with patch.dict(sys.modules, modules):
        spec = importlib.util.spec_from_file_location(
            "pellet_test.ledger", ROOT / "ledger.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module.Ledger


Ledger = load_ledger()


class LedgerTransactionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.ledger = Ledger(
            None, types.SimpleNamespace(entry_id="test", title="Test", data={})
        )
        await self.ledger.async_load()

    async def add(self, kind, qty=0, **extra):
        await self.ledger.transact(
            "add",
            {"kind": kind, "quantity": qty, **extra},
            self.ledger.journal["revision"],
            "test-user",
        )

    async def test_failed_save_keeps_state(self):
        self.ledger.store.fail = True
        with self.assertRaises(OSError):
            await self.add("purchase", 20, unit_price="6.50")
        self.assertEqual(self.ledger.data["stock"], 0)
        self.assertEqual(self.ledger.journal["revision"], 0)

    async def test_reload_matches_saved_state(self):
        await self.add("purchase", 20, unit_price="6.50")
        expected = deepcopy(self.ledger.data)
        self.ledger.journal = {"revision": 0, "events": [], "audit": []}
        await self.ledger.async_load()
        self.assertEqual(self.ledger.data, expected)

    async def test_concurrent_revision_only_one_wins(self):
        results = await asyncio.gather(
            *[
                self.ledger.transact(
                    "add", {"kind": "purchase", "quantity": 10}, 0, "test"
                )
                for _ in range(2)
            ],
            return_exceptions=True,
        )
        self.assertEqual(sum(isinstance(r, ValueError) for r in results), 1)
        self.assertEqual(self.ledger.data["stock"], 10)

    async def test_invalid_import_is_atomic(self):
        with self.assertRaises(ValueError):
            await self.ledger.transact(
                "import",
                {
                    "events": [
                        {"id": "one", "kind": "purchase", "quantity": 10},
                        {"id": "two", "kind": "use", "quantity": 11},
                    ]
                },
                0,
                "test",
            )
        self.assertEqual(self.ledger.journal["events"], [])
        self.assertIsNone(self.ledger.store.value)

    async def test_import_twice_no_duplicates_and_void_preserved(self):
        payload = {
            "events": [
                {"id": "one", "kind": "purchase", "quantity": 10},
                {"id": "two", "kind": "use", "quantity": 2, "voided": True},
            ]
        }
        await self.ledger.transact("import", payload, 0, "test")
        await self.ledger.transact("import", payload, 1, "test")
        self.assertEqual(len(self.ledger.journal["events"]), 2)
        self.assertEqual(self.ledger.data["stock"], 10)

    async def test_edit_recalculates_and_audits(self):
        await self.add("purchase", 20, unit_price="5")
        await self.add("use", 2)
        identifier = self.ledger.journal["events"][0]["id"]
        await self.ledger.transact(
            "edit",
            {"id": identifier, "kind": "purchase", "quantity": 20, "unit_price": "6"},
            2,
            "test",
        )
        self.assertEqual(self.ledger.data["seasons"]["2018/2019"]["cost"], 12)
        self.assertEqual(
            self.ledger.journal["audit"][-1]["before"][0]["unit_price"], "5"
        )
        with self.assertRaises(ValueError):
            await self.ledger.transact("void", {"id": identifier}, 3, "test")
        self.assertEqual(self.ledger.journal["revision"], 3)
