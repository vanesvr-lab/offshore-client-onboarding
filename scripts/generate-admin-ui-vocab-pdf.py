#!/usr/bin/env python3
"""
Generate a vocabulary + sizing reference PDF for the GWMS admin service detail
page (`/admin/services/[id]`). Used by Vanessa to refer to UI regions precisely
when requesting future design adjustments.
"""

from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)

OUT = Path(__file__).resolve().parent.parent / "docs" / "admin-ui-vocabulary.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

# ── Styles ────────────────────────────────────────────────────────────────────
ss = getSampleStyleSheet()

NAVY = colors.HexColor("#11254E")
ACCENT = colors.HexColor("#06629c")
LIGHT_BG = colors.HexColor("#F4F6FA")
GREY_TEXT = colors.HexColor("#475569")

title_style = ParagraphStyle(
    "title",
    parent=ss["Title"],
    fontName="Helvetica-Bold",
    fontSize=18,
    leading=22,
    textColor=NAVY,
    spaceAfter=4,
)
sub_style = ParagraphStyle(
    "sub",
    parent=ss["BodyText"],
    fontName="Helvetica",
    fontSize=9,
    leading=12,
    textColor=GREY_TEXT,
    spaceAfter=10,
)
h2_style = ParagraphStyle(
    "h2",
    parent=ss["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=12,
    leading=15,
    textColor=NAVY,
    spaceBefore=10,
    spaceAfter=6,
)
note_style = ParagraphStyle(
    "note",
    parent=ss["BodyText"],
    fontName="Helvetica-Oblique",
    fontSize=8,
    leading=11,
    textColor=GREY_TEXT,
    spaceBefore=4,
)
cell_style = ParagraphStyle(
    "cell",
    parent=ss["BodyText"],
    fontName="Helvetica",
    fontSize=8,
    leading=10,
    textColor=colors.black,
)
cell_bold = ParagraphStyle(
    "cell_bold",
    parent=cell_style,
    fontName="Helvetica-Bold",
)
cell_mono = ParagraphStyle(
    "cell_mono",
    parent=cell_style,
    fontName="Courier",
    fontSize=7.5,
    leading=10,
)


def P(text, style=cell_style):
    return Paragraph(text, style)


# ── Document setup ────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    str(OUT),
    pagesize=A4,
    leftMargin=14 * mm,
    rightMargin=14 * mm,
    topMargin=14 * mm,
    bottomMargin=14 * mm,
    title="Admin UI Vocabulary — Service Detail Page",
    author="GWMS Onboarding Portal",
)

story = []

# ── Page 1: Layout regions ────────────────────────────────────────────────────
story.append(Paragraph("Admin Service Detail Page — UI Vocabulary", title_style))
story.append(
    Paragraph(
        "Reference for naming regions when requesting design adjustments. "
        "Source page: <b>/admin/services/[id]</b>. Sizes are approximate, "
        "derived from Tailwind classes (default scale: <font face='Courier'>1 unit = 4&nbsp;px</font>).",
        sub_style,
    )
)

story.append(Paragraph("Layout regions (top → bottom)", h2_style))

# Header for region table
header_row = [
    P("Region name", cell_bold),
    P("What it is", cell_bold),
    P("Where on the page", cell_bold),
    P("Size / spacing", cell_bold),
]

