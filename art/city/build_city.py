"""Builds the starting city's big pieces in Blender: a city wall segment, a round wall tower, the
gatehouse where the avenues leave town, and the Hall of Remembrance (a domed rotunda with a
columned portico; original design) that closes the view behind the teleport gate.

city.blend in this folder is the source of truth; this script is how it was made and can rebuild
it. Run it in Blender (`blender -b -P art/city/build_city.py`, or exec it in the open Blender after
File > New). It replaces the `City` collection, saves city.blend and exports
client/public/models/city.glb with one root per piece (`CityWall`, `CityTower`, `CityGate`,
`MemorialHall`); the client instances them by name. Sizes match shared/src/maps.ts.

Every piece's front (the side facing into the city / toward the plaza) is Blender -Y, three.js +Z.
"""
import importlib
import math
import os
import sys

import bmesh

CITY_DIR = globals().get('CITY_DIR') or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(CITY_DIR))
import blender_kit as kit  # noqa: E402

importlib.reload(kit)
from blender_kit import box, extruded_outline, finish, lathe, panel, side_faces, sq, torus_y  # noqa: E402

BLEND_PATH = os.path.join(CITY_DIR, 'city.blend')
GLB_PATH = os.path.join(kit.MODELS_DIR, 'city.glb')

MAT_NAMES = ['Stone', 'CarvedStone', 'Paving', 'Gold', 'Iron', 'RoofSlate', 'Copper', 'Glass', 'Wood']
STONE, CARVED, PAVING, GOLD, IRON, SLATE, COPPER, GLASS, WOOD = range(len(MAT_NAMES))

WALL_LEN = 10.2   # segments overlap a little where the ring bends
WALL_H = 8.2
WALL_T = 2.4


