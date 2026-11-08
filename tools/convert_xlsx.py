"""Convert the historical French tracker to a private, reviewable JSON import.

Usage: python tools/convert_xlsx.py source.xlsx private-import.json
Requires openpyxl only on the conversion machine, never in Home Assistant.
The output contains personal data and must not be committed to the repository.
"""

import argparse
import json
import re
from datetime import datetime
from pathlib import Path

import openpyxl


def convert(path):
    book = openpyxl.load_workbook(path, data_only=True)
    events = []
    inventory_started = False
    for sheet in reversed(book.worksheets):
        if not re.fullmatch(r"Suivie \d{2}-\d{2}", sheet.title):
            continue
        year = 2000 + int(sheet.title[7:9])
        season = f"{year}/{year + 1}"
        headers = {str(c.value).strip(): c.column for c in sheet[2] if c.value}
        stock_col = headers.get("Stock")
        restock_col = headers.get("Re Stock")
        clean_col = headers.get("Néttoyage", headers.get("Commentaire"))
        comment_col = headers.get("Commantaire", headers.get("Commentaire"))
        dated_rows = [
            r
            for r in range(3, sheet.max_row + 1)
            if isinstance(sheet.cell(r, 1).value, datetime)
        ]
        if not dated_rows:
            continue

        def append(
            row, kind, quantity=0, comment="", _season=season, _sheet=sheet, **extra
        ):
            events.append(
                {
                    "id": f"xlsx:{_season}:{row}:{kind}",
                    "kind": kind,
                    "date": _sheet.cell(row, 1).value.date().isoformat(),
                    "season": _season,
                    "quantity": quantity,
                    "unit_price": None,
                    "comment": comment,
                    **extra,
                }
            )

        if not restock_col:
            append(
                dated_rows[0],
                "note",
                comment="Achats non suivis dans le fichier source",
                purchases_unknown=True,
            )
        if stock_col and not inventory_started:
            opening = sheet.cell(1, stock_col).value
            if not isinstance(opening, (int, float)):
                raise ValueError(f"Missing opening stock in {sheet.title}")
            append(
                dated_rows[0],
                "adjust",
                opening,
                "Stock initial du suivi Excel ; prix inconnu",
            )
            inventory_started = True
        first = sheet["A1"].value
        for row in dated_rows:
            comment = (
                str(sheet.cell(row, comment_col).value or "") if comment_col else ""
            )
            clean_value = sheet.cell(row, clean_col).value if clean_col else None
            if not stock_col and sheet.max_column >= 4:
                additional = str(sheet.cell(row, 4).value or "")
                comment = " · ".join(x for x in [comment, additional] if x)
            cleaned = clean_value in ("Oui", "Néttoyage")
            if comment == "Néttoyage":
                comment = ""
            kinds = []
            if (
                isinstance(first, datetime)
                and sheet.cell(row, 1).value == first
                and not any(
                    e["kind"] == "start" and e["season"] == season for e in events
                )
            ):
                kinds.append("start")
            used = sheet.cell(row, 2).value
            restock = sheet.cell(row, restock_col).value if restock_col else None
            if isinstance(restock, (int, float)) and restock:
                append(row, "purchase", restock, comment)
            if isinstance(used, (int, float)) and used:
                append(
                    row,
                    "use",
                    used,
                    comment,
                    **({"untracked": True} if not stock_col else {}),
                )
            if cleaned:
                kinds.append("clean")
            if comment and not kinds and not used and not restock:
                kinds.append("note")
            for kind in kinds:
                append(row, kind, comment=comment)
    return {"schema_version": 1, "events": events}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    result = convert(args.source)
    args.destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        f"{len(result['events'])} operations converted. Review the private JSON before importing."
    )
