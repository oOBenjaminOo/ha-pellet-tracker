"""Money totals and end-of-heating summaries with independent expected values."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1] / "custom_components/pellet_tracker"
package = types.ModuleType("reports_test")
package.__path__ = [str(ROOT)]
sys.modules["reports_test"] = package
for name in ("model", "reports", "dashboard"):
    spec = importlib.util.spec_from_file_location(
        f"reports_test.{name}", ROOT / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
model = sys.modules["reports_test.model"]
reports = sys.modules["reports_test.reports"]
dashboard = sys.modules["reports_test.dashboard"]


def event(kind, day, qty=0, **kw):
    return {
        **model.validate(
            {"kind": kind, "date": day, "quantity": qty, **kw}, "2018-11-08"
        ),
        "id": f"{kind}{day}",
        "order": 0,
    }


class ReportTests(unittest.TestCase):
    def data(self, events, budgets=None):
        summary = model.calculate(events, "2018-11-08")
        return reports.enrich_summary(summary, events, budgets or {}, 7)

    def test_delivery_discount_affect_spending_fifo_and_weighted_comparison(self):
        events = [
            event(
                "purchase",
                "2018-10-01",
                10,
                unit_price=5,
                shipping=10,
                discount=5,
                supplier="Store A",
                brand="B",
            ),
            event(
                "purchase",
                "2018-10-02",
                20,
                unit_price=6,
                supplier=" store  a ",
                brand="B",
            ),
            event("use", "2018-10-03", 12),
        ]
        summary = self.data(events)
        self.assertEqual(summary["seasons"]["2018/2019"]["spend"], 175)
        self.assertEqual(summary["seasons"]["2018/2019"]["cost"], 67)
        row = next(
            x for x in summary["price_comparisons"] if x["dimension"] == "supplier"
        )
        self.assertEqual(row["quantity"], 30)
        self.assertAlmostEqual(row["average_price"], 175 / 30)
        self.assertEqual(row["min_price"], 5.5)

    def test_unknowns_never_become_free_and_budget_is_optional(self):
        events = [event("purchase", "2018-10-01", 10, supplier="Store A")]
        summary = self.data(events, {"2018/2019": "100"})
        season = summary["seasons"]["2018/2019"]
        self.assertIsNone(season["budget_remaining"])
        self.assertIsNone(summary["price_comparisons"][0]["average_price"])
        self.assertIsNone(self.data([])["seasons"]["2018/2019"]["budget"])
        with self.assertRaises(ValueError):
            event("purchase", "2018-10-01", 1, unit_price=2, discount=3)
        with self.assertRaises(ValueError):
            event("purchase", "2018-10-01", 1, shipping=3)

    def test_budget_zero_and_overrun_are_not_hidden(self):
        events = [event("purchase", "2018-10-01", 10, unit_price=5)]
        season = self.data(events, {"2018/2019": "40"})["seasons"]["2018/2019"]
        self.assertEqual(season["budget_remaining"], -10)
        self.assertEqual(season["budget_percent"], 125)
        season = self.data(events, {"2018/2019": "0"})["seasons"]["2018/2019"]
        self.assertEqual(season["budget_remaining"], -50)
        self.assertIsNone(season["budget_percent"])

    def test_heating_window_is_inclusive_and_distinct_from_accounting_season(self):
        events = [
            event("purchase", "2018-10-01", 10, unit_price=5),
            event("use", "2018-10-02", 1),
            event("start", "2018-10-03"),
            event("use", "2018-10-03", 2),
            event("end", "2018-10-04"),
            event("use", "2018-10-05", 1),
        ]
        season = self.data(events)["seasons"]["2018/2019"]
        self.assertEqual(season["heating_days"], 2)
        self.assertEqual(season["heating_used"], 2)
        self.assertEqual(season["heating_daily_rate"], 1)
        self.assertEqual(season["outside_heating_used"], 2)
        self.assertEqual(season["used"], 4)
        with self.assertRaises(ValueError):
            self.data([event("start", "2018-10-03"), event("end", "2018-10-02")])

    def test_english_card_preserves_entity_ids_and_translates_confirmations(self):
        card = dashboard.mushroom_card(
            "Poêle personnel",
            [
                {"key": key, "entity_id": entity, "available": True}
                for key, entity in {
                    "stock": "sensor.stock",
                    "used": "sensor.used",
                    "add_bag": "button.add",
                    "cleaning_due": "binary_sensor.clean",
                }.items()
            ],
            "en",
        )
        self.assertEqual(card["cards"][0]["title"], "Poêle personnel")
        self.assertEqual(card["cards"][1]["elements"][0]["entity"], "sensor.stock")
        self.assertEqual(
            card["cards"][-1]["cards"][0]["tap_action"]["confirmation"]["text"],
            "Add one bag to today’s consumption?",
        )
        metric = card["cards"][2]["cards"][0]
        self.assertEqual(metric["primary"], "Consumption")
        self.assertNotIn("replace('.', ',')", metric["secondary"])
        self.assertIn("Unavailable", metric["secondary"])

    def test_connected_mushroom_uses_distinct_images_and_today_confirmations(self):
        card = dashboard.mushroom_card(
            "Stove",
            [
                {"key": k, "entity_id": v, "available": True}
                for k, v in {
                    "stock": "sensor.stock",
                    "stove_status": "sensor.heating",
                    "add_bag": "button.add",
                    "clean": "button.clean",
                }.items()
            ],
        )
        headers = [c for c in card["cards"] if c["type"] == "conditional"]
        self.assertEqual(len(headers), 2)
        self.assertEqual(headers[0]["conditions"][0]["state"], "on")
        self.assertIn("unknown", headers[1]["conditions"][0]["state"])
        self.assertNotIn("on", headers[1]["conditions"][0]["state"])
        self.assertNotEqual(headers[0]["card"]["image"], headers[1]["card"]["image"])
        confirmations = [
            c["tap_action"]["confirmation"]["text"] for c in card["cards"][-1]["cards"]
        ]
        self.assertEqual(
            confirmations,
            [
                "Ajouter un sac à la consommation d’aujourd’hui ?",
                "Enregistrer un nettoyage pour aujourd’hui ?",
            ],
        )

    def test_mushroom_card_uses_registered_ids_and_never_calls_unknown_ok(self):
        card = dashboard.mushroom_card(
            "Stove",
            [
                {"key": k, "entity_id": v, "available": True}
                for k, v in {
                    "stock": "sensor.renamed",
                    "low_stock": "binary_sensor.low",
                    "add_bag": "button.add",
                }.items()
            ],
        )
        self.assertEqual(card["cards"][1]["elements"][0]["entity"], "sensor.renamed")
        chip = next(
            c for c in card["cards"] if c["type"] == "custom:mushroom-chips-card"
        )["chips"][0]
        self.assertIn("is_state(entity, 'off')", chip["content"])
        self.assertIn("Indisponible", chip["content"])
        self.assertIn("confirmation", card["cards"][-1]["cards"][0]["tap_action"])
