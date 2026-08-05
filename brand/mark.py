# Renders the Adeorq mark from src/assets/adeorq.svg into the PNGs Discord asks
# for. Drawn four times the size and shrunk with LANCZOS, which is what gives
# the chamfers a clean edge; the counter is punched out as a hole, the way the
# SVG's evenodd fill rule does it.
from PIL import Image, ImageDraw

SIZE = 1024
SS = 4  # supersampling
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


def mark(frac):
    """The mark alone, RGBA, at `frac` of the canvas width."""
    side = SIZE * SS
    shape = Image.new("L", (side, side), 0)
    pen = ImageDraw.Draw(shape)
    pen.polygon(placed(OUTER, frac, side), fill=255)
    pen.polygon(placed(INNER, frac, side), fill=0)

    # The gradient runs across the mark's own height, as in the SVG.
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
    return out.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    import os

    here = r"C:\proyectos\Adeorq\brand"
    os.makedirs(here, exist_ok=True)

    clear = mark(0.84)
    clear.save(os.path.join(here, "adeorq-1024.png"))

    # Smaller inside its box, because Discord crops the app icon to a circle
    # and a mark that touches the edges loses its corners.
    on_dark = Image.new("RGBA", (SIZE, SIZE), BACKDROP + (255,))
    on_dark.alpha_composite(mark(0.72))
    on_dark.convert("RGB").save(os.path.join(here, "adeorq-discord-1024.png"))

    for name in ("adeorq-1024.png", "adeorq-discord-1024.png"):
        p = os.path.join(here, name)
        with Image.open(p) as im:
            print(f"{name}: {im.width}x{im.height} {im.mode} {os.path.getsize(p)//1024} KB")


if __name__ == "__main__":
    main()
