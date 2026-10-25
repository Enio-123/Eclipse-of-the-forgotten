"""Máscaras suaves (antisserrilhadas) de formas: polígonos, elipses e traços grossos."""
import numpy as np
from PIL import Image, ImageDraw

SS = 4


class Mask:
    """Desenha formas numa tela 4x maior e reduz, para bordas suaves."""

    def __init__(self, W, H):
        self.W, self.H = W, H
        self.img = Image.new('L', (W * SS, H * SS), 0)
        self.d = ImageDraw.Draw(self.img)

    def poly(self, pts, v=255):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=v)
        return self

    def ellipse(self, cx, cy, rx, ry, v=255):
        self.d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=v)
        return self

    def line(self, pts, w, v=255):
        self.d.line([(x * SS, y * SS) for x, y in pts], fill=v, width=max(1, int(w * SS)), joint='curve')
        r = w * 0.5
        for x, y in (pts[0], pts[-1]):
            self.d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=v)
        return self

    def rect(self, x0, y0, x1, y1, v=255):
        self.d.rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], fill=v)
        return self

    def array(self):
        small = self.img.resize((self.W, self.H), Image.BOX)
        return np.asarray(small, np.float32) / 255.0


def poly_mask(W, H, pts):
    return Mask(W, H).poly(pts).array()


def ellipse_mask(W, H, cx, cy, rx, ry):
    return Mask(W, H).ellipse(cx, cy, rx, ry).array()
