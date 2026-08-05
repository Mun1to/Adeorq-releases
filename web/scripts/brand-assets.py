# Generates the raster brand assets the website needs, from the same geometry
# the app's own mark uses (src/assets/adeorq.svg, drawn the way brand/mark.py
# draws it). Run it only when the mark itself changes:
#
#   python scripts/brand-assets.py
#
# Writes into web/assets/: favicon-32.png, favicon-180.png (Apple touch icon)
# and adeorq-512.png. The vector favicon.svg and adeorq.svg are hand written
# next to them and are not touched here.

import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "assets")

SS = 4  # supersampling, what gives the chamfers a clean edge
TOP, BOTTOM = (0x48, 0xC2, 0xFF), (0x2F, 0x9D, 0xF3)  # the SVG's gradient
BACKDROP = (0x10, 0x16, 0x24)  # --panel-solid, so it matches the app

# The mark's own box inside the 1024 viewBox.
BX, BY, BW, BH = 8, 112, 1008, 736

OUTER = [(236, 112), (788, 112), (1016, 756), (944, 848), (80, 848), (8, 756)]


def curve(p0, p1, p2, n=320):
    """The one quadratic in the path, walked as points."""
    out = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        out.append(
            (
                u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
            )
        )
    return out


INNER = [(512, 240), (712, 730)] + curve((712, 730), (512, 572), (312, 730))


def placed(pts, frac, side):
    """Viewbox coordinates to canvas ones, centred, at `frac` of the width."""
    s = side * frac / BW
    ox = (side - BW * s) / 2 - BX * s
    oy = (side - BH * s) / 2 - BY * s
    return [(x * s + ox, y * s + oy) for x, y in pts]


def mark(size, frac):
    """The mark alone, RGBA, at `frac` of the canvas width."""
    side = size * SS
    shape = Image.new("L", (side, side), 0)
    pen = ImageDraw.Draw(shape)
    pen.polygon(placed(OUTER, frac, side), fill=255)
    pen.polygon(placed(INNER, frac, side), fill=0)

    ys = [y for _, y in placed(OUTER, frac, side)]
    top, bottom = min(ys), max(ys)
    paint = Image.new("RGB", (side, side))
    fill = ImageDraw.Draw(paint)
    for y in range(side):
        t = min(1.0, max(0.0, (y - top) / (bottom - top)))
        fill.line(
            [(0, y), (side, y)],
            fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)),
        )

    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(paint, (0, 0), shape)
    return out.resize((size, size), Image.LANCZOS)


def on_panel(size, frac, radius_frac=0.22):
    """The mark on the app's panel colour, with the corners rounded."""
    side = size * SS
    plate = Image.new("RGBA", (side, side), BACKDROP + (255,))

    rounded = Image.new("L", (side, side), 0)
    ImageDraw.Draw(rounded).rounded_rectangle(
        [(0, 0), (side - 1, side - 1)], radius=int(side * radius_frac), fill=255
    )
    plate.putalpha(rounded)
    plate = plate.resize((size, size), Image.LANCZOS)

    plate.alpha_composite(mark(size, frac))
    return plate


def main():
    os.makedirs(OUT, exist_ok=True)

    jobs = [
        # A tab favicon is 16 px on screen: the mark needs the plate behind it
        # to survive a light theme, and room to breathe inside it.
        ("favicon-32.png", on_panel(32, 0.74)),
        ("favicon-180.png", on_panel(180, 0.70)),
        ("adeorq-512.png", mark(512, 0.84)),
    ]

    for name, image in jobs:
        path = os.path.join(OUT, name)
        image.save(path)
        print(f"{name}: {image.width}x{image.height} {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
