#!/usr/bin/env python3
"""Convert AI-generated portrait PNGs to web-optimized WebP for public/portraits/.

Owned by the artwork worker (scripts/art*). Reads deliverables/art-portraits/*.png,
writes public/portraits/{sokrates,aristoteles,epikur,kant,nietzsche,arendt,beauvoir,camus}.webp
and a 4x2 contact sheet for QA.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "deliverables" / "art-portraits"
DST = ROOT / "public" / "portraits"
PHILOSOPHERS = [
    "sokrates", "aristoteles", "epikur", "kant",
    "nietzsche", "arendt", "beauvoir", "camus",
]
WEBP_QUALITY = 86
WEBP_METHOD = 6


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    thumbs = []
    for name in PHILOSOPHERS:
        src = SRC / f"{name}.png"
        if not src.exists():
            raise SystemExit(f"missing source portrait: {src}")
        img = Image.open(src).convert("RGB")
        img.thumbnail((640, 640))
        out = DST / f"{name}.webp"
        img.save(out, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
        verify = Image.open(out)
        assert verify.size == (640, 640), f"unexpected size: {out} {verify.size}"
        print(f"{out.relative_to(ROOT)}  {verify.size}  {out.stat().st_size // 1024} KB")
        thumbs.append(img.resize((256, 256), Image.LANCZOS))

    # QA contact sheet (4x2) -- deliverables only, not shipped in public/
    sheet = Image.new("RGB", (4 * 256, 2 * 256), "#f5f1e8")
    for i, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((i % 4) * 256, (i // 4) * 256))
    sheet_out = SRC / "contact-sheet.jpg"
    sheet.save(sheet_out, "JPEG", quality=90)
    print(f"{sheet_out.relative_to(ROOT)}  contact sheet")


if __name__ == "__main__":
    main()