regions = [
    # Sidebar
    [
        P("Sidebar"),
        P("Dark navy fixed left rail with portal title, nav, user footer."),
        P("Left edge, full height."),
        P("Width ≈ 224 px (<font face='Courier'>w-56</font>)."),
    ],
    [
        P("Portal title"),
        P("App brand: <i>Mauritius Offshore Client Portal</i>."),
        P("Top of sidebar."),
        P("Two-line wrap; padding ≈ 16 px."),
    ],
    [
        P("Primary nav"),
        P("Dashboard, Services, Profiles, Queue."),
        P("Upper sidebar group."),
        P("Item height ≈ 36 px."),
    ],
    [
        P("Settings nav group"),
        P("“SETTINGS” label + Templates, Verification Rules, Document Types, Due Diligence, Role Requirements, Knowledge Base, Workflow."),
        P("Lower sidebar group."),
        P("Items as above; group label uppercase 10 px."),
    ],
    [
        P("User footer"),
        P("Jane Doe / Administrator + logout."),
        P("Pinned bottom of sidebar."),
        P("Height ≈ 56 px."),
    ],
    # Main top area
    [
        P("Service title row"),
        P("Service number (“GBC-0002”) + service template name (“Global Business Corporation”) + description."),
        P("Top of main content."),
        P("H1 = 20 px bold; subtitle 14 px."),
    ],
    [
        P("Stage strip"),
        P("Salesforce-style chevron path: Draft ▸ In Progress ▸ Submitted ▸ In Review ▸ Verification ▸ Approved."),
        P("Below the title row, full width of main column."),
        P("Height = 36 px (<font face='Courier'>h-9</font>); 6 segments stretched <font face='Courier'>flex-1</font>."),
    ],
    [
        P("Step indicator"),
        P("Numbered breadcrumb: 1. Company Setup ▸ 2. Financial ▸ 3. Banking … with review-status pills."),
        P("Between the stage strip and the first section card."),
        P("Text 14 px; row height ≈ 32 px; chevron 14 px."),
    ],
    # Section cards
    [
        P("Section card"),
        P("Bordered Card for each step section (Company Setup, Financial, Banking, People &amp; KYC, Documents). Contains the section header pill + collapsible body."),
        P("Main content, left column, stacked vertically with 16 px gap."),
        P("Border 1 px gray-900; outer padding <font face='Courier'>px-5 py-4</font> = 20 / 16 px."),
    ],
    [
        P("Section header pill"),
        P("Blue (<font face='Courier'>#06629c</font>) bar inside the section card. Holds title + progress + % + status dot + Show/Hide."),
        P("Top of every section card."),
        P("Padding <font face='Courier'>px-3 py-1</font> = 12 / 4 px; text 14 px white; rounded 6 px."),
    ],
    [
        P("Mini progress bar"),
        P("Thin horizontal bar inside the header pill, fills RAG colour by %."),
        P("Right cluster of the section header pill."),
        P("96 × 6 px (<font face='Courier'>w-24 h-1.5</font>); hidden below <font face='Courier'>lg</font>."),
    ],
    [
        P("Status dot + label"),
        P("Coloured circle (●) + “Complete” / “Partial” / “Incomplete” (or override)."),
        P("Right of % number in the section header pill."),
        P("Dot 8 × 8 px (<font face='Courier'>h-2 w-2</font>); label 12 px."),
    ],
    [
        P("Show / Hide chevron"),
        P("Collapsible toggle for the section body."),
        P("Far right of the section header pill."),
        P("14 × 14 px (<font face='Courier'>h-3.5 w-3.5</font>)."),
    ],
    [
        P("Section review badge"),
        P("Approved / Flagged / Not reviewed pill."),
        P("Sibling to the right of the section card (inside row today; <i>moves outside in B-088</i>)."),
        P("Padding ≈ 4 / 6 px; text 11 px."),
    ],
    [
        P("Section review button"),
        P("Outlined “Review” button opening the inline review dialog."),
        P("Immediately right of the review badge."),
        P("Height ≈ 28 px; padding 6 / 10 px."),
    ],
    [
        P("Section body"),
        P("Collapsible content inside the section card (form fields, doc rows, profile pills, etc.)."),
        P("Directly below the section header pill when expanded."),
        P("Padding <font face='Courier'>pt-3 pb-4 px-5</font> = 12 / 16 / 20 px; top border 1 px."),
    ],
    # People & KYC specifics
    [
        P("Add-role action chips"),
        P("Outlined pill buttons: + Add Director, + Add Shareholder, + Add UBO."),
        P("Inside the People &amp; KYC section body, above the profile list."),
        P("Height ≈ 32 px; rounded 999 px (pill)."),
    ],
    [
        P("Profile pill"),
        P("Light-blue (<font face='Courier'>#7dbbe3</font>) row representing a person/organisation profile: icon + name + role chip + KYC% + Show/Hide."),
        P("Inside the People &amp; KYC section body."),
        P("Padding ≈ 12 / 4 px; rounded 6 px."),
    ],
    [
        P("Profile quick-action chips"),
        P("Portal access / Request KYC / Manage chips under the profile pill."),
        P("Directly below the profile pill on the row's background."),
        P("Height ≈ 28 px."),
    ],
    # Right rail
    [
        P("Right rail"),
        P("Sticky-ish column for service-wide info: status, owner, milestones, audit trail."),
        P("Right of the main column on <font face='Courier'>lg+</font>; stacks below on small screens."),
        P("Width = 1/3 of main grid (<font face='Courier'>lg:col-span-1</font>)."),
    ],
    [
        P("Status panel"),
        P("“STATUS” label + current state badge + select to change status."),
        P("Top of the right rail."),
        P("Card padding 16 px."),
    ],
    [
        P("Account Service Owner panel"),
        P("Owner select / — Unassigned —."),
        P("Right rail, below status."),
        P("Card padding 16 px."),
    ],
    [
        P("Milestones panel"),
        P("Collapsible. Items: LOE Received, Invoice Sent, Payment Received with date inputs."),
        P("Right rail, mid."),
        P("Header height ≈ 44 px; item row ≈ 36 px."),
    ],
    [
        P("Milestone item"),
        P("Icon + label + date input (or empty state)."),
        P("Row inside the Milestones panel."),
        P("Date input width ≈ 130 px."),
    ],
    [
        P("Audit Trail panel"),
        P("Collapsible. Filters (By user / Action) + chronological event list."),
        P("Right rail, bottom."),
        P("Card padding 16 px."),
    ],
]