def merlons(bm, x0, x1, y0, y1, z0, h=1.0, w=0.9, gap=0.7, mat=CARVED):
    """A crenellated parapet along X between x0 and x1 (y0..y1 thick)."""
    n = max(1, int((x1 - x0 + gap) // (w + gap)))
    span = n * w + (n - 1) * gap
    start = (x0 + x1) / 2 - span / 2
    for i in range(n):
        a = start + i * (w + gap)
        box(bm, a, a + w, y0, y1, z0, z0 + h, mat)


def city_wall(mats, col, root):
    """Straight 10 m stretch of curtain wall: battered base, string course, crenellated walkway."""
    bm = bmesh.new()
    h = WALL_LEN / 2
    t = WALL_T / 2
    box(bm, -h, h, -t - 0.35, t + 0.35, 0.0, 1.2, CARVED)                     # plinth
    box(bm, -h, h, -t, t, 1.2, WALL_H, STONE)
    box(bm, -h, h, -t - 0.12, t + 0.12, WALL_H - 0.6, WALL_H - 0.35, CARVED)  # string course
    box(bm, -h, h, -t, t, WALL_H, WALL_H + 0.15, PAVING)                      # walkway
    merlons(bm, -h + 0.2, h - 0.2, t - 0.45, t, WALL_H + 0.15, h=1.15)        # outer battlements
    box(bm, -h, h, -t, -t + 0.35, WALL_H + 0.15, WALL_H + 0.7, CARVED)        # inner parapet
    obj = finish('CityWall_Body', bm, mats, col, tile=2.0, bevel=0.03)
    obj.parent = root


def city_tower(mats, col, root):
    """Round wall tower with a slate cone roof; it straddles the wall line."""
    bm = bmesh.new()
    lathe(bm, [(0.0, 0.0), (4.1, 0.0), (4.1, 0.6), (3.7, 1.8), (3.7, 11.0), (0.0, 11.0)],
          [CARVED, CARVED, CARVED, STONE, STONE], segments=20)
    lathe(bm, [(0.0, 10.7), (4.05, 10.7), (4.05, 11.9), (0.0, 11.9)], CARVED, segments=20)
    # Crenels round the top, under the overhanging roof.
    for i in range(12):
        a = 2 * math.pi * (i + 0.5) / 12
        cx, cy = 3.75 * math.cos(a), 3.75 * math.sin(a)
        box(bm, cx - 0.4, cx + 0.4, cy - 0.4, cy + 0.4, 11.9, 12.8, CARVED)
    lathe(bm, [(0.0, 12.6), (4.5, 12.6), (4.5, 12.75), (0.0, 18.8)], SLATE, segments=20)
    lathe(bm, [(0.0, 18.6), (0.12, 18.7), (0.12, 19.2), (0.0, 19.6)], GOLD, segments=8)
    # Arrow-slit windows, dark glass set into the wall.
    for i in range(4):
        a = 2 * math.pi * i / 4 + math.pi / 4
        for z in (5.0, 8.4):
            cx, cy = 3.72 * math.cos(a), 3.72 * math.sin(a)
            v0 = len(bm.verts)
            box(bm, -0.06, 0.06, -0.16, 0.16, z, z + 1.3, GLASS)
            bm.verts.ensure_lookup_table()
            for v in bm.verts[v0:]:
                x, y = v.co.x, v.co.y
                v.co.x = cx + x * math.cos(a) - y * math.sin(a)
                v.co.y = cy + x * math.sin(a) + y * math.cos(a)
    obj = finish('CityTower_Body', bm, mats, col, tile=2.0, bevel=0.02)
    obj.parent = root


def gate_outline(half, spring, crown, top, segs=10):
    """Facade between the gate towers with a round arch cut out: (x, z) points."""
    pts = [(-half, 0.0), (-3.0, 0.0)]
    for i in range(segs + 1):
        a = math.pi - math.pi * i / segs
        pts.append((3.0 * math.cos(a), spring + (crown - spring) * math.sin(a)))
    pts += [(3.0, 0.0), (half, 0.0), (half, top), (-half, top)]
    return pts


def city_gate(mats, col, root):
    """Gatehouse: two square towers flanking a round-arched passage with a raised portcullis."""
    bm = bmesh.new()
    for sx in (-1, 1):
        x = sx * 5.6
        tower = sq(bm, 5.0, 0.0, 13.5, STONE, cx=x)
        panel(bm, side_faces(tower, normals=[(0, -1, 0), (0, 1, 0)]), [(0.4, 0.08)])
        sq(bm, 5.4, 0.0, 1.0, CARVED, cx=x)
        sq(bm, 5.5, 13.0, 13.5, CARVED, cx=x)
        merlons(bm, x - 2.7, x + 2.7, -2.75, -2.35, 13.5)
        merlons(bm, x - 2.7, x + 2.7, 2.35, 2.75, 13.5)
        sq(bm, 0.5, 13.5, 14.6, CARVED, cx=x + sx * 2.45, cy=-2.45)
        # Narrow windows in the front face.
        for z in (6.0, 9.5):
            box(bm, x - 0.35, x + 0.35, -2.56, -2.46, z, z + 1.6, GLASS)
    # Arched span between the towers, 6 m wide, 8 m to the crown.
    extruded_outline(bm, gate_outline(3.15, 5.0, 8.0, 12.0), (0, 0), -2.2, 4.4, STONE)
    box(bm, -3.4, 3.4, -2.4, 2.4, 12.0, 12.4, CARVED)
    merlons(bm, -3.1, 3.1, -2.4, -2.0, 12.4)
    merlons(bm, -3.1, 3.1, 2.0, 2.4, 12.4)
    # Carved voussoir ring around the arch on both faces.
    for y0 in (-2.35, 2.2):
        for i in range(11):
            a0 = math.pi - math.pi * i / 11
            a1 = math.pi - math.pi * (i + 1) / 11
            r0, r1 = 3.0, 3.55
            pts = [(r0 * math.cos(a0), 5.0 + r0 * math.sin(a0)), (r1 * math.cos(a0), 5.0 + r1 * math.sin(a0)),
                   (r1 * math.cos(a1), 5.0 + r1 * math.sin(a1)), (r0 * math.cos(a1), 5.0 + r0 * math.sin(a1))]
            extruded_outline(bm, [(x, z - 5.0) for x, z in pts], (0, 5.0), y0, 0.15, CARVED)
    # Town crest over the arch, facing the city.
    torus_y(bm, (0, -2.45, 10.0), 0.75, 0.08, GOLD, su=40, sv=8)
    extruded_outline(bm, kit.CREST_TOWER, (0, 10.0), -2.5, 0.1, GOLD, scale=2.2)
    # Raised portcullis: iron grid filling the upper part of the arch.
    for i in range(11):
        x = -2.75 + i * 0.55
        top = 5.0 + math.sqrt(max(0.0, 9.0 - x * x)) * 1.0
        box(bm, x - 0.05, x + 0.05, -0.05, 0.05, 4.0, top, IRON)
    for z in (4.0, 4.9, 5.8, 6.7, 7.5):
        half = math.sqrt(max(0.0, 9.0 - max(0.0, z - 5.0) ** 2)) if z > 5.0 else 3.0
        box(bm, -half + 0.1, half - 0.1, -0.06, 0.06, z - 0.05, z + 0.05, IRON)
    obj = finish('CityGate_Body', bm, mats, col, tile=2.0, bevel=0.02)
    obj.modifiers['Bevel'].segments = 1  # big building: a chamfer reads the same and halves the size
    obj.parent = root


def memorial_hall(mats, col, root):
    """Hall of Remembrance: a domed rotunda on a stepped podium, entered through a columned portico.

    Rotunda centre at y = +3, portico columns at y = -10 (Blender), podium y -16..+15.
    """
    bm = bmesh.new()
    # Podium: three 0.3 m steps all round.
    for i, (hx, y0, y1) in enumerate(((13.6, -16.0, 15.0), (13.0, -15.4, 14.4), (12.4, -14.8, 13.8))):
        box(bm, -hx, hx, y0, y1, 0.3 * i, 0.3 * (i + 1), CARVED, top_mat=PAVING)
    base = 0.9
    cy = 3.0
    # Drum with a moulded base and a cornice, an attic ring above.
    lathe(bm, [(0.0, base), (10.5, base), (10.5, base + 0.5), (10.0, base + 0.8), (10.0, 10.6), (10.5, 10.8),
               (10.5, 11.3), (0.0, 11.3)], [CARVED, CARVED, CARVED, STONE, CARVED, CARVED, CARVED],
          segments=32, cy=cy)
    lathe(bm, [(0.0, 11.3), (9.3, 11.3), (9.3, 13.0), (9.6, 13.0), (9.6, 13.3), (0.0, 13.3)], CARVED,
          segments=32, cy=cy)
    # Pilasters and tall windows around the drum (skipping the front, where the portico meets it).
    for i in range(16):
        a = 2 * math.pi * i / 16 - math.pi / 2
        if abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < 0.5:
            continue
        for kind, r, w, z0, z1, mat in (('pil', 10.1, 0.75, base + 0.8, 10.6, CARVED),
                                        ('win', 10.02, 1.2, 4.0, 8.6, GLASS)):
            aa = a + (math.pi / 16 if kind == 'win' else 0.0)
            v0 = len(bm.verts)
            depth = 0.35 if kind == 'pil' else 0.06
            box(bm, -depth, depth, -w / 2, w / 2, z0, z1, mat)
            bm.verts.ensure_lookup_table()
            for v in bm.verts[v0:]:
                x, y = v.co.x + r, v.co.y
                v.co.x = x * math.cos(aa) - y * math.sin(aa)
                v.co.y = cy + x * math.sin(aa) + y * math.cos(aa)
    # Ribbed copper dome, lantern and gold finial.
    dome = [(9.4 * math.cos(t), 13.3 + 9.4 * math.sin(t)) for t in (math.pi / 2 * k / 10 for k in range(10))]
    lathe(bm, dome + [(0.0, 13.3 + 9.4)], COPPER, segments=48, cy=cy, flutes=(16, 0.025, 13.2, 21.0))
    lathe(bm, [(0.0, 21.9), (1.5, 21.9), (1.5, 24.2), (1.7, 24.4), (0.0, 24.4)], CARVED, segments=16, cy=cy)
    for i in range(8):
        a = 2 * math.pi * i / 8
        box(bm, 1.55 * math.cos(a) - 0.12, 1.55 * math.cos(a) + 0.12, cy + 1.55 * math.sin(a) - 0.12,
            cy + 1.55 * math.sin(a) + 0.12, 22.0, 24.2, CARVED)
    lathe(bm, [(0.0, 24.4), (1.6, 24.4), (1.1, 25.4), (0.0, 26.0)], COPPER, segments=16, cy=cy)
    lathe(bm, [(0.0, 25.9), (0.15, 26.0), (0.25, 26.4), (0.0, 27.3)], GOLD, segments=8, cy=cy)
    # Portico: six fluted columns, entablature and a pediment bearing the town crest.
    col_y = -10.0
    for x in (-7.0, -4.2, -1.4, 1.4, 4.2, 7.0):
        lathe(bm, [(0.0, base), (0.75, base), (0.75, base + 0.3), (0.6, base + 0.45), (0.55, 9.0),
                   (0.7, 9.3), (0.0, 9.3)], CARVED, segments=16, cx=x, cy=col_y,
              flutes=(8, 0.08, base + 0.45, 9.0))
        sq(bm, 1.6, 9.3, 9.6, CARVED, cx=x, cy=col_y)
    box(bm, -8.2, 8.2, -11.0, -6.0, 9.6, 10.9, CARVED)                       # entablature
    box(bm, -8.4, 8.4, -11.15, -6.0, 10.9, 11.15, CARVED)                    # cornice
    extruded_outline(bm, [(-8.4, 0.0), (8.4, 0.0), (0.0, 2.7)], (0, 11.15), -11.15, 5.15, CARVED)
    torus_y(bm, (0, -11.2, 12.25), 0.62, 0.07, GOLD, su=40, sv=8)
    extruded_outline(bm, kit.CREST_TOWER, (0, 12.25), -11.28, 0.1, GOLD, scale=1.8)
    box(bm, -8.2, 8.2, -11.0, -6.6, base, base + 0.2, PAVING)                 # portico floor
    # Great doors in the drum, framed in gold.
    door_y = cy - 10.05
    box(bm, -1.7, 1.7, door_y - 0.1, door_y + 0.1, base, base + 5.6, WOOD)
    box(bm, -1.95, 1.95, door_y - 0.16, door_y + 0.1, base + 5.6, base + 5.85, GOLD)
    for sx in (-1, 1):
        box(bm, sx * 1.7 - 0.12, sx * 1.7 + 0.12, door_y - 0.16, door_y + 0.1, base, base + 5.6, GOLD)
    box(bm, -0.04, 0.04, door_y - 0.14, door_y, base, base + 5.6, GOLD)
    obj = finish('MemorialHall_Body', bm, mats, col, tile=2.0, bevel=0.02)
    obj.modifiers['Bevel'].segments = 1
    obj.parent = root


def build():
    col = kit.reset_collection('City')
    mats, _ = kit.materials(MAT_NAMES)
    for name, x, fn in (('CityWall', -32.0, city_wall), ('CityTower', -22.0, city_tower),
                        ('CityGate', -10.0, city_gate), ('MemorialHall', 16.0, memorial_hall)):
        root = kit.empty(name, col, loc=(x, 0, 0), kind='ARROWS', size=1.0)
        fn(mats, col, root)
    return col


if __name__ == '__main__':
    collection = build()
    kit.save_blend(BLEND_PATH)
    kit.export_glb(collection, GLB_PATH)
