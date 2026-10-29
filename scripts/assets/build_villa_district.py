"""
TerraCity — showcase garden-district asset (Blender, reproducible).

Builds ONE homes-tile neighbourhood — six detached Mediterranean villas on
hedged parcels along a residential street — in three architectural eras that
share the same parcels and the same houses:

  era-0  2026  traditional homes, terracotta roofs, lawns, one small PV array
  era-1  2035  eco-retrofit: PV on most south slopes, larger glazing with timber
               louvres, shaded pergolas, mixed planting, cycle lane
  era-2  2050  integrated solar roofs, green flat roofs, batteries, EV charging,
               rain cisterns, xeric gardens, mature trees, street bioswale

Everything (geometry, texture atlas, baked ambient occlusion) is generated here
from code with a fixed seed — no external assets, no Cycles bake. Output:
public/models/villa-district.glb with three root nodes era-0/1/2, each ONE
mesh with ONE material (texture atlas + vertex colour = tint x baked AO).

Units: authored in board millimetres (tile = 60 mm, model extent +-26.5 mm),
exported in metres. Blender Z-up / -Y = south = toward the player.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P scripts/assets/build_villa_district.py -- public/models
"""
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT_DIR = os.path.abspath(ARGS[0] if ARGS else "public/models")
SEED = 2050

# ----------------------------------------------------------------- atlas --

ATLAS = 512
GRID = 4
CELL_PX = ATLAS // GRID
# Neighbouring cells have similar tones so low mip levels bleed gently.
CELLS = [
    "stucco", "plain", "stone", "paving",
    "terracotta", "timber", "soil", "gravel",
    "lawn", "foliage", "greenroof", "canvas",
    "pv", "glass", "asphalt", "water",
]
ROUGH = {"pv": 0.32, "glass": 0.12, "water": 0.08, "asphalt": 0.95, "canvas": 0.8}
# World size (mm) one cell spans; faces larger than this clamp.
CELL_MM = {
    "stucco": 16, "plain": 16, "stone": 16, "paving": 24,
    "terracotta": 18, "timber": 12, "soil": 24, "gravel": 30,
    "lawn": 30, "foliage": 10, "greenroof": 16, "canvas": 12,
    "pv": 10, "glass": 6, "asphalt": 60, "water": 12,
}
INSET = 0.07


def _up(grid, size):
    n = grid.shape[0] - 1
    xs = np.linspace(0, n, size, endpoint=False)
    i = xs.astype(int)
    f = xs - i
    f = f * f * (3 - 2 * f)
    a = grid[np.ix_(i, i)]
    b = grid[np.ix_(i, i + 1)]
    c = grid[np.ix_(i + 1, i)]
    d = grid[np.ix_(i + 1, i + 1)]
    fy = f[:, None]
    fx = f[None, :]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def fbm(rs, size, octaves=((4, 0.5), (8, 0.25), (16, 0.15), (32, 0.1))):
    out = sum(a * _up(rs.random((f + 1, f + 1)), size) for f, a in octaves)
    return out / sum(a for _, a in octaves)


def _rgb(base, shade):
    return np.clip(np.array(base)[None, None, :] * shade[:, :, None], 0, 1)