t = Table(
    [header_row, *regions],
    colWidths=[36 * mm, 65 * mm, 45 * mm, 35 * mm],
    repeatRows=1,
)
t.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )
)
story.append(t)

story.append(
    Paragraph(
        "<b>Tip — how to request an adjustment.</b> Name the region first, then "
        "the dimension you want to change, then the direction. e.g. “Make the "
        "<i>section header pill</i> ~25&nbsp;% thicker on desktop”, or “Reduce the gap "
        "between <i>section cards</i> from 16&nbsp;px to 8&nbsp;px”.",
        note_style,
    )
)

story.append(PageBreak())

# ── Page 2: Sizing cheat sheet ────────────────────────────────────────────────
story.append(Paragraph("Quick size cheat sheet", h2_style))
story.append(
    Paragraph(
        "Tailwind uses a <font face='Courier'>1 unit = 4 px</font> spacing scale "
        "(<font face='Courier'>py-1</font> = 4 px each side; "
        "<font face='Courier'>py-4</font> = 16 px each side). Text sizes use the "
        "default <font face='Courier'>text-xs</font> 12 px / <font face='Courier'>text-sm</font> 14 px / "
        "<font face='Courier'>text-base</font> 16 px scale. All sizes below are the "
        "live values rendered on desktop (<font face='Courier'>lg</font> breakpoint).",
        sub_style,
    )
)

size_header = [
    P("Element", cell_bold),
    P("Tailwind classes (key)", cell_bold),
    P("Pixel size", cell_bold),
]

size_rows = [
    [P("Page outer column gap"), P("gap-6", cell_mono), P("24 px")],
    [P("Section card stack gap"), P("space-y-4", cell_mono), P("16 px")],
    [P("Section card outer row padding"), P("px-5 py-4", cell_mono), P("20 / 16 px")],
    [P("Section header pill padding"), P("px-3 py-1", cell_mono), P("12 / 4 px")],
    [P("Section header pill text"), P("text-sm font-medium", cell_mono), P("14 px / 500 wt")],
    [P("Mini progress bar"), P("w-24 h-1.5", cell_mono), P("96 × 6 px")],
    [P("Status dot"), P("h-2 w-2", cell_mono), P("8 × 8 px")],
    [P("Show / Hide chevron"), P("h-3.5 w-3.5", cell_mono), P("14 × 14 px")],
    [P("Stage strip (chevron banner)"), P("h-9 (SVG)", cell_mono), P("36 px tall, segments stretch")],
    [P("Step indicator chevron sep."), P("size-3.5", cell_mono), P("14 px")],
    [P("Section body padding"), P("pt-3 pb-4 px-5", cell_mono), P("12 / 16 / 20 px")],
    [P("Profile pill padding"), P("px-3 py-1", cell_mono), P("12 / 4 px")],
    [P("Right rail panel padding"), P("p-4 (CardContent default)", cell_mono), P("16 px")],
    [P("Sidebar width"), P("w-56 (approx)", cell_mono), P("224 px")],
]

t2 = Table(
    [size_header, *size_rows],
    colWidths=[60 * mm, 55 * mm, 35 * mm],
    repeatRows=1,
)
t2.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )
)
story.append(t2)

story.append(Spacer(1, 6 * mm))

story.append(Paragraph("Useful phrasing templates", h2_style))
story.append(
    Paragraph(
        "• <b>Resize an element</b> &mdash; “Change the <i>section header pill</i> "
        "padding from <font face='Courier'>py-1</font> to <font face='Courier'>py-3</font> "
        "(4 px → 12 px each side) on desktop. Mobile unchanged.”<br/>"
        "• <b>Adjust spacing</b> &mdash; “Reduce the <i>section card stack gap</i> from "
        "16 px to 8 px so the page feels denser.”<br/>"
        "• <b>Reposition</b> &mdash; “Move the <i>section review badge + button</i> "
        "outside the section card so they sit on the page background to the right.”<br/>"
        "• <b>Re-style without resize</b> &mdash; “Keep the <i>section header pill</i> "
        "size; change its background to brand-navy and the title to white.”",
        cell_style,
    )
)

# ── Build ─────────────────────────────────────────────────────────────────────
doc.build(story)
print(f"Wrote {OUT}")
