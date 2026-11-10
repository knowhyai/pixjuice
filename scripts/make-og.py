#!/usr/bin/env python3
"""Generate public/og.png (1200x630) — the share preview card.

Pure pixel-art: every element is drawn on an integer grid with flat rectangles
(no fonts, no anti-aliasing, no scaling blur). Rerun after edits:
    python3 scripts/make-og.py
"""

from pathlib import Path

from PIL import Image

W, H = 1200, 630
BG = "#0b0a10"        # site background
INK = "#f4f2fb"       # near-white text
ACCENT = "#ff4d6d"    # brand accent (PixJuice half of the logo)
ACCENT_DARK = "#d63a58"
PINK_HI = "#ffd9e0"   # droplet highlight
CYAN = "#4cd7ff"      # sparkle cyan (favicon sparks)
DIM = "#a9a4bd"       # subtitle gray
FAINT = "#6f6a85"     # footer-line gray
TEXTURE = "#12101a"   # background dither

# The PixJuice mark from the header SVG / favicon (16x16): (x, y, w, h, color).
MARK = [
    (7, 1, 2, 2, ACCENT),
    (6, 3, 4, 2, ACCENT),
    (5, 5, 6, 1, ACCENT),
    (4, 6, 8, 3, ACCENT),
    (5, 9, 6, 1, ACCENT_DARK),
    (6, 10, 4, 1, ACCENT_DARK),
    (7, 11, 2, 1, ACCENT_DARK),
    (6, 5, 2, 2, PINK_HI),
    (12, 2, 2, 2, CYAN),
    (11, 1, 1, 1, CYAN),
    (14, 4, 1, 1, CYAN),
]

# Hand-drawn 5x7 pixel font (no bundled font files — keeps the asset self-contained).
FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
    "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
}


def px(img, x, y, s, color):
    img.paste(color, (x, y, x + s, y + s))


def text(img, x, y, s, string, color_fn):
    """Draw `string` at pixel scale `s`; color_fn(char_index) -> color."""
    for i, ch in enumerate(string):
        rows = FONT[ch]
        for ry, row in enumerate(rows):
            for rx, bit in enumerate(row):
                if bit == "1":
                    px(img, x + (i * 6 + rx) * s, y + ry * s, s, color_fn(i))
    return x + (len(string) * 6 - 1) * s


def text_width(s, n):
    return (n * 6 - 1) * s


def main():
    img = Image.new("RGB", (W, H), BG)

    # Subtle checkerboard dither so the dark field isn't a flat void.
    step = 24
    for gy in range(0, H, step):
        for gx in range(0, W, step):
            if (gx // step + gy // step) % 2 == 0:
                px(img, gx, gy, 6, TEXTURE)

    # Corner brackets (accent L-shapes).
    b, t = 28, 6
    for cx, cy, dx, dy in ((b, b, 1, 1), (W - b, b, -1, 1), (b, H - b, 1, -1), (W - b, H - b, -1, -1)):
        for i in range(6):
            px(img, cx + dx * i * t, cy, t, ACCENT if i < 4 else ACCENT_DARK)
            px(img, cx, cy + dy * i * t, t, ACCENT if i < 4 else ACCENT_DARK)

    # The droplet mark, 16x16 at 20x = 320x320, left side.
    m, ms = 20, 20  # origin (col 20 = x 400px), scale 20
    for rx, ry, rw, rh, color in MARK:
        img.paste(color, (m + rx * ms, 155 + ry * ms, m + rx * ms + rw * ms, 155 + ry * ms + rh * ms))

    # Sparkles around the droplet: plus-shapes and lone pixels.
    def sparkle(cx, cy, r, s, color):
        px(img, cx - r * s, cy, s, color)
        px(img, cx + r * s, cy, s, color)
        px(img, cx, cy - r * s, s, color)
        px(img, cx, cy + r * s, s, color)
        px(img, cx, cy, s, color)

    sparkle(500, 130, 1, 10, CYAN)
    sparkle(760, 500, 1, 8, PINK_HI)
    sparkle(1080, 140, 1, 10, ACCENT)
    sparkle(60, 560, 1, 8, CYAN)
    for x, y, s, c in ((560, 90, 8, DIM), (940, 560, 8, DIM), (700, 560, 6, FAINT), (1130, 320, 8, DIM)):
        px(img, x, y, s, c)

    # Right block: title / subtitle / tagline, left-aligned at x=500.
    tx = 500
    # PIXJUICE — PIX in ink, JUICE in accent; scale 12 (60x84 per glyph).
    text(img, tx, 190, 12, "PIX", lambda _: INK)
    text(img, tx + text_width(12, 3) + 12 * 2, 190, 12, "JUICE", lambda _: ACCENT)
    # Accent underline tucked under the title.
    img.paste(ACCENT, (tx, 296, tx + 36, 299))
    img.paste(ACCENT_DARK, (tx + 36, 296, tx + 48, 299))
    # Subtitle.
    text(img, tx, 336, 5, "PIXEL ART VFX MAKER", lambda _: DIM)
    # Tagline.
    text(img, tx, 412, 3, "244 EFFECTS - FREE - IN YOUR BROWSER", lambda _: FAINT)

    out = Path(__file__).resolve().parent.parent / "public" / "og.png"
    out.parent.mkdir(exist_ok=True)
    img.save(out, "PNG", optimize=True)
    print(f"wrote {out} ({W}x{H}, {out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
