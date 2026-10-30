"""
TerraCity — city kit (Blender, reproducible). One GLB, one shared texture
atlas and material, every part with baked ambient occlusion:

  district-L{0,1,2}-era-{0,1,2}  garden districts (3 parcel layouts x 3 eras)
  town-{plaza,block-3,block-4,civic}-era-{0,1,2}   compact town centre (3 eras)
  solar-base, solar-panels       agrivoltaic solar farm (panels restyled at runtime)
  wind-base, wind-rotor          wind turbine (rotor spins at runtime)
  park-base                      neighbourhood park (crowns stay runtime meshes)
  road-centre, road-arm          street junction + one arm (rotated at runtime)
  sprawl-yard, sprawl-house-{0..3}   unplanned low-rise sprawl pieces

Authoring: board millimetres, Blender Z-up, -Y = south = toward the player
(three.js +Z). Structure parts stand on the 1.6 mm tile pad (ground z = 1.6)
except districts (placed on the pad by the runtime), roads (own kerbs) and
town / sprawl tiles (ground z = 0). Shares vocabulary, atlas, AO and export
with build_villa_district.py.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      -P scripts/assets/build_city_kit.py -- public/models
  node scripts/assets/quantize-glb.mjs public/models/city-kit.glb
"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_villa_district as vd  # noqa: E402
from build_villa_district import WHITE, Builder, Ctx, lin  # noqa: E402

PAD = 1.6
STOREY = vd.STOREY
PALETTE = [lin(c) for c in ((0.96, 0.88, 0.70), (0.97, 0.94, 0.88), (0.93, 0.80, 0.68), (0.95, 0.91, 0.80), (0.90, 0.84, 0.74), (0.98, 0.96, 0.92))]
AWNINGS = [lin(c) for c in ((0.78, 0.30, 0.25), (0.25, 0.48, 0.42), (0.90, 0.72, 0.30), (0.30, 0.42, 0.62))]
STEEL = lin((0.62, 0.64, 0.66))
CONCRETE = [lin(c) for c in ((0.74, 0.72, 0.68), (0.80, 0.77, 0.71), (0.68, 0.67, 0.65), (0.77, 0.74, 0.70))]


def ctx(b, seed, tint=WHITE):
    c = Ctx(b, 0, 0, random.Random(seed))
    c.trim = False  # town and other kit parts: plain openings (triangle budget)
    c.wall_tint = tint
    c.wall_cell = "stucco"
    return c


# ------------------------------------------------------------- helpers --

def tapered(b, x, y, z0, z1, r0, r1, sides, cell, tint=WHITE, cap=True):
    for k in range(sides):
        a0 = 2 * math.pi * k / sides
        a1 = 2 * math.pi * (k + 1) / sides
        p = lambda a, r, z: (x + r * math.cos(a), y + r * math.sin(a), z)
        b.poly([p(a0, r0, z0), p(a1, r0, z0), p(a1, r1, z1), p(a0, r1, z1)], cell, tint)
    if cap:
        b.poly([(x + r1 * math.cos(2 * math.pi * k / sides), y + r1 * math.sin(2 * math.pi * k / sides), z1) for k in range(sides)], cell, tint)


def disc(b, x, y, z, r, sides, cell, tint=WHITE):
    b.poly([(x + r * math.cos(2 * math.pi * k / sides), y + r * math.sin(2 * math.pi * k / sides), z) for k in range(sides)], cell, tint)


def strip(b, pts, width, z, cell, tint=WHITE):
    """Flat path along a polyline."""
    for i in range(len(pts) - 1):
        a, c = Vector((*pts[i], 0)), Vector((*pts[i + 1], 0))
        d = (c - a).normalized()
        n = Vector((-d.y, d.x, 0)) * (width / 2)
        q = [a - n, c - n, c + n, a + n]
        b.poly([(p.x, p.y, z) for p in q], cell, tint)


def bezier(p0, p1, p2, n=10):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


def round_tree(c, x, y, z, s, tint=lin((0.36, 0.56, 0.28))):
    c.b.prism(x, y, z, z + 2.6 * s, 0.3 * s, 5, "soil", vd.TRUNK)
    c.b.blob(x, y, z + 3.3 * s, 1.7 * s, 1.7 * s, 1.45 * s, "foliage", tint, c.rnd, subdiv=1)


def simple_windows(c, x0, x1, y0, y1, z0, storeys, size=(1.1, 1.4), spacing=3.4, sides=(0, 1, 2, 3), tint=WHITE, cell="glass"):
    walls = [
        (Vector((x0, y0, 0)), Vector((1, 0, 0)), x1 - x0),
        (Vector((x1, y0, 0)), Vector((0, 1, 0)), y1 - y0),
        (Vector((x1, y1, 0)), Vector((-1, 0, 0)), x1 - x0),
        (Vector((x0, y1, 0)), Vector((0, -1, 0)), y1 - y0),
    ]
    Z = Vector((0, 0, 1))
    w, h = size
    for wi in sides:
        P0, u, L = walls[wi]
        n = u.cross(Z)
        cols = max(1, int((L - 1.2) // spacing))
        for s in range(storeys):
            for k in range(cols):
                ctr = P0 + u * ((L / cols) * (k + 0.5)) + n * 0.08 + Z * (z0 + s * STOREY + 1.1)
                c.b.poly([ctr - u * w / 2, ctr + u * w / 2, ctr + u * w / 2 + Z * h, ctr - u * w / 2 + Z * h], cell, tint)


def lifted(b, ground, fn, *args):
    """Run a villa-vocabulary builder (authored on vd.BASE) on another ground height."""
    m = b.mark()
    fn(*args)
    dz = ground - vd.BASE
    b.transform(m, lambda p: Vector((p.x, p.y, p.z + dz)))


# ---------------------------------------------------------- town centre --

TOWN_GROUND = 0.35


def town_ground(b, cell="paving"):
    b.plate(-29.4, 29.4, -29.4, 29.4, 0, TOWN_GROUND, cell, step=4.0)


def town_building(c, x0, x1, y0, y1, storeys, roof, tint, shopfront_side=None, others=(), idx=0):
    """Mixed-use building: shop level (stone + glazing + awning), apartments above."""
    b = c.b
    z0 = TOWN_GROUND
    h = storeys * STOREY
    b.box(x0, x1, y0, y1, z0, z0 + STOREY, "stone", lin((0.92, 0.88, 0.80)))
    b.box(x0, x1, y0, y1, z0 + STOREY, z0 + h, "stucco", tint)
    b.box(x0 - 0.15, x1 + 0.15, y0 - 0.15, y1 + 0.15, z0 + STOREY - 0.15, z0 + STOREY + 0.15, "plain", lin((0.93, 0.91, 0.86)))  # string course
    c.wall_tint = tint
    vd.windows_on(c, x0, x1, y0, y1, z0 + STOREY, storeys - 1, list(others), front_door=False)
    if shopfront_side is not None:
        P = {"S": (Vector((x0, y0, 0)), Vector((1, 0, 0)), x1 - x0), "N": (Vector((x1, y1, 0)), Vector((-1, 0, 0)), x1 - x0),
             "W": (Vector((x0, y1, 0)), Vector((0, -1, 0)), y1 - y0), "E": (Vector((x1, y0, 0)), Vector((0, 1, 0)), y1 - y0)}[shopfront_side]
        P0, u, L = P
        n = u.cross(Vector((0, 0, 1)))
        Z = Vector((0, 0, 1))
        cols = max(1, int(L // 4.2))
        aw = AWNINGS[c.rnd.randrange(len(AWNINGS))]
        for k in range(cols):
            ctr = P0 + u * ((L / cols) * (k + 0.5)) + n * 0.09 + Z * (z0 + 0.2)
            b.poly([ctr - u * 1.5, ctr + u * 1.5, ctr + u * 1.5 + Z * 2.4, ctr - u * 1.5 + Z * 2.4], "glass")
            # Sloped canvas awning over each shop window.
            top = ctr + Z * 2.9
            b.poly([top - u * 1.7 + n * 1.3 - Z * 0.5, top + u * 1.7 + n * 1.3 - Z * 0.5, top + u * 1.7, top - u * 1.7], "canvas", aw)
    z = z0 + h
    era = c.era
    if roof == "hip":
        rise = min(x1 - x0, y1 - y0) * 0.3 + 0.4
        if era == 2 and idx % 2:
            # Half the old town keeps tiles with on-roof modules; half has solar tiles.
            c.era = 1
            vd.hip_roof(c, x0, x1, y0, y1, z, rise, True)
            c.era = era
        else:
            vd.hip_roof(c, x0, x1, y0, y1, z, rise, era == 1 and idx % 3 != 2)
    else:
        # Roof terrace: parapet, tiles (2050: green roof), a pergola corner, planters.
        b.box(x0, x1, y0, y1, z, z + 0.7, "stucco", tint, top="paving")
        b.box(x0 + 0.4, x1 - 0.4, y0 + 0.4, y1 - 0.4, z + 0.7, z + 0.72, "greenroof" if era == 2 else "paving", sides=False)
        if era >= 1:
            b.box(x1 - 4.4, x1 - 0.7, y0 + 0.7, y1 - 0.7 if y1 - y0 < 9 else y0 + 5.0, z + 0.72, z + 1.1, "plain", lin((0.6, 0.62, 0.64)), top="pv")
        px, py = x0 + 1.0, y0 + 1.0
        for dx in (0, 3.0):
            for dy in (0, 3.0):
                b.box(px + dx - 0.15, px + dx + 0.15, py + dy - 0.15, py + dy + 0.15, z + 0.7, z + 3.0, "timber")
        b.box(px - 0.3, px + 3.3, py - 0.3, py + 3.3, z + 3.0, z + 3.2, "timber")
        b.blob(x1 - 2.0, y1 - 2.0, z + 1.4, 1.1, 1.1, 0.9, "foliage", lin((0.36, 0.56, 0.28)), c.rnd, subdiv=0)
        if era == 2:
            b.blob(px + 1.5, py + 1.5, z + 3.4, 2.0, 2.0, 0.5, "foliage", vd.VINE, c.rnd)


ERA_TREE = (1.0, 1.15, 1.4)  # street and courtyard trees mature by era


def town_block(storeys, seed, era=0):
    """Perimeter block of individual 3-4 storey buildings around a courtyard garden."""
    b = Builder()
    c = ctx(b, seed + era * 1000)
    c.era = era
    town_ground(b)
    r = random.Random(seed)  # layout only: identical in every era
    outer, inner = 27.5, 13.5
    segments = []
    xs = [-outer, -12.0, 4.0, outer]
    for i in range(3):  # north and south bars, split into three buildings
        segments.append((xs[i], xs[i + 1], inner, outer, "N"))
        segments.append((xs[i], xs[i + 1], -outer, -inner, "S"))
    ys = [-inner, 0.5, inner]
    for i in range(2):  # west and east bars, two buildings each
        segments.append((-outer, -inner, ys[i], ys[i + 1], "W"))
        segments.append((inner, outer, ys[i], ys[i + 1], "E"))
    for k, (x0, x1, y0, y1, side) in enumerate(segments):
        st = storeys - (1 if r.random() < 0.35 else 0)
        roof = "hip" if r.random() < 0.6 else "terrace"
        others = [(a0 - 0.2, a1 + 0.2, b0 - 0.2, b1 + 0.2) for j, (a0, a1, b0, b1, _) in enumerate(segments) if j != k]
        town_building(c, x0 + 0.05, x1 - 0.05, y0 + 0.05, y1 - 0.05, st, roof, PALETTE[(k + seed) % len(PALETTE)], shopfront_side=side, others=others, idx=k)
    # Courtyard garden.
    b.plate(-inner + 0.5, inner - 0.5, -inner + 0.5, inner - 0.5, TOWN_GROUND, TOWN_GROUND + 0.25, "lawn", step=3.0)
    strip(b, [(-12, 0), (12, 0)], 1.6, TOWN_GROUND + 0.27, "gravel")
    lifted(b, TOWN_GROUND + 0.25, vd.olive, c, -6.0, 6.0, ERA_TREE[era])
    lifted(b, TOWN_GROUND + 0.25, vd.olive, c, 6.5, -5.5, 0.9 * ERA_TREE[era])
    round_tree(c, 5.0, 6.5, TOWN_GROUND, 1.1 * ERA_TREE[era])
    if era == 2:
        round_tree(c, -6.0, -7.0, TOWN_GROUND, 1.2)
    return b


def town_plaza(seed, era=0):
    b = Builder()
    c = ctx(b, seed)
    town_ground(b, "paving")
    # Chapel (gable, stone) with a bell tower.
    c.wall_cell = "stone"
    b.box(-27.0, -13.0, -2.0, 22.0, TOWN_GROUND, TOWN_GROUND + 7.0, "stone")
    vd.gable_roof(c, -27.0, -13.0, -2.0, 22.0, TOWN_GROUND + 7.0, 4.2, "y", False)
    simple_windows(c, -27.0, -13.0, -2.0, 22.0, TOWN_GROUND + 1.6, 1, size=(0.9, 3.2), spacing=4.5, sides=(1, 3))
    b.poly([(-21.2, -2.09, TOWN_GROUND), (-18.8, -2.09, TOWN_GROUND), (-18.8, -2.09, TOWN_GROUND + 4.0), (-21.2, -2.09, TOWN_GROUND + 4.0)], "timber")
    tx0, tx1, ty0, ty1 = -13.2, -7.0, 15.0, 21.2
    b.box(tx0, tx1, ty0, ty1, TOWN_GROUND, TOWN_GROUND + 24.0, "stone")
    for z in (TOWN_GROUND + 20.0,):
        simple_windows(c, tx0, tx1, ty0, ty1, z - 1.1, 1, size=(2.0, 2.6), spacing=6.0, cell="plain", tint=lin((0.12, 0.11, 0.10)))
    b.box(tx0 - 0.3, tx1 + 0.3, ty0 - 0.3, ty1 + 0.3, TOWN_GROUND + 24.0, TOWN_GROUND + 24.5, "stone")
    cx, cy = (tx0 + tx1) / 2, (ty0 + ty1) / 2
    for pts in (
        [(tx0 - 0.3, ty0 - 0.3, 24.5), (tx1 + 0.3, ty0 - 0.3, 24.5), (cx, cy, 29.5)],
        [(tx1 + 0.3, ty0 - 0.3, 24.5), (tx1 + 0.3, ty1 + 0.3, 24.5), (cx, cy, 29.5)],
        [(tx1 + 0.3, ty1 + 0.3, 24.5), (tx0 - 0.3, ty1 + 0.3, 24.5), (cx, cy, 29.5)],
        [(tx0 - 0.3, ty1 + 0.3, 24.5), (tx0 - 0.3, ty0 - 0.3, 24.5), (cx, cy, 29.5)],
    ):
        b.poly([(x, y, TOWN_GROUND + z) for x, y, z in pts], "terracotta")
    # Fountain.
    fx, fy = 7.0, -2.0
    tapered(b, fx, fy, TOWN_GROUND, TOWN_GROUND + 1.1, 5.0, 5.0, 16, "stone")
    disc(b, fx, fy, TOWN_GROUND + 0.95, 4.4, 16, "water")
    tapered(b, fx, fy, TOWN_GROUND + 0.9, TOWN_GROUND + 3.2, 0.7, 0.45, 8, "stone")
    tapered(b, fx, fy, TOWN_GROUND + 3.2, TOWN_GROUND + 3.6, 1.6, 1.6, 10, "stone")
    # Market stalls along the south side.
    for i in range(4):
        x = -6.0 + i * 8.0
        y = -22.0
        for dx in (-2.6, 2.6):
            for dy in (-1.6, 1.6):
                b.box(x + dx - 0.15, x + dx + 0.15, y + dy - 0.15, y + dy + 0.15, TOWN_GROUND, TOWN_GROUND + 3.0, "timber")
        b.box(x - 2.4, x + 2.4, y - 1.4, y + 1.4, TOWN_GROUND + 1.0, TOWN_GROUND + 1.5, "timber", top="plain")
        aw = AWNINGS[i % len(AWNINGS)]
        b.poly([(x - 3.0, y - 2.0, TOWN_GROUND + 3.0), (x + 3.0, y - 2.0, TOWN_GROUND + 3.0), (x + 3.0, y, TOWN_GROUND + 3.8), (x - 3.0, y, TOWN_GROUND + 3.8)], "canvas", aw)
        b.poly([(x + 3.0, y + 2.0, TOWN_GROUND + 3.0), (x - 3.0, y + 2.0, TOWN_GROUND + 3.0), (x - 3.0, y, TOWN_GROUND + 3.8), (x + 3.0, y, TOWN_GROUND + 3.8)], "canvas", aw)
    # Cafe tables with parasols and plane trees around the square.
    for x, y in ((14.0, 10.0), (19.0, 13.0), (14.5, 16.5), (20.0, 19.0)):
        b.box(x - 0.6, x + 0.6, y - 0.6, y + 0.6, TOWN_GROUND, TOWN_GROUND + 1.0, "plain")
        b.box(x - 0.08, x + 0.08, y - 0.08, y + 0.08, TOWN_GROUND + 1.0, TOWN_GROUND + 3.0, "plain")
        tapered(b, x, y, TOWN_GROUND + 2.9, TOWN_GROUND + 3.6, 2.0, 0.1, 8, "canvas", lin((0.95, 0.93, 0.88)), cap=False)
    for x, y in ((24.0, -14.0), (24.0, 2.0), (-4.0, 12.0), (-4.0, -14.0), (12.0, 24.0)):
        round_tree(c, x, y, TOWN_GROUND, 1.25 * ERA_TREE[era])
    if era >= 1:
        # Solar pergola over the cafe terrace and a bike-share dock.
        for x in (12.0, 22.0):
            for y in (8.0, 21.0):
                b.box(x - 0.15, x + 0.15, y - 0.15, y + 0.15, TOWN_GROUND, TOWN_GROUND + 4.6, "plain", lin((0.55, 0.57, 0.6)))
        b.box(11.6, 22.4, 7.6, 21.4, TOWN_GROUND + 4.6, TOWN_GROUND + 4.8, "plain", lin((0.55, 0.57, 0.6)), top="pv")
        for k in range(5):
            b.box(-1.0 + k * 1.2, -0.4 + k * 1.2, -12.0, -10.8, TOWN_GROUND, TOWN_GROUND + 1.0, "plain", lin((0.2, 0.55, 0.45)))
    if era == 2:
        for x, y in ((-2.0, 22.0), (26.0, 24.0), (16.0, -26.0)):
            round_tree(c, x, y, TOWN_GROUND, 1.3)
    for x, y in ((0.0, 4.0), (15.0, -8.0)):
        b.box(x - 1.6, x + 1.6, y - 0.4, y + 0.4, TOWN_GROUND, TOWN_GROUND + 0.8, "timber")
    return b


def town_civic(seed, era=0):
    b = Builder()
    c = ctx(b, seed)
    c.era = era
    town_ground(b)
    # School: L-plan, three storeys, flat roof; clinic: two storeys, hip roof.
    for (x0, x1, y0, y1) in ((-27.0, 6.0, 9.0, 21.0), (-27.0, -15.0, -9.0, 9.0)):
        b.box(x0, x1, y0, y1, TOWN_GROUND, TOWN_GROUND + 3 * STOREY, "stucco", lin((0.97, 0.95, 0.90)))
        simple_windows(c, x0, x1, y0, y1, TOWN_GROUND, 3, size=(2.4, 1.6), spacing=3.2)
        b.box(x0, x1, y0, y1, TOWN_GROUND + 3 * STOREY, TOWN_GROUND + 3 * STOREY + 0.6, "stucco", lin((0.97, 0.95, 0.90)), top="greenroof" if era == 2 else "gravel")
    if era >= 1:
        for i in range(6):
            x = -24.0 + i * 5.0
            b.box(x, x + 4.0, 10.5, 18.0, TOWN_GROUND + 3 * STOREY + 0.6, TOWN_GROUND + 3 * STOREY + 0.9, "plain", top="pv")
    b.box(-15.0, -6.0, 3.0, 9.0, TOWN_GROUND, TOWN_GROUND + 3.2, "timber", top="plain")  # entrance canopy
    c.wall_tint = lin((0.96, 0.90, 0.80))
    b.box(10.0, 27.0, 5.0, 21.0, TOWN_GROUND, TOWN_GROUND + 2 * STOREY, "stucco", c.wall_tint)
    vd.windows_on(c, 10.0, 27.0, 5.0, 21.0, TOWN_GROUND, 2, [], front_door=True)
    vd.hip_roof(c, 10.0, 27.0, 5.0, 21.0, TOWN_GROUND + 2 * STOREY, 4.6, False)
    b.box(17.0, 20.0, 4.4, 4.9, TOWN_GROUND + 4.5, TOWN_GROUND + 7.5, "plain", lin((0.85, 0.22, 0.2)))  # clinic cross plate
    # Sports court with lines, schoolyard trees and benches.
    b.plate(-12.0, 22.0, -27.0, -7.0, TOWN_GROUND, TOWN_GROUND + 0.2, "plain", lin((0.36, 0.58, 0.45)), step=4.0)
    for y in (-26.2, -7.8, -17.0):
        b.box(-11.2, 21.2, y - 0.12, y + 0.12, TOWN_GROUND + 0.2, TOWN_GROUND + 0.23, "plain", sides=False)
    for x in (-11.2, 21.2):
        b.box(x - 0.12, x + 0.12, -26.2, -7.8, TOWN_GROUND + 0.2, TOWN_GROUND + 0.23, "plain", sides=False)
    disc(b, 5.0, -17.0, TOWN_GROUND + 0.24, 2.4, 14, "plain", lin((0.8, 0.85, 0.82)))
    for x, y in ((-20.0, -15.0), (-22.0, -24.0), (25.0, -3.0), (25.0, -20.0)):
        round_tree(c, x, y, TOWN_GROUND, 1.2 * ERA_TREE[era])
    lifted(b, TOWN_GROUND, vd.cypress, Ctx(b, 0, 0, c.rnd), 8.0, 24.5, 0.8)
    return b


# ------------------------------------------------------------- energy --

def solar_parts(seed):
    base, panels = Builder(), Builder()
    c = ctx(base, seed)
    z0 = PAD
    base.plate(-27.0, 27.0, -27.0, 27.0, z0 - 0.4, z0 + 0.3, "lawn", lin((0.92, 0.95, 0.8)), step=3.0)
    zg = z0 + 0.3
    strip(base, [(-27.0, -24.5), (27.0, -24.5)], 2.6, zg + 0.02, "gravel")
    # Inverter cabin.
    base.box(18.0, 24.0, -22.5, -18.5, zg, zg + 4.0, "stucco", lin((0.96, 0.95, 0.92)))
    base.box(17.6, 24.4, -22.9, -18.1, zg + 4.0, zg + 4.4, "plain", lin((0.6, 0.62, 0.64)))
    # Fence.
    for t in range(-26, 27, 4):
        for x, y in ((t, -26.6), (t, 26.6), (-26.6, t), (26.6, t)):
            base.box(x - 0.15, x + 0.15, y - 0.15, y + 0.15, zg, zg + 1.8, "plain", STEEL)
    for y in (-26.6, 26.6):
        base.box(-26.6, 26.6, y - 0.06, y + 0.06, zg + 1.6, zg + 1.75, "plain", STEEL)
    for x in (-26.6, 26.6):
        base.box(x - 0.06, x + 0.06, -26.6, 26.6, zg + 1.6, zg + 1.75, "plain", STEEL)
    # Tables: three rows, south-facing (-y), tilted 25 degrees.
    t = math.radians(25)
    W, D = 23.0, 9.0
    for cy in (15.0, 2.0, -11.0):
        for cx in (-12.5, 12.5):
            h = zg + 3.4
            fy, by = cy - D / 2 * math.cos(t), cy + D / 2 * math.cos(t)
            fz, bz = h - D / 2 * math.sin(t), h + D / 2 * math.sin(t)
            for lx in (-10.0, -3.5, 3.5, 10.0):
                base.box(cx + lx - 0.18, cx + lx + 0.18, fy + 0.6, fy + 0.96, zg, fz, "plain", STEEL)
                base.box(cx + lx - 0.18, cx + lx + 0.18, by - 0.96, by - 0.6, zg, bz, "plain", STEEL)
            x0, x1 = cx - W / 2, cx + W / 2
            panels.poly([(x0, fy, fz), (x1, fy, fz), (x1, by, bz), (x0, by, bz)], "pv")
            panels.poly([(x0, fy, fz - 0.35), (x1, fy, fz - 0.35), (x1, fy, fz), (x0, fy, fz)], "plain", STEEL)
            panels.poly([(x1, by, bz - 0.35), (x0, by, bz - 0.35), (x0, by, bz), (x1, by, bz)], "plain", STEEL)
    # Agrivoltaics: sheep grazing between the rows, wildflower margins.
    for x, y in ((-18.0, -4.5), (-6.0, -4.0), (8.0, 8.5), (19.0, 8.8), (2.0, -17.0)):
        base.blob(x, y, zg + 0.9, 1.1, 0.7, 0.65, "foliage", lin((0.96, 0.95, 0.92)), c.rnd, subdiv=0, jitter=0.05)
        base.blob(x + 1.1, y, zg + 1.2, 0.4, 0.35, 0.4, "plain", lin((0.2, 0.2, 0.2)), c.rnd, subdiv=0, jitter=0.0)
    for k in range(14):
        x = -25.0 + k * 3.8
        base.blob(x, 24.6, zg + 0.4, 0.8, 0.6, 0.5, "foliage", AWNINGS[k % 4] if k % 3 == 0 else lin((0.5, 0.66, 0.36)), c.rnd, subdiv=0)
    return base, panels


def wind_parts(seed):
    base, rotor = Builder(), Builder()
    c = ctx(base, seed)
    z0 = PAD
    # Dry hillside grass, matching the windy ridge it stands on.
    base.plate(-27.0, 27.0, -27.0, 27.0, z0 - 0.4, z0 + 0.3, "gravel", lin((0.82, 0.80, 0.55)), step=3.0)
    zg = z0 + 0.3
    strip(base, bezier((-27.0, -8.0), (-10.0, -10.0), (-3.0, -3.0)), 2.4, zg + 0.02, "gravel")
    base.plate(-9.0, 2.0, -15.0, -5.0, zg - 0.1, zg + 0.06, "gravel", step=3.0)  # crane pad
    tapered(base, 0, 0, zg, zg + 1.4, 4.8, 4.5, 8, "paving")
    tapered(base, 0, 0, zg + 1.4, 77.0, 2.9, 1.3, 14, "plain", lin((0.95, 0.96, 0.97)))
    base.box(6.0, 9.0, -6.0, -3.5, zg, zg + 2.2, "plain", lin((0.78, 0.80, 0.78)))  # transformer
    # Nacelle (three z -6.25..4.25 -> blender y -4.25..6.25), centred 77.6 mm up.
    base.box(-2.1, 2.1, -4.25, 6.25, 75.5, 79.7, "plain", lin((0.95, 0.96, 0.97)))
    for k in range(22):
        a = k * 2.4
        rr = 8.0 + (k * 7.3) % 16.0
        base.blob(math.cos(a) * rr, math.sin(a) * rr, zg + 0.5, 1.0, 1.0, 0.7, "foliage", lin((0.56, 0.68, 0.38)) if k % 4 else lin((0.86, 0.78, 0.40)), c.rnd, subdiv=0)
    # Rotor at the origin: hub and three tapered blades in the XZ plane
    # (the runtime spins it about three.js z = Blender -y).
    rc = ctx(rotor, seed + 1)
    rotor.blob(0, 0, 0, 2.0, 2.8, 2.0, "plain", lin((0.95, 0.96, 0.97)), rc.rnd, subdiv=1, jitter=0.0)
    for i in range(3):
        a = 2 * math.pi * i / 3
        d = Vector((math.sin(a), 0, math.cos(a)))
        side = Vector((math.cos(a), 0, -math.sin(a)))
        Y = Vector((0, -1, 0))

        def seg(r0, r1, w0, w1, tint):
            p0, p1 = d * r0, d * r1
            th = 0.25
            q = [p0 - side * w0 + Y * th, p1 - side * w1 + Y * th, p1 + side * w1 + Y * th, p0 + side * w0 + Y * th]
            rotor.poly([tuple(v) for v in reversed(q)], "plain", tint)
            q2 = [p0 + side * w0 - Y * th, p1 + side * w1 - Y * th, p1 - side * w1 - Y * th, p0 - side * w0 - Y * th]
            rotor.poly([tuple(v) for v in reversed(q2)], "plain", tint)
            # (winding reversed: these quads were authored clockwise from outside)
            rotor.poly([tuple(p0 - side * w0 + Y * th), tuple(p1 - side * w1 + Y * th), tuple(p1 - side * w1 - Y * th), tuple(p0 - side * w0 - Y * th)], "plain", tint)
            rotor.poly([tuple(p0 + side * w0 - Y * th), tuple(p1 + side * w1 - Y * th), tuple(p1 + side * w1 + Y * th), tuple(p0 + side * w0 + Y * th)], "plain", tint)

        white = lin((0.96, 0.97, 0.98))
        seg(1.4, 30.0, 1.5, 0.55, white)
        seg(30.0, 35.0, 0.55, 0.3, lin((0.85, 0.25, 0.22)))
    return base, rotor


# --------------------------------------------------------------- park --

# Crown positions (three.js x, z) used by the runtime crowns; trunks here.
PARK_CROWNS = ((-16.0, -8.0, 1.1), (17.0, -17.0, 0.95), (-8.0, 20.0, 0.85))


def park_base(seed):
    b = Builder()
    c = ctx(b, seed)
    z0 = PAD
    b.plate(-27.4, 27.4, -27.4, 27.4, z0 - 0.4, z0 + 0.3, "lawn", step=2.6)
    zg = z0 + 0.3
    strip(b, bezier((-27.4, 14.0), (-6.0, 10.0), (2.0, 1.0)), 2.6, zg + 0.03, "gravel")
    strip(b, bezier((2.0, 1.0), (14.0, -6.0), (27.4, -12.0)), 2.6, zg + 0.03, "gravel")
    strip(b, bezier((2.0, 1.0), (4.0, -14.0), (-3.0, -27.4)), 2.2, zg + 0.04, "gravel")
    disc(b, 2.0, 1.0, zg + 0.05, 7.0, 18, "paving")
    tapered(b, 2.0, 1.0, zg, zg + 1.0, 2.9, 2.9, 14, "stone")
    disc(b, 2.0, 1.0, zg + 0.9, 2.5, 14, "water")
    # Pond with reeds.
    disc(b, -15.0, -14.0, zg + 0.06, 6.0, 16, "paving", lin((0.85, 0.82, 0.75)))
    disc(b, -15.0, -14.0, zg + 0.1, 5.3, 16, "water")
    for k in range(7):
        a = k * 0.9
        b.blob(-15.0 + math.cos(a) * 5.4, -14.0 + math.sin(a) * 5.4, zg + 0.8, 0.4, 0.4, 0.9, "foliage", lin((0.48, 0.62, 0.32)), c.rnd, subdiv=0)
    # Flower beds, benches, lamps, playground.
    for x, y in ((-20.0, 20.0), (20.0, 6.0), (-18.0, -22.0)):
        b.plate(x - 3.5, x + 3.5, y - 2.0, y + 2.0, zg, zg + 0.5, "soil", step=3.5)
        for k in range(6):
            b.blob(x - 2.6 + k * 1.05, y + (0.8 if k % 2 else -0.8), zg + 0.9, 0.55, 0.55, 0.45, "foliage", AWNINGS[(k + int(x)) % 4] if k % 2 else lin((0.95, 0.80, 0.85)), c.rnd, subdiv=0)
    for x, y in ((9.0, 8.0), (-6.0, -4.0)):
        b.box(x - 1.7, x + 1.7, y - 0.45, y + 0.45, zg + 0.5, zg + 0.8, "timber")
        b.box(x - 1.7, x + 1.7, y + 0.3, y + 0.45, zg + 0.8, zg + 1.6, "timber")
    for x, y in ((-4.0, -12.0), (8.0, 4.0)):
        b.box(x - 0.15, x + 0.15, y - 0.15, y + 0.15, zg, zg + 7.0, "plain", lin((0.23, 0.25, 0.27)))
        b.box(x - 0.5, x + 0.5, y - 0.5, y + 0.5, zg + 7.0, zg + 7.8, "plain", lin((1.0, 0.92, 0.66)))
    b.plate(13.0, 24.0, 13.0, 24.0, zg, zg + 0.15, "gravel", lin((0.95, 0.85, 0.65)), step=3.0)  # playground
    b.box(15.0, 16.0, 15.0, 21.0, zg, zg + 3.0, "plain", lin((0.85, 0.3, 0.25)))
    b.poly([(16.0, 15.0, zg + 3.0), (16.0, 21.0, zg + 3.0), (21.0, 21.0, zg + 0.3), (21.0, 15.0, zg + 0.3)], "plain", lin((0.95, 0.75, 0.25)))
    for x in (18.0, 22.5):
        b.box(x - 0.15, x + 0.15, 22.0, 22.3, zg, zg + 3.5, "plain", lin((0.3, 0.45, 0.65)))
    # Trunks of the runtime crowns (three z -> blender -y), a cypress and olives.
    for x, z, s in PARK_CROWNS:
        b.prism(x, -z, zg, PAD + 9.6, 1.0, 6, "soil", vd.TRUNK)
    lifted(b, zg, vd.cypress, Ctx(b, 0, 0, c.rnd), 22.0, -6.0, 1.0)
    for x, y in ((-23.0, 2.0), (24.0, -24.0)):
        lifted(b, zg, vd.olive, Ctx(b, 0, 0, c.rnd), x, y, 1.0)
    return b


def park_crown(seed):
    """Lobed canopy at the origin, untinted: the runtime material supplies the green."""
    b = Builder()
    r = random.Random(seed)
    b.blob(0, 0, 0, 4.6, 4.6, 3.6, "foliage", WHITE, r, subdiv=1)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        b.blob(math.cos(a) * 2.6, math.sin(a) * 2.6, -0.6 + (k % 2) * 0.9, 2.6, 2.6, 2.2, "foliage", WHITE, r, subdiv=1)
    return b


# --------------------------------------------------------------- road --

ROAD_W = 60 * 0.42
KERB = 3.5
ARM_LEN = (60 - ROAD_W) / 2


def road_centre(seed):
    b = Builder()
    hw = ROAD_W / 2
    b.plate(-hw - KERB, hw + KERB, -hw - KERB, hw + KERB, 0, 1.8, "paving", step=3.2)
    b.plate(-hw, hw, -hw, hw, 0, 2.2, "asphalt", step=6.3)
    disc(b, 0, 0, 2.24, 3.0, 16, "lawn")  # mini roundabout
    return b


def road_arm(seed):
    """One arm along Blender y (three z), centred at the origin."""
    b = Builder()
    c = ctx(b, seed)
    hw = ROAD_W / 2
    L = ARM_LEN / 2
    b.plate(-hw - KERB, hw + KERB, -L, L, 0, 1.8, "paving", step=3.2)
    b.plate(-hw, hw, -L - 0.2, L + 0.2, 0, 2.2, "asphalt", step=6.3)
    b.box(hw - 3.0, hw - 0.4, -L - 0.2, L + 0.2, 2.2, 2.24, "plain", lin((0.52, 0.72, 0.50)), sides=False)  # cycle lane
    for y0 in (-L + 1.0, 1.0):
        b.box(-0.35, 0.35, y0, y0 + 4.5, 2.2, 2.24, "plain", sides=False)
    for side in (-1, 1):
        x = side * (hw + KERB * 0.5)
        round_tree(c, x, 0.0, 1.8, 0.95, lin((0.34, 0.54, 0.27)))
    b.box(-hw - KERB * 0.5 - 0.12, -hw - KERB * 0.5 + 0.12, L - 1.6, L - 1.35, 1.8, 7.5, "plain", lin((0.23, 0.25, 0.27)))
    b.box(-hw - KERB * 0.5 - 0.12, -hw - KERB * 0.5 + 1.6, L - 1.6, L - 1.35, 7.3, 7.6, "plain", lin((0.23, 0.25, 0.27)))
    return b


def district_link(seed):
    """Bell-mouth junction from a district street (local +x end) to the tile edge.

    The district street (6 mm carriageway, sidewalks to +-4.6) ends at x = 26.6;
    this piece continues it to the tile edge (x = 30) and widens it to the road
    width (carriageway +-12.6, kerbs to +-16.1). Solid down to the tile surface.
    """
    b = Builder()
    z_road, z_walk, z_base = 0.34, 0.64, -1.6
    hw0, hw1, kw0, kw1 = 3.0, ROAD_W / 2, 4.6, ROAD_W / 2 + KERB
    xa, xb, xe = 26.4, 27.6, 30.0

    def slab(pts, z, cell, tint=WHITE):
        b.poly([(x, y, z) for x, y in pts], cell, tint)
        for i in range(len(pts)):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
            b.poly([(x0, y0, z_base), (x1, y1, z_base), (x1, y1, z), (x0, y0, z)], cell, tint)

    slab([(xa, -hw0), (xb, -hw0), (xe, -hw1), (xe, hw1), (xb, hw0), (xa, hw0)], z_road, "asphalt")
    for sgn in (-1, 1):
        pts = [(xa, sgn * hw0), (xb, sgn * hw0), (xe, sgn * hw1), (xe, sgn * kw1), (xb, sgn * kw0), (xa, sgn * kw0)]
        if sgn < 0:
            pts = list(reversed(pts))
        slab(pts, z_walk, "paving")
    # Zebra crossing at the mouth.
    for k in range(-2, 3):
        y = k * 1.1
        b.box(xb - 0.1, xb + 1.2, y - 0.35, y + 0.35, z_road, z_road + 0.03, "plain", sides=False)
    return b


# ------------------------------------------------------------- sprawl --

SPRAWL_GROUND = 0.7


def sprawl_yard(seed):
    b = Builder()
    c = ctx(b, seed)
    b.plate(-27.0, 27.0, -27.0, 27.0, 0, SPRAWL_GROUND, "gravel", lin((0.86, 0.80, 0.68)), step=3.0)
    strip(b, bezier((-27.0, 4.0), (0.0, -6.0), (27.0, 2.0)), 3.0, SPRAWL_GROUND + 0.02, "gravel", lin((0.85, 0.80, 0.70)))
    strip(b, bezier((-6.0, -27.0), (-2.0, 0.0), (4.0, 27.0)), 2.4, SPRAWL_GROUND + 0.03, "gravel", lin((0.85, 0.80, 0.70)))
    for k in range(9):
        a = k * 2.1
        rr = 6.0 + (k * 5.3) % 19.0
        b.blob(math.cos(a) * rr, math.sin(a) * rr, SPRAWL_GROUND + 0.3, 0.8, 0.8, 0.5, "foliage", lin((0.62, 0.62, 0.42)), c.rnd, subdiv=0)
    return b


def sprawl_house(k):
    """Unplanned low-rise houses: raw concrete, flat roofs, water tanks, no gardens."""
    b = Builder()
    c = ctx(b, 900 + k)
    z0 = SPRAWL_GROUND
    w, d, st = ((8.0, 8.0, 1), (9.0, 7.0, 2), (10.0, 7.0, 1), (8.0, 9.0, 2))[k]
    tint = CONCRETE[k]
    x0, x1, y0, y1 = -w / 2, w / 2, -d / 2, d / 2
    h = st * STOREY
    b.box(x0, x1, y0, y1, z0, z0 + h, "stucco", tint)
    b.box(x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2, z0 + h, z0 + h + 0.4, "plain", lin((0.6, 0.6, 0.58)))
    simple_windows(c, x0, x1, y0, y1, z0, st, size=(1.0, 1.2), spacing=3.6)
    b.poly([(-0.7, y0 - 0.09, z0), (0.7, y0 - 0.09, z0), (0.7, y0 - 0.09, z0 + 2.2), (-0.7, y0 - 0.09, z0 + 2.2)], "plain", lin((0.35, 0.33, 0.3)))
    zt = z0 + h + 0.4
    tapered(b, x1 - 1.6, y1 - 1.6, zt, zt + 1.6, 0.9, 0.9, 8, "plain", lin((0.2, 0.22, 0.24)) if k % 2 else lin((0.25, 0.45, 0.75)))
    if k in (1, 3):
        for x, y in ((x0 + 0.4, y0 + 0.4), (x1 - 0.4, y0 + 0.4), (x0 + 0.4, y1 - 0.4)):
            b.box(x - 0.1, x + 0.1, y - 0.1, y + 0.1, zt, zt + 1.4, "plain", lin((0.45, 0.32, 0.25)))  # rebar stubs
    if k == 2:
        b.poly([(x1, y0, z0 + 2.4), (x1 + 3.5, y0, z0 + 1.8), (x1 + 3.5, y1, z0 + 1.8), (x1, y1, z0 + 2.4)], "plain", lin((0.62, 0.36, 0.25)))
        for y in (y0 + 0.2, y1 - 0.2):
            b.box(x1 + 3.3, x1 + 3.5, y - 0.1, y + 0.1, z0, z0 + 1.8, "plain", STEEL)
    b.box(x0 + 1.0, x0 + 2.2, y0 - 0.7, y0 - 0.1, z0 + 2.6, z0 + 3.3, "plain", lin((0.85, 0.86, 0.86)))  # AC unit
    return b


# ------------------------------------------------------------- export --

def main():
    os.makedirs(vd.OUT_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    atlas, rough = vd.build_atlas()
    mat = vd.make_material(atlas, rough)
    parts = []
    for layout in range(len(vd.LAYOUTS)):
        for era in (0, 1, 2):
            parts.append((f"district-L{layout}-era-{era}", vd.build_era(era, layout)))
    for era in (0, 1, 2):
        parts += [
            (f"town-plaza-era-{era}", town_plaza(11, era)),
            (f"town-block-3-era-{era}", town_block(3, 12, era)),
            (f"town-block-4-era-{era}", town_block(4, 13, era)),
            (f"town-civic-era-{era}", town_civic(14, era)),
        ]
    sb, sp = solar_parts(21)
    wb, wr = wind_parts(22)
    parts += [("solar-base", sb), ("solar-panels", sp), ("wind-base", wb), ("wind-rotor", wr), ("park-base", park_base(23)), ("park-crown", park_crown(27)),
              ("road-centre", road_centre(24)), ("road-arm", road_arm(25)), ("district-link", district_link(28)), ("sprawl-yard", sprawl_yard(26))]
    parts += [(f"sprawl-house-{k}", sprawl_house(k)) for k in range(4)]
    lines = []
    for name, b in parts:
        vd.to_object(b, name, mat)
        tris = sum(len(f["idx"]) - 2 for f in b.faces)
        lines.append(f"{name}: {tris} triangles")
    out = os.path.join(vd.OUT_DIR, "city-kit.glb")
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(filepath=out, export_format="GLB", export_yup=True, export_texcoords=True, export_normals=True,
              export_materials="EXPORT", export_image_format="JPEG", export_apply=False)
    if "export_vertex_color" in props:
        kw["export_vertex_color"] = "ACTIVE"
    if "export_jpeg_quality" in props:
        kw["export_jpeg_quality"] = 88
    if "export_image_quality" in props:
        kw["export_image_quality"] = 88
    bpy.ops.export_scene.gltf(**kw)
    for img in ("district_atlas.png", "district_rough.png"):
        try:
            os.remove(os.path.join(vd.OUT_DIR, img))
        except OSError:
            pass
    print("\n".join(lines))
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
