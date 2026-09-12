#!/usr/bin/env python3
"""Generate three A6 birthday gift cards (print, 300dpi) with centered QR code.

Outputs into deliverables/:
  gift-qr.png                      master QR PNG (black on white, quiet zone >= 4 modules)
  gift-card-1-klassische-kolonnade.{pdf,png}
  gift-card-2-modernistische-geometrie.{pdf,png}
  gift-card-3-sternennacht-wald.{pdf,png}
  gift-cards-3seiten.pdf           combined 3-page PDF (same A6 dimensions)

Every card PNG is rendered from its PDF at 300 dpi (1748x1240 landscape) and
verified with OpenCV: exact URL decode, center placement, square geometry and
quiet zone. Prints a JSON result block for evidence.
"""
import json
import math
import random
import sys
from pathlib import Path

import qrcode
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

ROOT = Path(__file__).resolve().parent.parent
DELIV = ROOT / "deliverables"
DELIV.mkdir(exist_ok=True)

URL = "https://philosophen.app.mintapis.com"
HEADLINE = "Alles Gute zum Geburtstag, Armin!"
SUB = "Ein Geschenk: Gespräche mit den großen Denkern"
HOST = "philosophen.app.mintapis.com"

# A6 landscape in pt (148 x 105 mm)
MM = 72 / 25.4
W, H = 148 * MM, 105 * MM
QR_SIDE = 120.0  # pt, incl. quiet zone
PANEL_SIDE = 136.0

INK = (0.098, 0.173, 0.161)        # #192c29
CREAM = (0.965, 0.945, 0.867)      # #f6f1de
GOLD = (0.690, 0.553, 0.227)       # #b08d3a
GOLD_LIGHT = (0.804, 0.675, 0.373)
TERRA = (0.714, 0.341, 0.239)      # #b6573d
NAVY = (0.051, 0.082, 0.141)       # #0d1524
STAR = (0.910, 0.769, 0.418)       # #e8c46a

# ---------------------------------------------------------------- QR content
qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H,
                   box_size=1, border=4)
qr.add_data(URL)
qr.make(fit=True)
MATRIX = qr.get_matrix()           # includes border (quiet zone)
N = len(MATRIX)
MOD = QR_SIDE / N                  # pt per module

qr_png = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H,
                       box_size=24, border=4)
qr_png.add_data(URL)
qr_png.make(fit=True)
qr_img = qr_png.make_image(fill_color="black", back_color="white")
qr_master_path = DELIV / "gift-qr.png"
qr_img.get_image().save(qr_master_path)


def draw_qr(c):
    """Vector QR, geometric center of the card, black on white quiet zone."""
    x0, y0 = (W - QR_SIDE) / 2, (H - QR_SIDE) / 2
    px0, py0 = (W - PANEL_SIDE) / 2, (H - PANEL_SIDE) / 2
    c.saveState()
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(1, 1, 1)
    c.roundRect(px0, py0, PANEL_SIDE, PANEL_SIDE, 7, stroke=0, fill=1)
    c.setFillColorRGB(0, 0, 0)
    for r, row in enumerate(MATRIX):
        for col, dark in enumerate(row):
            if dark:
                c.rect(x0 + col * MOD, y0 + (N - 1 - r) * MOD, MOD, MOD,
                       stroke=0, fill=1)
    c.restoreState()


def fit_size(text, font, max_size, max_w, min_size=9):
    s = max_size
    while stringWidth(text, font, s) > max_w and s > min_size:
        s -= 0.5
    return s


def headline(c, font, size, color, y=None):
    s = fit_size(HEADLINE, font, size, W - 2 * 20)
    c.setFont(font, s)
    c.setFillColorRGB(*color)
    c.drawCentredString(W / 2, y if y is not None else H - 62, HEADLINE)
    return s


