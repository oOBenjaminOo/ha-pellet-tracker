"""Local, paginated season PDF; user text is escaped and missing prices stay unknown."""

from io import BytesIO
from pathlib import Path
from threading import Lock
from xml.sax.saxutils import escape

import reportlab
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

_FONT_LOCK = Lock()


def season_pdf(snapshot, season):
    """Render an immutable exported snapshot, never alter journal/settings."""
    language = snapshot["settings"].get("language", "fr")
    fr = language == "fr"
    summary = snapshot["summary"]
    result = summary["seasons"][season]
    currency = snapshot["currency"]
    with _FONT_LOCK:
        if "PelletSans" not in pdfmetrics.getRegisteredFontNames():
            fonts = Path(reportlab.__file__).parent / "fonts"
            pdfmetrics.registerFont(TTFont("PelletSans", str(fonts / "Vera.ttf")))
            pdfmetrics.registerFont(TTFont("PelletSansBold", str(fonts / "VeraBd.ttf")))
    ink = colors.HexColor("#1d2834")
    muted = colors.HexColor("#627181")
    accent = colors.HexColor("#d87820")
    body = ParagraphStyle(
        "body",
        fontName="PelletSans",
        fontSize=9,
        leading=14,
        textColor=ink,
        spaceAfter=7,
    )
    heading = ParagraphStyle(
        "heading",
        parent=body,
        fontName="PelletSansBold",
        fontSize=14,
        leading=19,
        spaceBefore=16,
        spaceAfter=11,
    )
    title = ParagraphStyle(
        "title", parent=heading, fontSize=25, leading=32, spaceBefore=0, spaceAfter=12
    )
    note = ParagraphStyle("note", parent=body, fontSize=8, leading=12, textColor=muted)

    def tr(french, english):
        return french if fr else english

    def para(value, style=body):
        return Paragraph(escape(str(value)), style)

    def number(value, money=False):
        if value is None:
            return tr("Non renseigné", "Not provided")
        value = f"{value:,.2f}" if money else f"{value:,.2f}".rstrip("0").rstrip(".")
        if fr:
            value = value.replace(",", " ").replace(".", ",")
        return value + (" " + currency if money else "")

    def day(value):
        return (
            "/".join(value.split("-")[::-1])
            if value
            else tr("Non renseigné", "Not provided")
        )

    def table(rows, widths, header=True):
        converted = [[para(cell) for cell in row] for row in rows]
        grid = Table(
            converted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT"
        )
        commands = [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            (
                "ROWBACKGROUNDS",
                (0, 1 if header else 0),
                (-1, -1),
                [colors.HexColor("#f4f6f8"), colors.white],
            ),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#dfe5ea")),
        ]
        if header:
            commands.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8edf1")))
        grid.setStyle(TableStyle(commands))
        return grid

    output = BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=60,
        bottomMargin=45,
        title=f"Pellet Tracker - {season}",
        author="Pellet Tracker",
    )
    width = A4[0] - 80
    story = [
        para(tr("Bilan de saison", "Season report"), title),
        para(snapshot["name"], heading),
        para(season, heading),
        para(
            tr("Données arrêtées au ", "Recorded data as of ")
            + day(snapshot.get("report_date"))
            + " · "
            + tr("Révision ", "Revision ")
            + str(snapshot["revision"]),
            note,
        ),
    ]
    if season == summary["season"]:
        story.append(
            para(
                tr(
                    "Saison en cours : ce bilan est provisoire.",
                    "Season in progress: this report is provisional.",
                ),
                note,
            )
        )
    story.append(
        para(tr("Consommation et achats", "Consumption and purchases"), heading)
    )
    rows = [
        [tr("Sacs consommés", "Bags used"), number(result["used"])],
        [tr("Sacs achetés", "Bags purchased"), number(result["purchased"])],
        [tr("Dépenses d’achat", "Purchase spending"), number(result["spend"], True)],
        [
            tr("Coût des sacs consommés (FIFO)", "Cost of consumed bags (FIFO)"),
            number(result["cost"], True),
        ],
        [
            tr("Prix moyen d’achat par sac", "Average purchase price per bag"),
            number(result["average_price"], True),
        ],
        [
            tr("Nettoyages enregistrés", "Recorded cleanings"),
            number(result["cleanings"]),
        ],
    ]
    story.append(table(rows, [width * 0.64, width * 0.36], False))
    story.append(para(tr("Période de chauffe", "Heating period"), heading))
    story.append(
        table(
            [
                [tr("Premier allumage", "First lighting"), day(result["first_start"])],
                [
                    tr("Dernier jour de chauffe", "Last heating day"),
                    day(result.get("last_end")),
                ],
                [
                    tr("Durée (jours)", "Duration (days)"),
                    number(result.get("heating_days")),
                ],
                [
                    tr("Sacs pendant la chauffe", "Bags during heating"),
                    number(result.get("heating_used")),
                ],
            ],
            [width * 0.64, width * 0.36],
            False,
        )
    )
    if result.get("budget") is not None:
        story.append(para(tr("Budget facultatif", "Optional budget"), heading))
        story.append(
            para(
                tr("Budget : ", "Budget: ")
                + number(result["budget"], True)
                + " · "
                + tr("Restant : ", "Remaining: ")
                + number(result.get("budget_remaining"), True)
            )
        )
    story.append(Spacer(1, 8))
    story.append(
        para(
            tr(
                "Les prix manquants restent inconnus. Les dépenses d’achat et le coût FIFO des sacs consommés sont deux mesures distinctes. La période de chauffe ne remet pas le stock à zéro.",
                "Missing prices remain unknown. Purchase spending and the FIFO cost of consumed bags are distinct measures. Heating dates do not reset stock.",
            ),
            note,
        )
    )
    story.append(PageBreak())
    story.append(para(tr("Détail mensuel", "Monthly breakdown"), title))
    rows = [
        [
            tr("Mois", "Month"),
            tr("Consommés", "Used"),
            tr("Achetés", "Purchased"),
            tr("Dépenses", "Spending"),
            tr("Coût FIFO", "FIFO cost"),
        ]
    ]
    for row in summary.get("monthly", {}).get(season, []):
        if not row.get("future"):
            rows.append(
                [
                    row["month"],
                    number(row["used"]),
                    number(row["purchased"]),
                    number(row["spend"], True),
                    number(row["cost"], True),
                ]
            )
    story.append(
        table(
            rows, [width * 0.16, width * 0.16, width * 0.16, width * 0.26, width * 0.26]
        )
    )
    for dimension, french, english in (
        ("supplier", "Fournisseurs", "Suppliers"),
        ("brand", "Marques", "Brands"),
    ):
        groups = [
            g
            for g in summary.get("price_comparisons", [])
            if g["season"] == season and g["dimension"] == dimension
        ]
        groups.sort(key=lambda g: (-g["quantity"], g["name"].casefold()))
        if not groups:
            continue
        story.append(para(tr(french, english), heading))
        story.append(
            para(
                tr(
                    "Les 10 principaux, classés par quantité. Moyennes pondérées, livraison et remises incluses.",
                    "Top 10 by quantity. Weighted averages include delivery and discounts.",
                ),
                note,
            )
        )
        rows = [
            [
                tr("Nom", "Name"),
                tr("Sacs", "Bags"),
                tr("Prix moyen", "Average price"),
                tr("Sans prix", "Unpriced"),
            ]
        ]
        for group in groups[:10]:
            name = group["name"]
            if name == "Non renseigné":
                name = tr("Non renseigné", "Not provided")
            rows.append(
                [
                    name,
                    number(group["quantity"]),
                    number(group["average_price"], True),
                    number(group["unknown_quantity"]),
                ]
            )
        story.append(
            table(rows, [width * 0.43, width * 0.15, width * 0.27, width * 0.15])
        )

    def frame(canvas, document):
        canvas.saveState()
        canvas.setFillColor(ink)
        canvas.rect(0, A4[1] - 37, A4[0], 37, fill=1, stroke=0)
        canvas.setFont("PelletSansBold", 10)
        canvas.setFillColor(colors.white)
        canvas.drawString(40, A4[1] - 24, "PELLET TRACKER")
        canvas.setFillColor(accent)
        canvas.rect(0, A4[1] - 40, A4[0], 3, fill=1, stroke=0)
        canvas.setFillColor(muted)
        canvas.setFont("PelletSans", 8)
        canvas.drawString(40, 24, season + " · " + tr("Journal local", "Local journal"))
        canvas.drawRightString(A4[0] - 40, 24, str(document.page))
        canvas.restoreState()

    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    return output.getvalue()