def make_cell(name, rs):
    S = CELL_PX
    y, x = np.mgrid[0:S, 0:S]
    n = fbm(rs, S)
    speck = rs.random((S, S))
    if name == "stucco":
        return _rgb((0.95, 0.93, 0.89), 0.93 + 0.08 * n + 0.03 * (speck - 0.5))
    if name == "plain":
        return _rgb((0.97, 0.97, 0.96), 0.98 + 0.02 * n)
    if name == "stone":
        shade = np.zeros((S, S))
        row_h = 16
        for r0 in range(0, S, row_h):
            xs, off = [], rs.integers(0, 20)
            pos = -off
            while pos < S:
                w = rs.integers(18, 40)
                xs.append((pos, pos + w, 0.82 + 0.3 * rs.random()))
                pos += w
            for a, b, s in xs:
                shade[r0 : r0 + row_h, max(a, 0) : max(min(b, S), 0)] = s
                if 0 <= a < S:
                    shade[r0 : r0 + row_h, a : a + 2] = 0.6
            shade[r0 : r0 + 2, :] = 0.6
        return _rgb((0.84, 0.76, 0.62), shade * (0.92 + 0.12 * n))
    if name == "paving":
        joint = ((x % 32) < 2) | ((y % 32) < 2)
        tile = rs.random((S // 32 + 1, S // 32 + 1))[y // 32, x // 32]
        return _rgb((0.88, 0.85, 0.78), np.where(joint, 0.72, 0.92 + 0.1 * tile) * (0.95 + 0.08 * n))
    if name == "terracotta":
        row = 12
        t = (y % row) / row
        jit = rs.random((S // row + 1, (S + (S // row) * 5) // 10 + 2))[y // row, (x + (y // row) * 5) // 10]
        ripple = 0.9 + 0.1 * np.sin(2 * np.pi * (x + (y // row) * 5) / 10)
        shade = (0.72 + 0.32 * t) * ripple * (0.86 + 0.26 * jit)
        return _rgb((0.84, 0.44, 0.27), shade * (0.97 + 0.08 * n))
    if name == "timber":
        grain = 0.86 + 0.12 * np.sin(y * 0.9 + 7 * n)
        planks = np.where((y % 16) < 1, 0.7, 1.0)
        return _rgb((0.58, 0.41, 0.27), grain * planks)
    if name == "soil":
        return _rgb((0.46, 0.35, 0.25), 0.8 + 0.4 * n + 0.08 * (speck - 0.5))
    if name == "gravel":
        return _rgb((0.87, 0.81, 0.68), 0.86 + 0.14 * n + 0.16 * (speck - 0.5))
    if name == "lawn":
        stripes = 0.04 * np.sign(np.sin(x * np.pi / 16))
        return _rgb((0.45, 0.66, 0.30), 0.85 + 0.25 * n + stripes + 0.06 * (speck - 0.5))
    if name == "foliage":
        clumps = fbm(rs, S, ((8, 0.4), (16, 0.35), (32, 0.25)))
        v = 0.62 + 0.5 * clumps + 0.08 * (speck - 0.5)
        return _rgb((1.0, 1.0, 1.0), np.clip(v, 0, 1))
    if name == "greenroof":
        base = _rgb((0.44, 0.57, 0.30), 0.8 + 0.4 * n)
        flowers = speck > 0.985
        base[flowers] = (0.86, 0.60, 0.78)
        return base
    if name == "canvas":
        return _rgb((0.96, 0.94, 0.89), 0.96 + 0.04 * n)
    if name == "pv":
        shade = 0.9 + 0.2 * (x + y) / (2 * S) + 0.05 * n
        img = _rgb((0.08, 0.13, 0.27), shade)
        img[((x % 16) == 0) | ((y % 16) == 0)] = (0.36, 0.42, 0.52)
        img[((x % 64) < 2) | ((y % 64) < 2)] = (0.72, 0.75, 0.78)
        return img
    if name == "glass":
        t = (x + y) / (2 * S)
        return np.clip(np.array((0.15, 0.21, 0.27)) * (1 - t[:, :, None]) + np.array((0.42, 0.52, 0.58)) * t[:, :, None], 0, 1)
    if name == "asphalt":
        return _rgb((0.31, 0.31, 0.32), 0.86 + 0.14 * n + 0.1 * (speck - 0.5))
    if name == "water":
        caustic = 0.12 * np.abs(np.sin(n * 18))
        return np.clip(_rgb((0.22, 0.68, 0.80), 0.95 + 0.1 * n) + caustic[:, :, None], 0, 1)
    raise ValueError(name)


def build_atlas():
    rs = np.random.default_rng(SEED)
    color = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
    rough = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
    for i, name in enumerate(CELLS):
        cx, cy = i % GRID, i // GRID
        cell = make_cell(name, rs)
        color[cy * CELL_PX : (cy + 1) * CELL_PX, cx * CELL_PX : (cx + 1) * CELL_PX, :3] = cell
        r = ROUGH.get(name, 0.9)
        rough[cy * CELL_PX : (cy + 1) * CELL_PX, cx * CELL_PX : (cx + 1) * CELL_PX, :3] = (1.0, r, 0.0)
    imgs = []
    for nm, arr, cs in (("district_atlas", color, "sRGB"), ("district_rough", rough, "Non-Color")):
        img = bpy.data.images.new(nm, ATLAS, ATLAS, alpha=False)
        img.colorspace_settings.name = cs
        img.pixels.foreach_set(arr.ravel())
        img.filepath_raw = os.path.join(OUT_DIR, f"{nm}.png")
        img.file_format = "PNG"
        img.save()
        imgs.append(img)
    return imgs


# --------------------------------------------------------------- builder --

def lin(c):
    return tuple(v ** 2.2 for v in c)


WHITE = (1, 1, 1)


class Builder:
    """Polygon soup with a texture cell, a tint and a UV origin per face."""

    def __init__(self):
        self.verts = []
        self.faces = []

    def poly(self, pts, cell, tint=WHITE, origin=None):
        i0 = len(self.verts)
        self.verts.extend(Vector(p) for p in pts)
        self.faces.append({"idx": list(range(i0, i0 + len(pts))), "cell": cell, "tint": tint, "origin": origin})

    def mark(self):
        return len(self.verts), len(self.faces)

    def transform(self, mark, fn):
        for i in range(mark[0], len(self.verts)):
            self.verts[i] = fn(self.verts[i])
        for f in self.faces[mark[1] :]:
            if f["origin"] is not None:
                f["origin"] = fn(Vector(f["origin"]))

    # Axis-aligned box, no bottom face. `cells` may override per side.
    def box(self, x0, x1, y0, y1, z0, z1, cell, tint=WHITE, top=None, sides=True):
        P = self.poly
        P([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], top or cell, tint)
        if not sides:
            return
        P([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], cell, tint)
        P([(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)], cell, tint)
        P([(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], cell, tint)
        P([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], cell, tint)

    # Ground plate with a subdivided top so baked AO can draw contact shadows.
    def plate(self, x0, x1, y0, y1, z0, z1, cell, tint=WHITE, step=2.4, edge=None):
        nx = max(1, round((x1 - x0) / step))
        ny = max(1, round((y1 - y0) / step))
        org = (x0, y0, z1)
        for i in range(nx):
            for j in range(ny):
                a, b = x0 + (x1 - x0) * i / nx, x0 + (x1 - x0) * (i + 1) / nx
                c, d = y0 + (y1 - y0) * j / ny, y0 + (y1 - y0) * (j + 1) / ny
                self.poly([(a, c, z1), (b, c, z1), (b, d, z1), (a, d, z1)], cell, tint, org)
        if z1 - z0 > 1e-6:
            e = edge or cell
            P = self.poly
            P([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], e, tint)
            P([(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)], e, tint)
            P([(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], e, tint)
            P([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], e, tint)

    def prism(self, x, y, z0, z1, r, sides, cell, tint=WHITE, lean=(0, 0)):
        ring0 = [(x + r * math.cos(2 * math.pi * k / sides), y + r * math.sin(2 * math.pi * k / sides), z0) for k in range(sides)]
        ring1 = [(px + lean[0], py + lean[1], z1) for px, py, _ in ring0]
        r1 = [(x + lean[0] + 0.75 * (px - x), y + lean[1] + 0.75 * (py - y), z1) for px, py, _ in ring0]
        for k in range(sides):
            k2 = (k + 1) % sides
            self.poly([ring0[k], ring0[k2], r1[k2], r1[k]], cell, tint)

    def blob(self, cx, cy, cz, rx, ry, rz, cell, tint, rnd, subdiv=1, jitter=0.12):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
        bm.verts.ensure_lookup_table()
        offs = {}
        for v in bm.verts:
            key = tuple(round(c, 4) for c in v.co)
            offs[key] = 1 + jitter * (rnd.random() * 2 - 1)
        for f in bm.faces:
            pts = []
            for v in f.verts:
                k = offs[tuple(round(c, 4) for c in v.co)]
                pts.append((cx + v.co.x * rx * k, cy + v.co.y * ry * k, cz + v.co.z * rz * k))
            self.poly(pts, cell, tint)
        bm.free()


# ------------------------------------------------------------ vocabulary --

STOREY = 3.7  # mm; ~1.25x vertical exaggeration for tabletop readability
BASE = 0.5  # garden level above the tile pad
EAVE = 1.0  # deep overhang: the roof is what reads from the gameplay camera
SHUTTER = [lin((0.33, 0.52, 0.44)), lin((0.32, 0.46, 0.62)), lin((0.55, 0.42, 0.30))]
OLIVE = lin((0.56, 0.63, 0.45))
PINE = lin((0.26, 0.44, 0.24))
CYPRESS = lin((0.17, 0.33, 0.19))
HEDGE = lin((0.42, 0.60, 0.33))
LAVENDER = lin((0.62, 0.52, 0.82))
VINE = lin((0.36, 0.56, 0.26))
TRUNK = lin((0.42, 0.33, 0.25))


def roof_cell(era, world_dir, kind, pv_house):
    """Material of a roof face by era. world_dir: 'S','N','E','W'."""
    if era == 2 and world_dir in ("S", "E", "W"):
        return "pv"
    return "terracotta"


class Ctx:
    def __init__(self, b, era, rot, rnd):
        self.b, self.era, self.rot, self.rnd = b, era, rot, rnd

    def world_dir(self, local):
        if self.rot == 0:
            return local
        return {"S": "N", "N": "S", "E": "W", "W": "E"}[local]


def hip_roof(c, x0, x1, y0, y1, z, rise, pv_modules):
    b, era = c.b, c.era
    X0, X1, Y0, Y1 = x0 - EAVE, x1 + EAVE, y0 - EAVE, y1 + EAVE
    th = 0.35
    zt = z + th
    W, D = X1 - X0, Y1 - Y0
    tint = WHITE
    if W >= D:
        ym = (Y0 + Y1) / 2
        r0, r1 = X0 + D / 2, X1 - D / 2
        faces = {
            "S": [(X0, Y0, zt), (X1, Y0, zt), (r1, ym, zt + rise), (r0, ym, zt + rise)],
            "N": [(X1, Y1, zt), (X0, Y1, zt), (r0, ym, zt + rise), (r1, ym, zt + rise)],
            "W": [(X0, Y1, zt), (X0, Y0, zt), (r0, ym, zt + rise)],
            "E": [(X1, Y0, zt), (X1, Y1, zt), (r1, ym, zt + rise)],
        }
    else:
        xm = (X0 + X1) / 2
        r0, r1 = Y0 + W / 2, Y1 - W / 2
        faces = {
            "W": [(X0, Y1, zt), (X0, Y0, zt), (xm, r0, zt + rise), (xm, r1, zt + rise)],
            "E": [(X1, Y0, zt), (X1, Y1, zt), (xm, r1, zt + rise), (xm, r0, zt + rise)],
            "S": [(X0, Y0, zt), (X1, Y0, zt), (xm, r0, zt + rise)],
            "N": [(X1, Y1, zt), (X0, Y1, zt), (xm, r1, zt + rise)],
        }
    for d, pts in faces.items():
        b.poly(pts, roof_cell(era, c.world_dir(d), "hip", pv_modules), tint)
    fascia(b, X0, X1, Y0, Y1, z, zt)
    if pv_modules and era == 1:
        south = "S" if c.rot == 0 else "N"
        roof_modules(c, X0, X1, Y0, Y1, zt, rise, south, hip=True)
    if pv_modules and era == 0:
        roof_modules(c, X0, X1, Y0, Y1, zt, rise, "S" if c.rot == 0 else "N", hip=True, small=True)


def gable_roof(c, x0, x1, y0, y1, z, rise, axis, pv_modules):
    b, era = c.b, c.era
    X0, X1, Y0, Y1 = x0 - EAVE, x1 + EAVE, y0 - EAVE, y1 + EAVE
    th = 0.35
    zt = z + th
    if axis == "x":
        ym = (Y0 + Y1) / 2
        b.poly([(X0, Y0, zt), (X1, Y0, zt), (X1, ym, zt + rise), (X0, ym, zt + rise)], roof_cell(era, c.world_dir("S"), "g", pv_modules))
        b.poly([(X1, Y1, zt), (X0, Y1, zt), (X0, ym, zt + rise), (X1, ym, zt + rise)], roof_cell(era, c.world_dir("N"), "g", pv_modules))
        ymw = (y0 + y1) / 2
        for xx, pts in ((x0, [(x0, y1, z), (x0, y0, z), (x0, ymw, zt + rise * (y1 - y0) / (Y1 - Y0))]),
                        (x1, [(x1, y0, z), (x1, y1, z), (x1, ymw, zt + rise * (y1 - y0) / (Y1 - Y0))])):
            b.poly(pts, c.wall_cell, c.wall_tint if c.wall_cell == "stucco" else WHITE)
        # Verge boards at the gable ends.
        for xx, sgn in ((X0, -1), (X1, 1)):
            b.poly([(xx, Y0, z), (xx, Y0, zt), (xx, ym, zt + rise), (xx, ym, z + rise)] if sgn > 0 else
                   [(xx, ym, z + rise), (xx, ym, zt + rise), (xx, Y0, zt), (xx, Y0, z)], "terracotta")
            b.poly([(xx, ym, z + rise), (xx, ym, zt + rise), (xx, Y1, zt), (xx, Y1, z)] if sgn > 0 else
                   [(xx, Y1, z), (xx, Y1, zt), (xx, ym, zt + rise), (xx, ym, z + rise)], "terracotta")
        south_dir = "S"
    else:
        xm = (X0 + X1) / 2
        b.poly([(X0, Y1, zt), (X0, Y0, zt), (xm, Y0, zt + rise), (xm, Y1, zt + rise)], roof_cell(era, c.world_dir("W"), "g", pv_modules))
        b.poly([(X1, Y0, zt), (X1, Y1, zt), (xm, Y1, zt + rise), (xm, Y0, zt + rise)], roof_cell(era, c.world_dir("E"), "g", pv_modules))
        xmw = (x0 + x1) / 2
        hz = zt + rise * (x1 - x0) / (X1 - X0)
        gt = c.wall_tint if c.wall_cell == "stucco" else WHITE
        b.poly([(x0, y0, z), (x1, y0, z), (xmw, y0, hz)], c.wall_cell, gt)
        b.poly([(x1, y1, z), (x0, y1, z), (xmw, y1, hz)], c.wall_cell, gt)
        south_dir = None
    fascia(b, X0, X1, Y0, Y1, z, zt)
    if pv_modules and era in (0, 1) and south_dir:
        roof_modules(c, X0, X1, Y0, Y1, zt, rise, "S" if c.rot == 0 else "N", hip=False, small=era == 0)


def fascia(b, X0, X1, Y0, Y1, z, zt):
    P = b.poly
    P([(X0, Y0, z), (X1, Y0, z), (X1, Y0, zt), (X0, Y0, zt)], "plain")
    P([(X1, Y1, z), (X0, Y1, z), (X0, Y1, zt), (X1, Y1, zt)], "plain")
    P([(X0, Y1, z), (X0, Y0, z), (X0, Y0, zt), (X0, Y1, zt)], "plain")
    P([(X1, Y0, z), (X1, Y1, z), (X1, Y1, zt), (X1, Y0, zt)], "plain")


def roof_modules(c, X0, X1, Y0, Y1, zt, rise, local_face, hip, small=False):
    """On-roof PV modules on the (world-south) slope, raised slightly."""
    b = c.b
    D = Y1 - Y0
    W = X1 - X0
    inset = D / 2 * 0.45 if hip else 0.8
    xa, xb = X0 + inset + 0.4, X1 - inset - 0.4
    if small:
        mid = (xa + xb) / 2
        xa, xb = mid - 1.8, mid + 1.8
    if xb - xa < 1.0:
        return
    half = D / 2
    for t0, t1 in ((0.14, 0.44), (0.5, 0.8)) if not small else ((0.2, 0.55),):
        # Points on the slope at depth fractions t from the eave toward the ridge.
        def at(x, t):
            if local_face == "S":
                return Vector((x, Y0 + half * t, zt + rise * t + 0.22))
            return Vector((x, Y1 - half * t, zt + rise * t + 0.22))
        p = [at(xa, t0), at(xb, t0), at(xb, t1), at(xa, t1)]
        if local_face == "N":
            p = [at(xb, t0), at(xa, t0), at(xa, t1), at(xb, t1)]
        b.poly(p, "pv")


def windows_on(c, x0, x1, y0, y1, z0, storeys, others, front_door=True, big=False):
    """Windows on the four walls (skipping parts hidden by other volumes)."""
    b, era = c.b, c.era
    walls = [  # P0, u, length, n
        (Vector((x0, y0, 0)), Vector((1, 0, 0)), x1 - x0),
        (Vector((x1, y0, 0)), Vector((0, 1, 0)), y1 - y0),
        (Vector((x1, y1, 0)), Vector((-1, 0, 0)), x1 - x0),
        (Vector((x0, y1, 0)), Vector((0, -1, 0)), y1 - y0),
    ]
    Z = Vector((0, 0, 1))
    shutter = SHUTTER[c.rnd.randrange(len(SHUTTER))]
    for wi, (P0, u, L) in enumerate(walls):
        n = u.cross(Z)
        cols = max(1, int((L - 1.6) // 3.2))
        for s in range(storeys):
            for k in range(cols):
                a = (L / cols) * (k + 0.5)
                centre = P0 + u * a
                probe = centre + n * 0.6
                if any(ox0 < probe.x < ox1 and oy0 < probe.y < oy1 for ox0, ox1, oy0, oy1 in others):
                    continue
                zb = z0 + s * STOREY
                door = front_door and wi == 0 and s == 0 and k == cols // 2
                if era == 0 and not big:
                    w, h, zo = (1.1, 1.5, 1.1) if not door else (1.2, 2.3, 0.0)
                else:
                    w, h, zo = (1.9, 2.3, 0.35) if not door else (1.6, 2.5, 0.0)
                    if s == 0 and not door and wi == 2:
                        w, h, zo = 2.4, 2.6, 0.0  # garden-side sliding doors
                e = 0.08
                q = lambda aa, zz, off=e: centre + u * aa + n * off + Z * (zb + zz)
                cell = "timber" if door and era == 0 else "glass"
                b.poly([q(-w / 2, zo), q(w / 2, zo), q(w / 2, zo + h), q(-w / 2, zo + h)], cell)
                if era == 0 and not door:
                    for sgn in (-1, 1):
                        a0, a1 = sgn * (w / 2 + 0.05), sgn * (w / 2 + 0.6)
                        lo, hi = (a0, a1) if sgn > 0 else (a1, a0)
                        b.poly([q(lo, zo, 0.12), q(hi, zo, 0.12), q(hi, zo + h, 0.12), q(lo, zo + h, 0.12)], "plain", shutter)
                elif era >= 1 and not door:
                    # Timber louvre / brise-soleil above the glazing.
                    top = zo + h + 0.15
                    depth = 0.7 if era == 1 else 1.0
                    pts = [centre + u * (-w / 2 - 0.2) + n * e, centre + u * (w / 2 + 0.2) + n * e]
                    lo = min(p.x for p in pts), max(p.x for p in pts)
                    loy = min(p.y for p in pts), max(p.y for p in pts)
                    ext = n * depth
                    bx = sorted([lo[0], lo[1], lo[0] + ext.x, lo[1] + ext.x])
                    by = sorted([loy[0], loy[1], loy[0] + ext.y, loy[1] + ext.y])
                    b.box(bx[0], bx[-1], by[0], by[-1], zb + top, zb + top + 0.28, "timber")


def volume(c, x0, x1, y0, y1, storeys, roof, others, wall="stucco", axis="x", pv=False, base_stone=False):
    b = c.b
    z0 = BASE
    h = storeys * STOREY
    if base_stone and storeys > 1:
        b.box(x0, x1, y0, y1, z0, z0 + STOREY, "stone")
        b.box(x0, x1, y0, y1, z0 + STOREY, z0 + h, "stucco", c.wall_tint)
    else:
        b.box(x0, x1, y0, y1, z0, z0 + h, wall, c.wall_tint if wall == "stucco" else WHITE)
    # Plinth line and contact band.
    b.box(x0 - 0.12, x1 + 0.12, y0 - 0.12, y1 + 0.12, z0, z0 + 0.35, "stone", lin((0.86, 0.82, 0.74)), sides=True)
    windows_on(c, x0, x1, y0, y1, z0, storeys, others)
    z = z0 + h
    span = min(x1 - x0, y1 - y0)
    rise = span * 0.32 + 0.4
    if roof == "hip":
        hip_roof(c, x0, x1, y0, y1, z, rise, pv)
    elif roof == "gable":
        gable_roof(c, x0, x1, y0, y1, z, rise, axis, pv)
    else:
        flat_roof(c, x0, x1, y0, y1, z)


def flat_roof(c, x0, x1, y0, y1, z):
    b, era = c.b, c.era
    b.box(x0 - 0.15, x1 + 0.15, y0 - 0.15, y1 + 0.15, z, z + 0.45, "stucco", c.wall_tint, top="plain")
    top = "gravel" if era == 0 else ("pv" if era == 1 else "greenroof")
    if era == 1:
        b.box(x0 + 0.5, x1 - 0.5, y0 + 0.5, y1 - 0.5, z + 0.45, z + 0.55, "plain", top="pv")
    else:
        b.box(x0 + 0.25, x1 - 0.25, y0 + 0.25, y1 - 0.25, z + 0.45, z + 0.6, "plain", top=top)


def pergola(c, x0, x1, y0, y1, h=3.0, cover=None):
    b = c.b
    for px in (x0, x1):
        for py in (y0, y1):
            b.box(px - 0.22, px + 0.22, py - 0.22, py + 0.22, BASE, BASE + h, "timber")
    b.box(x0 - 0.3, x1 + 0.3, y0 - 0.2, y0 + 0.2, BASE + h, BASE + h + 0.3, "timber")
    b.box(x0 - 0.3, x1 + 0.3, y1 - 0.2, y1 + 0.2, BASE + h, BASE + h + 0.3, "timber")
    n = max(2, int((x1 - x0) / 0.9))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        b.box(x - 0.1, x + 0.1, y0 - 0.4, y1 + 0.4, BASE + h + 0.3, BASE + h + 0.5, "timber")
    if cover == "canvas":
        b.box(x0, x1, y0, y1, BASE + h + 0.5, BASE + h + 0.56, "canvas")
    elif cover == "vine":
        b.blob((x0 + x1) / 2, (y0 + y1) / 2, BASE + h + 0.75, (x1 - x0) / 2 + 0.3, (y1 - y0) / 2 + 0.3, 0.45, "foliage", VINE, c.rnd)


def terrace(c, x0, x1, y0, y1):
    c.b.plate(x0, x1, y0, y1, BASE - 0.1, BASE + 0.12, "paving", step=3.0)


def pool(c, x0, x1, y0, y1):
    b = c.b
    t = 0.6
    z1 = BASE + 0.35
    b.plate(x0, x1, y0, y0 + t, BASE - 0.1, z1, "paving", step=4)
    b.plate(x0, x1, y1 - t, y1, BASE - 0.1, z1, "paving", step=4)
    b.plate(x0, x0 + t, y0 + t, y1 - t, BASE - 0.1, z1, "paving", step=4)
    b.plate(x1 - t, x1, y0 + t, y1 - t, BASE - 0.1, z1, "paving", step=4)
    b.plate(x0 + t, x1 - t, y0 + t, y1 - t, BASE - 0.1, BASE + 0.12, "water", step=4)
    if c.era == 2:
        # Shade sail over the pool.
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        for px, py, hh in ((x0, y0, 3.4), (x1, y1, 3.4)):
            b.box(px - 0.15, px + 0.15, py - 0.15, py + 0.15, BASE, BASE + hh, "plain", lin((0.6, 0.6, 0.62)))
        b.poly([(x0, y0, BASE + 3.4), (x1, (y0 + cy) / 2, BASE + 2.7), (x1, y1, BASE + 3.4), (x0, (y1 + cy) / 2, BASE + 2.7)], "canvas")


def car(c, x, y, ev=False, along="y"):
    b = c.b
    col = lin((0.82, 0.83, 0.85)) if ev else [lin((0.72, 0.18, 0.15)), lin((0.2, 0.32, 0.55)), lin((0.88, 0.86, 0.8))][c.rnd.randrange(3)]
    L, W = 2.4, 1.05
    hx, hy = (W / 2, L / 2) if along == "y" else (L / 2, W / 2)
    b.box(x - hx, x + hx, y - hy, y + hy, BASE + 0.15, BASE + 0.75, "plain", col)
    sx, sy = (hx * 0.85, hy * 0.55) if along == "y" else (hx * 0.55, hy * 0.85)
    b.box(x - sx, x + sx, y - sy, y + sy, BASE + 0.75, BASE + 1.2, "glass", top="plain")


def olive(c, x, y, s):
    b, r = c.b, c.rnd
    lean = (r.uniform(-0.3, 0.3) * s, r.uniform(-0.3, 0.3) * s)
    b.prism(x, y, BASE, BASE + 1.6 * s, 0.32 * s, 5, "soil", TRUNK, lean)
    for k in range(3):
        a = 2 * math.pi * k / 3 + r.random()
        b.blob(x + lean[0] + math.cos(a) * 0.7 * s, y + lean[1] + math.sin(a) * 0.7 * s, BASE + 2.2 * s + r.random() * 0.4 * s,
               1.25 * s, 1.15 * s, 0.85 * s, "foliage", OLIVE, r, subdiv=1)


def pine(c, x, y, s):
    b, r = c.b, c.rnd
    b.prism(x, y, BASE, BASE + 4.6 * s, 0.3 * s, 5, "soil", TRUNK, (r.uniform(-0.4, 0.4) * s, 0))
    b.blob(x, y, BASE + 4.9 * s, 2.5 * s, 2.3 * s, 0.95 * s, "foliage", PINE, r, subdiv=1)


def cypress(c, x, y, s):
    b, r = c.b, c.rnd
    b.blob(x, y, BASE + 3.1 * s, 0.85 * s, 0.85 * s, 3.0 * s, "foliage", CYPRESS, r, subdiv=1, jitter=0.08)


def lavender_bed(c, x0, x1, y0, y1):
    b, r = c.b, c.rnd
    b.plate(x0, x1, y0, y1, BASE - 0.1, BASE + 0.08, "gravel", step=4)
    n = max(2, int((x1 - x0) / 1.2))
    for i in range(n):
        for yy in (y0 + (y1 - y0) * 0.3, y0 + (y1 - y0) * 0.7):
            b.blob(x0 + (x1 - x0) * (i + 0.5) / n, yy, BASE + 0.35, 0.5, 0.5, 0.35, "foliage", LAVENDER, r, subdiv=0)


# ----------------------------------------------------------- the parcels --

PARCEL_W = 18.0  # across the street
PARCEL_D = 21.6  # from sidewalk to back hedge
FRONT = 4.6  # sidewalk edge (|y|)
COLS = (-18.25, 0.0, 18.25)
WALLS = [lin(c) for c in ((0.97, 0.96, 0.93), (0.98, 0.93, 0.85), (0.96, 0.87, 0.72), (0.97, 0.95, 0.90), (0.95, 0.90, 0.86), (0.98, 0.96, 0.92))]


def parcel_ground(c, garden_mix):
    """Garden ground of one parcel (local coords: x across, y from the street)."""
    b, era = c.b, c.era
    hw = PARCEL_W / 2
    lawn_cell = "lawn" if era == 0 else ("lawn" if garden_mix else "gravel")
    if era == 2:
        lawn_cell = "gravel" if garden_mix else "lawn"
    b.plate(-hw + 0.5, hw - 0.5, 0.3, PARCEL_D - 0.5, 0, BASE, lawn_cell, lin((0.95, 1.0, 0.95)) if lawn_cell == "lawn" else WHITE)
    # Boundary: hedges (era 0) or dry-stone walls + hedge (later eras); open at the front gate.
    hedge = lambda x0, x1, y0, y1: b.box(x0, x1, y0, y1, BASE, BASE + 1.0, "foliage", HEDGE)
    stone = lambda x0, x1, y0, y1: b.box(x0, x1, y0, y1, BASE, BASE + 0.9, "stone")
    side = hedge if era == 0 else stone
    side(-hw, -hw + 0.6, 0.3, PARCEL_D)
    side(hw - 0.6, hw, 0.3, PARCEL_D)
    hedge(-hw, hw, PARCEL_D - 0.6, PARCEL_D)
    # Low front wall with a gate gap for the drive and the path.
    b.box(-hw, -hw + 4.8, 0.0, 0.5, BASE, BASE + 0.8, "stucco", lin((0.95, 0.93, 0.88)))
    b.box(-hw + 7.2, hw - 1.8, 0.0, 0.5, BASE, BASE + 0.8, "stucco", lin((0.95, 0.93, 0.88)))
    # Driveway and path.
    b.plate(-hw + 4.8, -hw + 7.2, 0.0, 6.0, 0, BASE + 0.08, "paving" if era < 2 else "gravel", step=3)
    b.plate(hw - 1.8, hw - 0.6, 0.0, 4.6, 0, BASE + 0.06, "paving", step=3)


def ev_kit(c, x, y):
    b = c.b
    b.box(x - 0.2, x + 0.2, y - 0.2, y + 0.2, BASE, BASE + 1.4, "plain", lin((0.25, 0.27, 0.3)))
    b.box(x - 0.22, x + 0.22, y - 0.22, y + 0.22, BASE + 1.0, BASE + 1.25, "plain", lin((0.3, 0.95, 0.5)))


def battery(c, x0, y0, along):
    c.b.box(x0, x0 + (1.3 if along == "x" else 0.6), y0, y0 + (0.6 if along == "x" else 1.3), BASE, BASE + 1.8, "plain", lin((0.92, 0.94, 0.95)))


def cistern(c, x, y):
    c.b.prism(x, y, BASE, BASE + 1.6, 0.75, 8, "plain", lin((0.78, 0.82, 0.84)))


# Six distinct villas. Local frame: x across (-9..9), y = depth from the street
# (front wall faces -y, toward the street). `vols`: (x0,x1,y0,y1,storeys,roof,axis,pv)

def villa_v1(c):  # L-shaped single-storey, hip roofs, pergola terrace, pool
    vols = [(-6.8, 5.6, 4.6, 11.4, 1, "hip", "x", c.era > 0), (1.4, 5.6, 11.0, 16.6, 1, "hip", "y", False)]
    build_vols(c, vols)
    terrace(c, -6.8, 1.2, 11.6, 15.8)
    pergola(c, -6.4, 0.8, 11.9, 15.4, cover=[None, "canvas", "vine"][c.era])
    pool(c, -6.6, 0.6, 16.6, 20.2)
    for (x, y) in ((6.8, 18.5), (-7.6, 7.0)):
        olive(c, x, y, tree_scale(c))
    if c.era == 2:
        lavender_bed(c, -6.8, -1.0, 2.0, 4.0)
    car(c, -6.0, 3.0, ev=c.era == 2)
    era_systems(c, -7.4, 6.0, 5.8, 8.0)


def villa_v2(c):  # compact two storeys (stone base), annex with flat roof, pine
    vols = [(-5.2, 4.4, 5.2, 13.2, 2, "hip", "x", True)]
    build_vols(c, vols, base_stone=True)
    volume(c, 4.2, 7.8, 5.8, 10.6, 1, "flat", [(-5.2, 4.4, 5.2, 13.2)])
    terrace(c, -5.2, 4.4, 13.4, 16.0)
    pine(c, -3.5, 18.6, tree_scale(c) * 1.05)
    olive(c, 4.8, 18.2, tree_scale(c) * 0.9)
    if c.era >= 1:
        lavender_bed(c, 0.0, 6.6, 16.8, 19.6)
    else:
        c.b.plate(1.0, 6.6, 16.8, 19.8, 0, BASE + 0.1, "soil", step=3)  # vegetable plot
    car(c, -6.0, 2.6, ev=c.era == 2)
    era_systems(c, -7.2, 6.4, 7.8, 9.0)


def villa_v3(c):  # long stone farmhouse, gable along x, front portico, cypress row
    vols = [(-7.4, 7.0, 5.4, 11.6, 1, "gable", "x", c.era > 0)]
    build_vols(c, vols, wall="stone")
    pergola(c, -5.0, 4.6, 2.6, 5.2, h=2.8, cover=[None, "vine", "vine"][c.era])
    terrace(c, -5.0, 4.6, 2.6, 5.3)
    for i in range(5):
        cypress(c, -7.0 + i * 3.5, 19.8, tree_scale(c) * 0.9)
    olive(c, 5.6, 15.0, tree_scale(c))
    if c.era == 0:
        c.b.plate(-6.6, 2.0, 13.0, 17.2, 0, BASE + 0.1, "soil", step=3)
    else:
        lavender_bed(c, -6.6, 2.0, 13.0, 16.0)
    car(c, -6.0, 2.0 if c.era else 3.0, ev=c.era == 2, along="y")
    era_systems(c, 7.4, 8.0, 12.0, 13.0)


def villa_v4(c):  # split: two-storey gable (ridge y) + one-storey wing, pool
    vols = [(-7.0, -0.6, 4.4, 12.0, 2, "gable", "y", False), (-0.8, 6.8, 5.6, 12.4, 1, "gable", "x", c.era > 0)]
    build_vols(c, vols)
    terrace(c, -0.8, 6.8, 12.6, 15.0)
    pool(c, 0.6, 6.8, 15.2, 19.6)
    olive(c, -4.0, 17.0, tree_scale(c))
    cypress(c, -7.6, 15.5, tree_scale(c))
    car(c, -6.0, 2.0, ev=c.era == 2)
    era_systems(c, 7.4, 6.5, 9.0, 10.5)


def villa_v5(c):  # T-shaped single storey, two terraces, olive grove
    vols = [(-6.6, 6.6, 4.8, 10.4, 1, "hip", "x", c.era > 0), (-2.4, 2.4, 10.2, 16.0, 1, "hip", "y", False)]
    build_vols(c, vols)
    terrace(c, -6.4, -2.6, 10.6, 14.0)
    pergola(c, 2.6, 6.4, 10.6, 14.0, cover=[None, "canvas", "vine"][c.era])
    terrace(c, 2.6, 6.4, 10.6, 14.0)
    for (x, y) in ((-5.5, 17.5), (-1.0, 19.0), (3.6, 17.6), (6.6, 19.6)):
        olive(c, x, y, tree_scale(c) * 0.85)
    car(c, -6.0, 2.6, ev=c.era == 2)
    era_systems(c, 7.2, 5.0, 7.6, 8.6)


def villa_v6(c):  # two-storey gable with front loggia, pool, cypress pair at the gate
    vols = [(-6.2, 6.6, 5.0, 11.0, 2, "gable", "x", True)]
    build_vols(c, vols)
    # Loggia: slender posts and a balcony slab across the front.
    for x in (-5.0, -1.8, 1.6, 4.8):
        c.b.box(x - 0.22, x + 0.22, 3.0, 3.44, BASE, BASE + STOREY, "stucco", c.wall_tint)
    c.b.box(-6.2, 6.6, 3.0, 5.0, BASE + STOREY, BASE + STOREY + 0.35, "stucco", c.wall_tint, top="paving")
    pool(c, -5.0, 3.0, 14.2, 18.6)
    terrace(c, -5.0, 3.0, 11.2, 14.0)
    for x in (6.8, 8.0):
        cypress(c, x, 1.6, tree_scale(c) * 0.85)
    pine(c, 5.6, 17.8, tree_scale(c))
    car(c, -6.0, 1.6, ev=c.era == 2, along="y")
    era_systems(c, -7.6, 6.0, 7.6, 8.4)


def tree_scale(c):
    return (0.78, 0.95, 1.18)[c.era]


def era_systems(c, ex, ey, bx, by):
    """2050 household energy & water kit (EV charger, battery, rain cistern)."""
    if c.era == 2:
        ev_kit(c, ex, ey)
        battery(c, bx, by, "y")
        cistern(c, ex, by + 4.0)


def build_vols(c, vols, wall="stucco", base_stone=False):
    c.wall_cell = wall
    boxes = [(v[0], v[1], v[2], v[3]) for v in vols]
    for i, (x0, x1, y0, y1, st, roof, axis, pv) in enumerate(vols):
        others = [bx for j, bx in enumerate(boxes) if j != i]
        volume(c, x0, x1, y0, y1, st, roof, others, wall=wall, axis=axis, pv=pv, base_stone=base_stone)


VILLAS = [villa_v1, villa_v2, villa_v3, villa_v4, villa_v5, villa_v6]
# Gardens with a mixed (gravel/planting) look from 2035 on.
GARDEN_MIX = [True, False, True, False, True, False]


def street(b, era, rnd):
    L = 26.6
    b.plate(-L, L, -3.0, 3.0, 0, 0.32, "asphalt", step=4.4)
    for sgn in (-1, 1):
        y0, y1 = (3.0, FRONT) if sgn > 0 else (-FRONT, -3.0)
        b.plate(-L, L, y0, y1, 0, 0.62, "paving", step=2.2)
    if era == 0:
        for k in range(-6, 7):
            b.box(k * 4 - 1.0, k * 4 + 1.0, -0.12, 0.12, 0.32, 0.34, "plain", sides=False)
    if era >= 1:
        # Two-way cycle lane on the north side of the carriageway.
        b.box(-L, L, 1.4, 2.9, 0.32, 0.35, "plain", lin((0.52, 0.72, 0.50)), sides=False)
    if era == 2:
        # Bioswale (rain garden) along the south kerb.
        b.box(-L, L, -2.9, -1.7, 0.32, 0.36, "greenroof", sides=False)
    c = Ctx(b, era, 0, rnd)
    xs = {0: (-17.0, 17.0), 1: (-22.0, -9.0, 9.0, 22.0), 2: (-24.0, -14.0, -4.5, 4.5, 14.0, 24.0)}[era]
    s = (0.62, 0.8, 1.0)[era]
    for x in xs:
        for y in (3.8, -3.8):
            b.prism(x, y, 0.62, 0.62 + 2.6 * s, 0.22, 5, "soil", TRUNK)
            b.blob(x, y, 0.62 + 3.0 * s, 1.35 * s, 1.35 * s, 1.2 * s, "foliage", lin((0.38, 0.58, 0.30)), rnd, subdiv=1)


# Neighbourhood layouts: which villa stands on which parcel (slots 0-2 north
# of the street, 3-5 south). Each villa keeps its identity (walls, garden).
LAYOUTS = [
    (0, 1, 2, 3, 4, 5),
    (3, 5, 1, 4, 0, 2),
    (2, 4, 0, 5, 1, 3),
]


def build_era(era, layout=0):
    b = Builder()
    rnd = random.Random(SEED + era * 101 + layout * 17)
    street(b, era, rnd)
    for i, vi in enumerate(LAYOUTS[layout]):
        north = i < 3
        cx = COLS[i % 3]
        rot = 0 if north else 180
        c = Ctx(b, era, rot, random.Random(SEED + vi * 13 + era * 7))
        c.wall_tint = WALLS[vi]
        m = b.mark()
        parcel_ground(c, GARDEN_MIX[vi])
        VILLAS[vi](c)
        if north:
            b.transform(m, lambda p, cx=cx: Vector((cx + p.x, FRONT + p.y, p.z)))
        else:
            b.transform(m, lambda p, cx=cx: Vector((cx - p.x, -FRONT - p.y, p.z)))
    return b


# ---------------------------------------------------- AO, UVs and export --

def newell(pts):
    n = Vector((0, 0, 0))
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        n.x += (p.y - q.y) * (p.z + q.z)
        n.y += (p.z - q.z) * (p.x + q.x)
        n.z += (p.x - q.x) * (p.y + q.y)
    return n.normalized() if n.length > 1e-12 else Vector((0, 0, 1))


def hemisphere(n_dirs=28):
    out = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n_dirs):
        u = (i + 0.5) / n_dirs
        r = math.sqrt(u)
        out.append(Vector((r * math.cos(i * ga), r * math.sin(i * ga), math.sqrt(1 - u))))
    return out


AO_DIST = 6.0  # mm
AO_STRENGTH = 0.72


def bake_ao(b):
    polys = [f["idx"] for f in b.faces]
    bvh = BVHTree.FromPolygons(b.verts, polys, all_triangles=False)
    dirs = hemisphere()
    cache = {}
    corner_ao = []
    for f in b.faces:
        pts = [b.verts[i] for i in f["idx"]]
        n = newell(pts)
        f["n"] = n
        t = n.orthogonal().normalized()
        bt = n.cross(t)
        vals = []
        for p in pts:
            key = (round(p.x, 3), round(p.y, 3), round(p.z, 3), round(n.x, 2), round(n.y, 2), round(n.z, 2))
            if key not in cache:
                o = p + n * 0.03
                occ = 0.0
                for d in dirs:
                    w = t * d.x + bt * d.y + n * d.z
                    hit = bvh.ray_cast(o, w, AO_DIST)
                    if hit[0] is not None:
                        occ += 1.0 - (hit[3] / AO_DIST) ** 0.7
                cache[key] = 1.0 - AO_STRENGTH * occ / len(dirs)
            vals.append(cache[key])
        corner_ao.append(vals)
    return corner_ao


def face_uvs(f, pts):
    n = f["n"]
    cell = CELLS.index(f["cell"])
    S = CELL_MM[f["cell"]]
    if abs(n.z) > 0.9:
        t = Vector((1, 0, 0))
    else:
        t = Vector((0, 0, 1)).cross(n).normalized()
    bt = n.cross(t)
    if f["origin"] is not None:
        # Plate faces share one origin; wrap whole cells per face so a large
        # plate repeats the texture (seams fall on face borders).
        o = Vector(f["origin"])
        u0 = o.dot(t) + math.floor((min(p.dot(t) for p in pts) - o.dot(t)) / S + 1e-6) * S
        v0 = o.dot(bt) + math.floor((min(p.dot(bt) for p in pts) - o.dot(bt)) / S + 1e-6) * S
    else:
        u0 = min(p.dot(t) for p in pts)
        v0 = min(p.dot(bt) for p in pts)
    cx, cy = cell % GRID, cell // GRID
    out = []
    for p in pts:
        lu = (p.dot(t) - u0) / S
        lv = (p.dot(bt) - v0) / S
        lu = min(max(lu, 0.0), 1.0)
        lv = min(max(lv, 0.0), 1.0)
        out.append(((cx + INSET + lu * (1 - 2 * INSET)) / GRID, (cy + INSET + lv * (1 - 2 * INSET)) / GRID))
    return out


def make_material(atlas, rough):
    mat = bpy.data.materials.new("district_atlas")
    mat.use_nodes = True
    mat.use_backface_culling = True  # exported single-sided (half the fragments)
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = atlas
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    rtex = nt.nodes.new("ShaderNodeTexImage")
    rtex.image = rough
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(rtex.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    return mat


def to_object(b, name, mat):
    ao = bake_ao(b)
    # Merge coincident positions (the exporter splits by normal/uv/colour).
    index, verts, faces, keep, seen = {}, [], [], [], set()
    for fi, f in enumerate(b.faces):
        ids = []
        for i in f["idx"]:
            p = b.verts[i]
            k = (round(p.x, 4), round(p.y, 4), round(p.z, 4))
            if k not in index:
                index[k] = len(verts)
                verts.append((p.x * 0.001, p.y * 0.001, p.z * 0.001))
            ids.append(index[k])
        # Skip faces that collapse after welding, and exact duplicates
        # (Blender's validate() would drop them and shift face indices).
        key = frozenset(ids)
        if len(key) < 3 or len(key) != len(ids) or key in seen:
            continue
        seen.add(key)
        faces.append(ids)
        keep.append(fi)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    assert not me.validate(clean_customdata=False), f"{name}: mesh needed repairs"
    assert len(me.polygons) == len(keep)
    uv = me.uv_layers.new(name="UVMap")
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = col
    li = 0
    for pi, poly in enumerate(me.polygons):
        fi = keep[pi]
        f = b.faces[fi]
        pts = [b.verts[i] for i in f["idx"]]
        uvs = face_uvs(f, pts)
        tint = f["tint"]
        for k, loop in enumerate(poly.loop_indices):
            uv.data[loop].uv = uvs[k]
            a = ao[fi][k]
            col.data[loop].color = (tint[0] * a, tint[1] * a, tint[2] * a, 1.0)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = False
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj, len(faces)  # faces actually exported


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    atlas, rough = build_atlas()
    mat = make_material(atlas, rough)
    stats = []
    for era in (0, 1, 2):
        b = build_era(era)
        obj, nf = to_object(b, f"era-{era}", mat)
        tris = sum(len(f["idx"]) - 2 for f in b.faces)
        stats.append(f"era-{era}: {nf} faces, {tris} triangles")
    out = os.path.join(OUT_DIR, "villa-district.glb")
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(filepath=out, export_format="GLB", export_yup=True, export_texcoords=True, export_normals=True,
              export_materials="EXPORT", export_image_format="JPEG", export_apply=False)
    if "export_vertex_color" in props:
        kw["export_vertex_color"] = "ACTIVE"
    if "export_all_vertex_colors" in props:
        kw["export_all_vertex_colors"] = False
    if "export_jpeg_quality" in props:
        kw["export_jpeg_quality"] = 88
    if "export_image_quality" in props:
        kw["export_image_quality"] = 88
    bpy.ops.export_scene.gltf(**kw)
    for img in ("district_atlas.png", "district_rough.png"):
        try:
            os.remove(os.path.join(OUT_DIR, img))
        except OSError:
            pass
    print("\n".join(stats))
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
