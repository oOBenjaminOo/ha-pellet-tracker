"""Fictional restore fixtures: validation, recovery and atomic replacement."""

import types
import unittest
from copy import deepcopy
from unittest.mock import patch

from test_ledger import Ledger

prepare_backup = Ledger.transact.__globals__["prepare_backup"]


def fixture():
    return {
        "schema_version": 1,
        "currency": "EUR",
        "season_month": 7,
        "events": [
            {
                "id": "fictional-lot",
                "kind": "purchase",
                "quantity": 17,
                "unit_price": "6.43",
                "date": "2017-10-02",
            },
            {"id": "fictional-use", "kind": "use", "quantity": 3, "date": "2018-10-09"},
            {
                "id": "fictional-voided",
                "kind": "use",
                "quantity": 2,
                "date": "2018-10-10",
                "voided": True,
            },
        ],
    }


class BackupValidationTests(unittest.TestCase):
    def test_preview_replays_fifo_and_counts_without_trusting_summary(self):
        backup = fixture()
        backup["summary"] = {"stock": 999}
        _, preview = prepare_backup(
            backup, "2018-11-07", 7, "EUR", [{"id": "fictional-lot"}, {"id": "absent"}]
        )
        self.assertEqual(preview["stock"], 14)
        self.assertEqual(preview["seasons"], ["2017/2018", "2018/2019"])
        self.assertEqual(
            (
                preview["existing_ids"],
                preview["new_ids"],
                preview["removed_ids"],
                preview["voided"],
            ),
            (1, 2, 1, 1),
        )

    def test_duplicate_ids_negative_stock_and_incompatible_settings_refused(self):
        cases = []
        backup = fixture()
        backup["events"].append(deepcopy(backup["events"][0]))
        cases.append(backup)
        backup = fixture()
        backup["events"][1]["quantity"] = 19
        cases.append(backup)
        for key, value in (
            ("currency", "CHF"),
            ("season_month", 1),
            ("schema_version", 2),
        ):
            backup = fixture()
            backup[key] = value
            cases.append(backup)
        for backup in cases:
            with self.subTest(backup=backup), self.assertRaises(ValueError):
                prepare_backup(backup, "2018-11-07", 7, "EUR")


class BackupRestoreTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.ledger = Ledger(
            None, types.SimpleNamespace(entry_id="example", title="Demo", data={})
        )
        await self.ledger.async_load()
        await self.ledger.transact(
            "add", {"kind": "purchase", "quantity": 8}, 0, "test"
        )
        self.original = deepcopy(self.ledger.journal)
        self.backup = fixture()
        _, self.preview = prepare_backup(self.backup, self.ledger.today, 7, "EUR")

    def payload(self):
        return {"backup": self.backup, "digest": self.preview["digest"]}

    async def test_restore_replaces_existing_ids_and_retains_recovery_and_audit(self):
        recovery = types.SimpleNamespace(async_save=None)
        from unittest.mock import AsyncMock

        recovery.async_save = AsyncMock()
        with patch.dict(Ledger.transact.__globals__, {"Store": lambda *args: recovery}):
            await self.ledger.transact("restore_backup", self.payload(), 1, "test")
        self.assertEqual(self.ledger.data["stock"], 14)
        self.assertEqual(self.ledger.journal["revision"], 2)
        self.assertEqual(
            recovery.async_save.call_args.args[0]["events"], self.original["events"]
        )
        self.assertEqual(
            self.ledger.journal["audit"][-1]["before"], self.original["events"]
        )
        self.assertEqual(self.ledger.journal["audit"][-1]["action"], "restore_backup")
        # Restoring the same IDs must replace their content, unlike merge import.
        self.backup["events"][0]["quantity"] = 22
        _, self.preview = prepare_backup(self.backup, self.ledger.today, 7, "EUR")
        await self.ledger.transact("restore_backup", self.payload(), 2, "test")
        self.assertEqual(self.ledger.data["stock"], 19)

    async def test_stale_revision_or_changed_backup_cannot_replace_journal(self):
        with self.assertRaises(ValueError):
            await self.ledger.transact("restore_backup", self.payload(), 0, "test")
        self.backup["events"][0]["quantity"] = 23
        with self.assertRaises(ValueError):
            await self.ledger.transact("restore_backup", self.payload(), 1, "test")
        self.assertEqual(self.ledger.journal, self.original)

    async def test_failed_checkpoint_or_journal_save_keeps_current_data(self):
        from unittest.mock import AsyncMock

        recovery = types.SimpleNamespace(
            async_save=AsyncMock(side_effect=OSError("Disk full"))
        )
        with (
            patch.dict(Ledger.transact.__globals__, {"Store": lambda *args: recovery}),
            self.assertRaises(OSError),
        ):
            await self.ledger.transact("restore_backup", self.payload(), 1, "test")
        self.assertEqual(self.ledger.journal, self.original)
        self.ledger.store.fail = True
        with self.assertRaises(OSError):
            await self.ledger.transact("restore_backup", self.payload(), 1, "test")
        self.assertEqual(self.ledger.journal, self.original)
