"""Alert thresholds and reminder decisions with explicit time fixtures."""

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1] / "custom_components/pellet_tracker"


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


alerts = load("alert_model")
settings = load("settings")


class AlertTests(unittest.TestCase):
    def test_no_cleaning_reminder_without_usage_since_cleaning(self):
        summary = {
            "stock": 20,
            "bags_since_clean": 0,
            "days_since_clean": 150,
            "autonomy_days": None,
        }
        self.assertEqual(alerts.active_alerts(summary, settings.DEFAULTS), {})

    def test_grouped_thresholds_and_unknown_autonomy(self):
        summary = {
            "stock": 10,
            "bags_since_clean": 5,
            "days_since_clean": 8,
            "autonomy_days": None,
        }
        result = alerts.active_alerts(summary, settings.DEFAULTS)
        self.assertEqual(set(result), {"low_stock", "cleaning_due"})
        summary["autonomy_days"] = 3
        self.assertIn("low_autonomy", alerts.active_alerts(summary, settings.DEFAULTS))
        summary.update(
            stock=20, bags_since_clean=0, days_since_clean=0, autonomy_days=30
        )
        self.assertEqual(alerts.active_alerts(summary, settings.DEFAULTS), {})

    def test_day_threshold_and_disabled_day_checks(self):
        summary = {
            "stock": 20,
            "bags_since_clean": 1,
            "days_since_clean": 7,
            "autonomy_days": 2,
        }
        result = alerts.active_alerts(
            summary, {**settings.DEFAULTS, "cleaning_days": 0, "low_autonomy_days": 0}
        )
        self.assertEqual(result, {})

    def test_persisted_deduplication_and_scheduled_reminders(self):
        previous = {"signature": "low_stock", "at": "2018-11-01T08:00:00+00:00"}
        self.assertFalse(
            alerts.delivery_due(
                previous, "low_stock", "2018-11-01T08:01:00+00:00", 3, True
            )
        )
        self.assertFalse(
            alerts.delivery_due(
                previous, "low_stock", "2018-11-05T08:00:00+00:00", 3, False
            )
        )
        self.assertTrue(
            alerts.delivery_due(
                previous, "low_stock", "2018-11-05T08:00:00+00:00", 3, True
            )
        )
        self.assertFalse(
            alerts.delivery_due(
                previous, "low_stock", "2018-11-05T08:00:00+00:00", 0, True
            )
        )
        self.assertTrue(
            alerts.delivery_due(
                previous,
                "cleaning_due,low_stock",
                "2018-11-01T08:01:00+00:00",
                3,
                False,
            )
        )

    def test_failed_target_has_backoff(self):
        previous = {"failed_at": "2018-11-01T08:00:00+00:00"}
        self.assertFalse(
            alerts.delivery_due(
                previous, "low_stock", "2018-11-01T08:10:00+00:00", 3, True
            )
        )
        self.assertTrue(
            alerts.delivery_due(
                previous, "low_stock", "2018-11-01T09:01:00+00:00", 3, True
            )
        )

    def test_settings_reject_unknown_target_or_structural_changes(self):
        current = {**settings.DEFAULTS, "name": "Test"}
        self.assertEqual(
            settings.validate_settings({"low_stock": "8"}, current, {"": "Local"})[
                "low_stock"
            ],
            8,
        )
        for payload in [
            {"notification_action": "notify.guessed"},
            {"currency": "USD"},
            {"estimate_window": "NaN"},
            {"notify_enabled": "yes"},
        ]:
            with (
                self.subTest(payload=payload),
                self.assertRaises((ValueError, TypeError)),
            ):
                settings.validate_settings(payload, current, {"": "Local"})
