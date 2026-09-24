#!/usr/bin/env python3
"""
Turn the original photos in /photos into web-sized WebP files in /assets/img.

    pip install pillow
    python3 scripts/optimize-images.py

Add a new product: drop the photo in /photos, add a line to SOURCES below,
run the script, then add the product to assets/js/products.js.
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "photos"
OUT = ROOT / "assets" / "img"

# output name -> source file. The numbered photos (1.jpg, 2.jpg...) are the
# clean versions of the MP shots without the logo overlay, so they win.
SOURCES = {
    # Men · Panjabi
    "mp-038": "MP-038.jpg.jpeg",
    "mp-044": "MP-044.jpg.jpeg",
    "mp-081": "MP-081.jpg.jpeg",
    "mp-187": "MP-187.jpg.jpeg",
    "mp-189": "MP_189-01.jpg.jpeg",
    "mp-192": "MP-192.jpg.jpeg",
    "mp-196": "9.jpg",
    "mp-197": "8.jpg",
    "mp-198": "MP_198-01.jpg.jpeg",
    "mp-199": "MP-199.jpg.jpeg",
    "mp-202": "MP-202.jpg",
    "mp-206": "MP-206.jpg.jpeg",
    "mp-210": "MP-210.jpg.jpeg",
    "mp-215": "7.jpg",
    "mp-216": "5.jpg",
    "mp-221": "4.jpg",
    "mp-222": "3.jpg",
    "mp-223": "2.jpg",
    "mp-225": "1.jpg",
    "mp-226": "MP-226.jpg.jpg",
    # Women · Knitwear
    "wk-sky-1": "IMG_1355.jpg",
    "wk-fuchsia-1": "IMG_1374.jpg",
    "wk-ivory-1": "IMG_1391.jpg",
    "wk-ivory-2": "IMG_1399.jpg",
    "wk-ivory-3": "IMG_1415.jpg",
    "wk-rose-1": "IMG_1442.JPG",
    "wk-rose-2": "IMG_1444.JPG",
    "wk-cobalt-1": "IMG_1540.jpg",
    "wk-cobalt-2": "IMG_1530.jpg",
    "wk-lilac-1": "IMG_1577.jpg",
    "wk-lilac-2": "IMG_1581.jpg",
}

SIZES = {"lg": 1100, "sm": 520}  # target width for portrait shots


def save_variants(name, im):
    for suffix, width in SIZES.items():
        w, h = im.size
        if w > h:  # landscape: bound by height instead
            target = (round(w * (width * 1.5) / h), round(width * 1.5))
        else:
            target = (width, round(h * width / w))
        out = OUT / f"{name}-{suffix}.webp"
        im.resize(target, Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
        print(f"  {out.relative_to(ROOT)}  {target[0]}x{target[1]}  {out.stat().st_size // 1024} KB")


def logos():
    for src, name in (("Copy of Logo-White-5.1.2.1.png", "logo-white"),
                      ("Copy of Logo-Black-5.1.1.png", "logo-black")):
        im = Image.open(SRC / src).convert("RGBA")
        im = im.crop(im.split()[3].getbbox())
        full = im.copy()
        full.thumbnail((600, 600), Image.LANCZOS)
        full.save(OUT / f"{name}.png", optimize=True)
        # The H mark sits above the wordmark: find the transparent gap between them.
        alpha = im.split()[3]
        rows = [any(alpha.getpixel((x, y)) > 10 for x in range(0, im.width, 4)) for y in range(im.height)]
        gap = next(y for y in range(im.height // 4, im.height) if not rows[y])
        mark = im.crop((0, 0, im.width, gap))
        mark = mark.crop(mark.split()[3].getbbox())
        m = mark.copy()
        m.thumbnail((400, 400), Image.LANCZOS)
        m.save(OUT / f"{name}-mark.png", optimize=True)
        print(f"  {name}.png + {name}-mark.png")
    # favicon: white mark on the brand ink
    mark = Image.open(OUT / "logo-white-mark.png")
    fav = Image.new("RGBA", (256, 256), (14, 11, 10, 255))
    mark.thumbnail((170, 170), Image.LANCZOS)
    fav.alpha_composite(mark, ((256 - mark.width) // 2, (256 - mark.height) // 2))
    fav.save(OUT / "favicon.png")
    fav.resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png")


def og_image():
    """1200x630 social share card."""
    card = Image.new("RGB", (1200, 630), (14, 11, 10))
    shots = ["mp-223", "wk-rose-1", "mp-225", "wk-cobalt-1"]
    for i, n in enumerate(shots):
        im = Image.open(OUT / f"{n}-sm.webp").convert("RGB")
        im = ImageOps.fit(im, (300, 630), Image.LANCZOS)
        card.paste(im, (i * 300, 0))
    shade = Image.new("RGBA", (1200, 630), (14, 11, 10, 120))
    card = Image.alpha_composite(card.convert("RGBA"), shade)
    logo = Image.open(OUT / "logo-white.png")
    logo.thumbnail((360, 360), Image.LANCZOS)
    card.alpha_composite(logo, ((1200 - logo.width) // 2, (630 - logo.height) // 2))
    card.convert("RGB").save(OUT / "og.jpg", quality=85)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, src in SOURCES.items():
        print(name, "<-", src)
        save_variants(name, ImageOps.exif_transpose(Image.open(SRC / src)).convert("RGB"))
    logos()
    og_image()
    print("done")