def spaced(c, text, y, font, size, tracking, color):
    widths = [stringWidth(ch, font, size) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = (W - total) / 2
    c.setFont(font, size)
    c.setFillColorRGB(*color)
    for ch, wch in zip(text, widths):
        c.drawString(x, y, ch)
        x += wch + tracking


def sub(c, font, size, color, y):
    c.setFont(font, size)
    c.setFillColorRGB(*color)
    c.drawCentredString(W / 2, y, SUB)


def host(c, font, size, color, y=17.5):
    c.setFont(font, size)
    c.setFillColorRGB(*color)
    c.drawCentredString(W / 2, y, HOST)


# --------------------------------------------------------------- card themes
def card1(path):
    """Classical colonnade, cream / gold."""
    c = canvas.Canvas(str(path), pagesize=(W, H))
    c.setTitle("Gift Card 1 - Klassische Kolonnade")
    c.setFillColorRGB(*CREAM)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    # double gold frame
    c.setStrokeColorRGB(*GOLD)
    c.setLineWidth(1.4)
    c.rect(12, 12, W - 24, H - 24, stroke=1, fill=0)
    c.setLineWidth(0.55)
    c.rect(16.5, 16.5, W - 33, H - 33, stroke=1, fill=0)

    panel_l = (W - PANEL_SIDE) / 2
    panel_r = panel_l + PANEL_SIDE

    # architrave with triglyph ticks (split around the QR temple door)
    for x0, x1 in ((24, panel_l - 10), (panel_r + 10, W - 24)):
        c.setFillColorRGB(*(0.878, 0.812, 0.655))
        c.setStrokeColorRGB(*GOLD)
        c.setLineWidth(0.6)
        c.rect(x0, 192, x1 - x0, 9, stroke=1, fill=1)
        c.setStrokeColorRGB(*GOLD_LIGHT)
        c.setLineWidth(0.45)
        for x in list(range(int(x0) + 8, int(x1) - 6, 22)):
            for dx in (0, 2.2, 4.4):
                c.line(x + dx, 193.2, x + dx, 199.8)

    # columns flanking the QR door
    def column(cx):
        c.setFillColorRGB(*(0.906, 0.855, 0.706))
        c.setStrokeColorRGB(*GOLD)
        c.setLineWidth(0.6)
        c.rect(cx - 4.2, 36, 8.4, 152, stroke=1, fill=1)          # shaft
        c.setLineWidth(0.35)
        c.setStrokeColorRGB(*(0.75, 0.66, 0.45))
        c.line(cx - 1.7, 38, cx - 1.7, 186)                       # fluting
        c.line(cx + 1.7, 38, cx + 1.7, 186)
        c.setFillColorRGB(*(0.855, 0.792, 0.612))
        c.setStrokeColorRGB(*GOLD)
        c.setLineWidth(0.6)
        c.rect(cx - 7, 28.5, 14, 7.5, stroke=1, fill=1)           # base
        c.rect(cx - 6, 188, 12, 4.5, stroke=1, fill=1)            # capital
        c.rect(cx - 8, 192.5 if False else 186, 16, 0, stroke=0, fill=0)

    for cx in (48, 86, 124, W - 48, W - 86, W - 124):
        column(cx)

    spaced(c, "PHILOSOPHEN", H - 34, "Times-Roman", 9.5, 6, GOLD)
    headline(c, "Times-Bold", 25.5, INK, H - 60)
    c.setFont("Times-Italic", 10.5)
    c.setFillColorRGB(*(0.42, 0.33, 0.22))
    sub(c, "Times-Italic", 10.5, (0.42, 0.33, 0.22), H - 76)
    draw_qr(c)
    host(c, "Times-Roman", 7.5, (0.42, 0.33, 0.22), 20.5)
    c.showPage()
    c.save()


def card2(path):
    """Modernist geometry, terracotta / ink."""
    c = canvas.Canvas(str(path), pagesize=(W, H))
    c.setTitle("Gift Card 2 - Modernistische Geometrie")
    c.setFillColorRGB(*(0.973, 0.957, 0.914))
    c.rect(0, 0, W, H, stroke=0, fill=1)

    # ink circle top-right, terracotta circle left, gold concentric arcs
    c.setFillColorRGB(*INK)
    c.circle(W - 53, H * 0.48, 27, stroke=0, fill=1)
    c.setFillColorRGB(*TERRA)
    c.circle(0, H * 0.56, 58, stroke=0, fill=1)
    c.setFillColorRGB(*(0.98, 0.95, 0.90))
    c.circle(0, H * 0.56, 30, stroke=0, fill=1)
    c.setStrokeColorRGB(*GOLD)
    c.setLineWidth(1.1)
    for r in (62, 82, 102):
        c.circle(W + 12, -12, r, stroke=1, fill=0)
    # rotated ink square bottom-left + accents
    c.saveState()
    c.translate(52, 44)
    c.rotate(14)
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(1.6)
    c.rect(-13, -13, 26, 26, stroke=1, fill=0)
    c.restoreState()
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(2)
    c.line(96, 26, 136, 26)
    c.setFillColorRGB(*GOLD)
    for dx, dy in ((W - 150, 30), (W - 138, 30)):
        c.circle(dx, dy, 2.2, stroke=0, fill=1)
    # ink frame line
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(1.6)
    c.rect(13, 13, W - 26, H - 26, stroke=1, fill=0)

    spaced(c, "PHILOSOPHEN", H - 36, "Helvetica", 9.5, 6.5, TERRA)
    headline(c, "Helvetica-Bold", 26, INK, H - 62)
    sub(c, "Helvetica-Oblique", 10, (0.30, 0.30, 0.28), H - 77)

    # QR on white modernist panel with ink stroke; ensure square
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(2.0)
    px0, py0 = (W - PANEL_SIDE) / 2, (H - PANEL_SIDE) / 2
    c.roundRect(px0, py0, PANEL_SIDE, PANEL_SIDE, 4, stroke=1, fill=1)
    draw_qr(c)

    host(c, "Helvetica", 7.5, (0.30, 0.30, 0.28), 20.5)
    c.showPage()
    c.save()


def star4(c, x, y, r, color):
    c.setStrokeColorRGB(*color)
    c.setLineWidth(0.7)
    c.line(x - r, y, x + r, y)
    c.line(x, y - r, x, y + r)
    c.setFillColorRGB(*color)
    c.circle(x, y, r * 0.28, stroke=0, fill=1)


def card3(path):
    """Celestial night forest, navy / gold."""
    c = canvas.Canvas(str(path), pagesize=(W, H))
    c.setTitle("Gift Card 3 - Sternennacht Wald")
    c.setFillColorRGB(*NAVY)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    random.seed(7)
    px0, py0 = (W - PANEL_SIDE) / 2, (H - PANEL_SIDE) / 2
    for _ in range(64):
        x = random.uniform(20, W - 20)
        y = random.uniform(74, H - 18)
        # keep the QR panel and headline band clear
        in_panel = (px0 - 14 <= x <= px0 + PANEL_SIDE + 14 and
                    py0 - 14 <= y <= py0 + PANEL_SIDE + 14)
        in_headline = y > H - 84 and W / 2 - 150 < x < W / 2 + 150
        if in_panel or in_headline:
            continue
        bri = random.uniform(0.55, 1.0)
        colr = tuple(v * bri for v in STAR)
        if random.random() < 0.14:
            star4(c, x, y, random.uniform(2.4, 3.6), colr)
        else:
            c.setFillColorRGB(*colr)
            c.circle(x, y, random.uniform(0.5, 1.15), stroke=0, fill=1)

    # crescent moon + shooting star
    c.setFillColorRGB(*STAR)
    c.circle(46, H * .54, 15, stroke=0, fill=1)
    c.setFillColorRGB(*NAVY)
    c.circle(52.5, H * .54+3.5, 12.5, stroke=0, fill=1)
    c.setStrokeColorRGB(*(*[v * 0.9 for v in STAR],))
    c.setLineWidth(0.8)
    c.line(W - 74, H - 30, W - 40, H - 46)
    c.setFillColorRGB(*STAR)
    c.circle(W - 40, H - 46, 1.6, stroke=0, fill=1)

    # pine forest band
    c.setFillColorRGB(*(0.031, 0.051, 0.098))
    c.rect(0, 0, W, 17, stroke=0, fill=1)
    random.seed(11)
    x = 8.0
    while x < W + 10:
        h = random.uniform(30, 56)
        wdt = random.uniform(16, 24)
        shade = random.uniform(0.75, 1.2)
        base = (0.086 * shade, 0.133 * shade, 0.208 * shade)
        c.setFillColorRGB(*base)
        for k in range(3):
            hw = wdt * (0.55 + 0.22 * k)
            yb = 17 + h * 0.28 * k
            yt = 17 + h * (0.28 * k + 0.5)
            p = c.beginPath()
            p.moveTo(x - hw / 2, yb)
            p.lineTo(x + hw / 2, yb)
            p.lineTo(x, yt)
            p.close()
            c.drawPath(p, stroke=0, fill=1)
        if random.random() < 0.22:
            star4(c, x, 17 + h + 2.5, 2.6, STAR)
        x += random.uniform(22, 30)

    spaced(c, "PHILOSOPHEN", H - 36, "Times-Roman", 9.5, 6, STAR)
    headline(c, "Times-Bold", 25.5, STAR, H - 62)
    sub(c, "Times-Italic", 10.5, (0.83, 0.74, 0.55), H - 77)
    draw_qr(c)
    host(c, "Times-Roman", 7.5, (0.72, 0.65, 0.50), 20.5)
    c.showPage()
    c.save()


# --------------------------------------------------------------- build files
CARDS = [
    ("gift-card-1-klassische-kolonnade", card1),
    ("gift-card-2-modernistische-geometrie", card2),
    ("gift-card-3-sternennacht-wald", card3),
]

for name, fn in CARDS:
    fn(DELIV / f"{name}.pdf")

import pymupdf as fitz  # PyMuPDF

combined = fitz.open()
for name, _ in CARDS:
    src = fitz.open(DELIV / f"{name}.pdf")
    combined.insert_pdf(src)
combined.save(DELIV / "gift-cards-3seiten.pdf")

results = {"url": URL, "headline": HEADLINE, "qr_modules": N}

# render PNGs at 300dpi and verify
for name, _ in CARDS:
    doc = fitz.open(DELIV / f"{name}.pdf")
    page = doc[0]
    results[name] = {"pdf_pts": [round(page.rect.width, 2), round(page.rect.height, 2)]}
    zoom = 300 / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    png_path = DELIV / f"{name}.png"
    pix.save(png_path)
    from PIL import Image
    im = Image.open(png_path)
    if im.size != (1748, 1240):  # fitz may ceil by 1px -> crop centered
        ox = (im.width - 1748) // 2
        oy = (im.height - 1240) // 2
        im = im.crop((ox, oy, ox + 1748, oy + 1240))
    im.save(png_path, dpi=(300, 300))

    import cv2
    import numpy as np
    img = cv2.imread(str(png_path))
    data, pts, _ = cv2.QRCodeDetector().detectAndDecode(img)
    ok = data == URL and pts is not None
    entry = {"decoded": data, "ok": bool(ok), "size": [im.width, im.height], "dpi": 300}
    if pts is not None:
        q = pts[0]
        cx, cy = q[:, 0].mean(), q[:, 1].mean()
        sides = [math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1])
                 for i in range(4)]
        ratio = max(sides) / min(sides)
        x1, y1 = q[:, 0].min(), q[:, 1].min()
        x2, y2 = q[:, 0].max(), q[:, 1].max()
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        ring = max(int((x2 - x1) * 0.02), 14)
        roi = np.concatenate([g[max(int(y1) - ring, 0):int(y1)-2, int(x1):int(x2)].flatten(),
                              g[int(y2)+3:int(y2) + ring, int(x1):int(x2)].flatten(),
                              g[int(y1):int(y2), max(int(x1) - ring, 0):int(x1)-2].flatten(),
                              g[int(y1):int(y2), int(x2)+3:int(x2) + ring].flatten()])
        entry.update({
            "center_px": [round(float(cx), 1), round(float(cy), 1)],
            "center_off_px": round(math.hypot(cx - 874, cy - 620), 2),
            "square_side_ratio": round(ratio, 4),
            "quiet_zone_mean": round(float(roi.mean()), 1),
            "quiet_zone_min": int(roi.min()),
        })
        ok = ok and entry["center_off_px"] < 25 and 0.92 <= ratio <= 1.08 \
            and entry["quiet_zone_mean"] > 235 and entry["quiet_zone_min"] > 180
    entry["ok"] = bool(ok)
    results[name].update(entry)

results["combined_pages"] = len(fitz.open(DELIV / "gift-cards-3seiten.pdf"))
results["all_ok"] = all(results[n]["ok"] for n, _ in CARDS)
print(json.dumps(results, indent=2, ensure_ascii=False))
sys.exit(0 if results["all_ok"] else 1)
