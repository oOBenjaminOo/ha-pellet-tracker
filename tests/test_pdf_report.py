"""Real PDF parsing checks against an independent report fixture."""

import importlib.util
import unittest
from copy import deepcopy
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).parents[1] / "custom_components/pellet_tracker"
spec = importlib.util.spec_from_file_location("pdf_report_test", ROOT / "pdf_report.py")
pdf_report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pdf_report)


def sample():
    season = {
        "used": 120,
        "purchased": 150,
        "spend": 825.5,
        "cost": None,
        "average_price": 5.5,
        "cleanings": 12,
        "first_start": "2018-10-05",
        "last_end": None,
        "heating_days": None,
        "heating_used": None,
        "budget": 1000,
        "budget_remaining": 174.5,
    }
    return {
        "name": "Poêle démonstration - François",
        "revision": 12,
        "report_date": "2018-11-08",
        "currency": "EUR",
        "settings": {"language": "fr"},
        "summary": {
            "season": "2018/2019",
            "seasons": {"2018/2019": season},
            "monthly": {
                "2018/2019": [
                    {
                        "month": "2018-10",
                        "used": 90,
                        "purchased": 100,
                        "spend": 550,
                        "cost": None,
                        "future": False,
                    },
                    {
                        "month": "2018-11",
                        "used": 30,
                        "purchased": 50,
                        "spend": 275.5,
                        "cost": None,
                        "future": False,
                    },
                    {
                        "month": "2018-12",
                        "used": 0,
                        "purchased": 0,
                        "spend": 0,
                        "cost": 0,
                        "future": True,
                    },
                ]
            },
            "price_comparisons": [],
        },
    }


class PdfReportTests(unittest.TestCase):
    def test_french_report_preserves_accents_unknown_prices_and_partial_season(self):
        snapshot = sample()
        original = deepcopy(snapshot)
        content = pdf_report.season_pdf(snapshot, "2018/2019")
        reader = PdfReader(BytesIO(content))
        text = "\n".join(p.extract_text() for p in reader.pages)
        self.assertGreaterEqual(len(reader.pages), 2)
        for expected in (
            "François",
            "Bilan de saison",
            "825,50 EUR",
            "Non renseigné",
            "provisoire",
            "Détail mensuel",
        ):
            self.assertIn(expected, text)
        self.assertNotIn("2018-12", text)
        self.assertEqual(snapshot, original)

    def test_english_report_and_user_markup_are_literal_not_executable(self):
        snapshot = sample()
        snapshot["settings"]["language"] = "en"
        snapshot["name"] = "<img src='https://example.invalid/private'>"
        reader = PdfReader(BytesIO(pdf_report.season_pdf(snapshot, "2018/2019")))
        text = "\n".join(p.extract_text() for p in reader.pages)
        for expected in (
            "Season report",
            "825.50 EUR",
            "Not provided",
            "img src=",
            "Monthly breakdown",
        ):
            self.assertIn(expected, text)
        self.assertFalse(any(page.get("/Annots") for page in reader.pages))

    def test_many_long_supplier_names_paginate_and_stay_limited(self):
        snapshot = sample()
        snapshot["summary"]["price_comparisons"] = [
            {
                "season": "2018/2019",
                "dimension": "supplier",
                "name": f"Fournisseur {i:02d} " + "Très long nom " * 12,
                "quantity": 100 - i,
                "average_price": None,
                "unknown_quantity": 3,
            }
            for i in range(25)
        ]
        reader = PdfReader(BytesIO(pdf_report.season_pdf(snapshot, "2018/2019")))
        text = "\n".join(p.extract_text() for p in reader.pages)
        self.assertIn("Fournisseur 09", text)
        self.assertNotIn("Fournisseur 10", text)
        self.assertGreaterEqual(len(reader.pages), 3)
