"""Deletion preserves a recovery copy before removing the active journal."""

import ast
import types
import unittest
from copy import deepcopy
from pathlib import Path


class RemovalRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_archive_precedes_removal_and_failed_archive_preserves_source(self):
        source = ast.parse(
            (
                Path(__file__).parents[1]
                / "custom_components/pellet_tracker/__init__.py"
            ).read_text()
        )
        function = next(
            n
            for n in source.body
            if isinstance(n, ast.AsyncFunctionDef) and n.name == "async_remove_entry"
        )
        values = {
            "pellet_tracker.example": {
                "revision": 3,
                "events": [{"id": "fictional"}],
                "audit": [],
            }
        }
        calls = []
        fail = False

        class Store:
            def __init__(self, hass, version, key):
                self.key = key

            async def async_load(self):
                return deepcopy(values.get(self.key))

            async def async_save(self, data):
                calls.append(("save", self.key))
                if fail:
                    raise OSError("Disk full")
                values[self.key] = deepcopy(data)

            async def async_remove(self):
                calls.append(("remove", self.key))
                values.pop(self.key, None)

        namespace = {"Store": Store, "DOMAIN": "pellet_tracker"}
        exec(
            compile(ast.Module(body=[function], type_ignores=[]), "removal", "exec"),
            namespace,
        )
        entry = types.SimpleNamespace(entry_id="example", title="Demo", data={})
        original = deepcopy(values["pellet_tracker.example"])
        fail = True
        with self.assertRaises(OSError):
            await namespace["async_remove_entry"](types.SimpleNamespace(data={}), entry)
        self.assertEqual(values["pellet_tracker.example"], original)
        self.assertFalse(any(action == "remove" for action, key in calls))
        fail = False
        calls.clear()
        await namespace["async_remove_entry"](types.SimpleNamespace(data={}), entry)
        self.assertEqual(calls[0], ("save", "pellet_tracker_recovery.example"))
        self.assertNotIn("pellet_tracker.example", values)
        archive = values["pellet_tracker_recovery.example"]
        self.assertEqual(archive["events"], original["events"])
        self.assertEqual(archive["reason"], "deleted_tracker")
