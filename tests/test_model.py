"""Independent examples for valuation, dates, corrections and validation."""

import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "model", Path(__file__).parents[1] / "custom_components/pellet_tracker/model.py"
)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
TODAY = "2018-11-07"


def event(kind, quantity=0, price=None, day=TODAY, **extra):
    return model.validate(
        {"kind": kind, "quantity": quantity, "unit_price": price, "date": day, **extra},
        TODAY,
    )


def replay(*events):
    return model.calculate(
        [{**e, "id": str(i), "order": i} for i, e in enumerate(events)], TODAY
    )


class LedgerModelTests(unittest.TestCase):
    def test_monthly_fifo_uses_original_purchase_lots(self):
        data = replay(
            event("purchase", 10, 5, "2018-09-01"),
            event("purchase", 10, 7, "2018-10-01"),
            event("use", 12, day="2018-11-01"),
        )
        month = next(x for x in data["monthly"]["2018/2019"] if x["month"] == "2018-11")
        self.assertEqual((month["used"], month["cost"], month["spend"]), (12, 64, 0))
        self.assertEqual(sum(x["cost"] for x in data["monthly"]["2018/2019"]), 64)
        self.assertEqual(len(data["monthly"]["2018/2019"]), 12)
        self.assertTrue(data["monthly"]["2018/2019"][-1]["future"])

    def test_same_date_excludes_later_usage_and_handles_zero_baseline(self):
        data = replay(
            event("use", 4, day="2017-11-07", untracked=True),
            event("use", 9, day="2017-12-01", untracked=True),
            event("use", 2, untracked=True),
        )
        self.assertEqual(data["same_date"][-2]["used"], 4)
        self.assertEqual(data["usage_change_percent"], -50)

    def test_autonomy_requires_observation_and_expires_when_stale(self):
        data = replay(
            event("purchase", 43, 6.37, "2018-10-23"),
            event("start", day="2018-10-23"),
            event("use", 1, day="2018-10-25"),
            event("use", 1, day="2018-10-31"),
            event("use", 1, day="2018-11-04"),
            event("use", 1),
        )
        self.assertEqual((data["daily_rate"], data["autonomy_days"]), (0.25, 156))
        self.assertEqual(data["estimate_status"], "limited")
        events = [
            {**event("purchase", 30, 5, "2018-10-01"), "id": "p", "order": 0},
            *[
                {**event("use", 1, day=d), "id": d, "order": i + 1}
                for i, d in enumerate(["2018-10-02", "2018-10-04", "2018-10-07"])
            ],
        ]
        self.assertIsNone(model.calculate(events, TODAY)["autonomy_days"])
        self.assertIsNone(
            replay(event("purchase", 10), event("use", 1))["autonomy_days"]
        )

    def test_leap_day_same_date_and_january_boundary(self):
        raw = [
            {
                "id": "old",
                "order": 0,
                "kind": "use",
                "date": "2019-02-28",
                "quantity": "3",
                "unit_price": None,
                "untracked": True,
            },
            {
                "id": "new",
                "order": 1,
                "kind": "use",
                "date": "2020-02-29",
                "quantity": "2",
                "unit_price": None,
                "untracked": True,
            },
        ]
        data = model.calculate(raw, "2020-02-29")
        self.assertEqual(data["same_date"][0]["cutoff"], "2019-02-28")
        self.assertEqual(model.season_for("2018-01-01", 1), "2018/2019")

    def test_missing_purchase_history_and_stock_history(self):
        data = replay(
            event("note", day="2013-10-07", purchases_unknown=True),
            event("use", 2, day="2013-10-08", untracked=True),
            event("adjust", 10),
        )
        self.assertIsNone(data["seasons"]["2013/2014"]["spend"])
        self.assertIsNone(data["seasons"]["2013/2014"]["purchased"])
        self.assertEqual(data["stock_history"], [{"date": TODAY, "stock": 10}])

    def test_fifo_cross_season(self):
        data = replay(
            event("purchase", 10, "5.10", "2018-06-01"),
            event("purchase", 10, "7.20"),
            event("use", 12),
        )
        self.assertEqual(data["stock"], 8)
        self.assertEqual(data["stock_value"], 57.6)
        self.assertEqual(data["seasons"]["2018/2019"]["cost"], 65.4)
        self.assertEqual(data["seasons"]["2017/2018"]["spend"], 51)

    def test_weighted_mean_and_zero_price(self):
        data = replay(event("purchase", 10, 0), event("purchase", 30, 8))
        self.assertEqual(data["seasons"]["2018/2019"]["average_price"], 6)
        self.assertEqual(data["stock_value"], 240)

    def test_unknown_cost_is_not_zero(self):
        data = replay(event("adjust", 10), event("purchase", 20, 6), event("use", 12))
        s = data["seasons"]["2018/2019"]
        self.assertIsNone(s["cost"])
        self.assertEqual(s["cost_known"], 12)
        self.assertEqual(s["use_unpriced"], 10)
        self.assertEqual(data["stock_value"], 108)

    def test_unpriced_purchase_is_partial(self):
        data = replay(event("purchase", 10), event("purchase", 2, 5))
        s = data["seasons"]["2018/2019"]
        self.assertIsNone(s["spend"])
        self.assertEqual(s["spend_known"], 10)
        self.assertIsNone(data["stock_value"])

    def test_loss_separate_from_consumption(self):
        data = replay(event("purchase", 10, 5), event("loss", 1), event("use", 2))
        self.assertEqual(data["stock"], 7)
        s = data["seasons"]["2018/2019"]
        self.assertEqual(
            (s["used"], s["lost"], s["cost"], s["loss_cost_known"]), (2, 1, 10, 5)
        )

    def test_negative_stock_rejected_even_if_later_purchase(self):
        with self.assertRaises(ValueError):
            replay(event("use", 1, day="2018-10-01"), event("purchase", 10))

    def test_cleaning_and_historical_untracked(self):
        data = replay(
            event("use", 62, day="2013-05-02", untracked=True),
            event("adjust", 10),
            event("use", 1),
            event("clean"),
            event("use", 2),
        )
        self.assertEqual(
            (data["stock"], data["bags_since_clean"], data["days_since_clean"]),
            (7, 2, 0),
        )
        self.assertEqual(data["seasons"]["2012/2013"]["use_unpriced"], 62)

    def test_backdate_sorting_and_void(self):
        data = replay(event("use", 2), event("purchase", 10, 5, "2018-10-01"))
        self.assertEqual(data["stock"], 8)
        data = replay(event("purchase", 10, 5), {**event("use", 3), "voided": True})
        self.assertEqual(data["stock"], 10)

    def test_decimal_precision(self):
        data = replay(event("purchase", 3, "0.10"), event("use", 3))
        self.assertEqual(data["seasons"]["2018/2019"]["cost"], 0.3)

    def test_invalid_numbers(self):
        for value in ["NaN", "Infinity", True, -1, 0, "1.00001"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                event("purchase", value)

    def test_dates_seasons(self):
        self.assertEqual(model.season_for("2018-06-30"), "2017/2018")
        self.assertEqual(model.season_for("2018-07-01"), "2018/2019")
        with self.assertRaises(ValueError):
            event("clean", day="2018-11-08")
        with self.assertRaises(ValueError):
            event("note", season="2017/2019")

    def test_adjustment_and_start_date(self):
        data = replay(
            event("adjust", 20, 5),
            event("adjust", -2),
            event("start", day="2018-10-20"),
            event("start", day="2018-10-23"),
        )
        self.assertEqual((data["stock"], data["stock_value"]), (18, 90))
        self.assertEqual(data["seasons"]["2018/2019"]["first_start"], "2018-10-20")


if __name__ == "__main__":
    unittest.main()
