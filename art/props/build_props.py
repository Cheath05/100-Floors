"""Builds the M1 map props in Blender: the plaza lamp post, the plaza fountain and the boss-room pillar.

props.blend in this folder is the source of truth; this script is how it was made and can rebuild
it. Run it in Blender (`blender -b -P art/props/build_props.py`, or exec it in the open Blender
after File > New). It replaces the `Props` collection, saves props.blend and exports
client/public/models/props.glb with one root node per prop (`Lamp`, `Fountain`, `BossPillar`); the
client clones them by name. Sizes match the colliders in shared/src/maps.ts.

Fronts face Blender -Y (three.js +Z). Glow* materials become unlit glows in the client and Water
gets an animated shader; empties mark where the client adds effects (`Lamp_Light`, `Pillar_Flame`).
"""
import importlib
import math
import os
import sys

import bmesh

PROPS_DIR = globals().get('PROPS_DIR') or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(PROPS_DIR))
import blender_kit as kit  # noqa: E402

importlib.reload(kit)
from blender_kit import box, dentils, finish, lathe, panel, side_faces, sq  # noqa: E402

BLEND_PATH = os.path.join(PROPS_DIR, 'props.blend')
GLB_PATH = os.path.join(kit.MODELS_DIR, 'props.glb')

MAT_NAMES = ['Stone', 'CarvedStone', 'Gold', 'Iron', 'GlowWarm', 'Water']
STONE, CARVED, GOLD, IRON, GLOW, WATER = range(len(MAT_NAMES))
OCT = math.pi / 8  # turns an 8-sided lathe so its flat faces look along X and Y


def lamp(mats, col, root):
    """Plaza lamp post, ~3.5 m: carved stone foot, octagonal iron post, glass lantern. Collider r 0.25."""
    bm = bmesh.new()
    sq(bm, 0.56, 0.0, 0.12, CARVED)
    foot = sq(bm, 0.44, 0.12, 0.5, CARVED, taper=0.86)
    panel(bm, side_faces(foot), [(0.05, 0.015)])
    sq(bm, 0.42, 0.5, 0.56, CARVED)
    lathe(bm, [(0.1, 0.56), (0.1, 0.66), (0.075, 0.74), (0.062, 2.62), (0.085, 2.66), (0.085, 2.72),
               (0.06, 2.76), (0.06, 2.8)], IRON, segments=8, phase=OCT)
    # Collar rings partway up the post.
    for z in (1.2, 2.2):
        lathe(bm, [(0.08, z), (0.08, z + 0.05)], IRON, segments=8, phase=OCT)
    # Lantern: plate, glowing glass that flares outward, corner posts, roof and finial.
    sq(bm, 0.34, 2.8, 2.85, IRON)
    sq(bm, 0.24, 2.85, 3.27, GLOW, taper=1.2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(bm, sx * 0.15 - 0.018, sx * 0.15 + 0.018, sy * 0.15 - 0.018, sy * 0.15 + 0.018, 2.85, 3.27, IRON)
    sq(bm, 0.42, 3.27, 3.31, IRON)
    sq(bm, 0.4, 3.31, 3.5, IRON, taper=0.3)
    lathe(bm, [(0.0, 3.5), (0.035, 3.52), (0.035, 3.58), (0.0, 3.66)], GOLD, segments=8)
    obj = finish('Lamp_Body', bm, mats, col, tile=1.0, bevel=0.008)
    obj.parent = root
    kit.empty('Lamp_Light', col, loc=(0, 0, 3.06), kind='SPHERE', size=0.15, parent=root)


def fountain(mats, col, root):
    """Two-tier plaza fountain in an octagonal basin. Collider r 2.2."""
    bm = bmesh.new()
    # Basin: block wall with a carved coping, water-proof floor inside.
    lathe(bm, [(1.92, 0.0), (2.08, 0.0), (2.08, 0.44), (2.2, 0.5), (2.2, 0.62), (1.84, 0.62),
               (1.84, 0.5), (1.78, 0.44), (1.78, 0.14), (0.0, 0.14)],
          [STONE, STONE, CARVED, CARVED, CARVED, CARVED, CARVED, STONE, STONE], segments=8, phase=OCT)
    # Central column with a lower bowl, an upper bowl and a gold finial.
    lathe(bm, [(0.0, 0.14), (0.52, 0.14), (0.52, 0.32), (0.4, 0.38), (0.3, 0.5), (0.24, 0.62),
               (0.2, 1.3), (0.26, 1.36), (0.0, 1.36)], CARVED, segments=16)
    lathe(bm, [(0.0, 1.3), (0.3, 1.3), (0.92, 1.6), (0.98, 1.72), (0.9, 1.74), (0.0, 1.62)],
          CARVED, segments=24)
    lathe(bm, [(0.0, 1.62), (0.14, 1.62), (0.12, 2.25), (0.18, 2.3), (0.0, 2.3)], CARVED, segments=12)
    lathe(bm, [(0.0, 2.26), (0.14, 2.26), (0.46, 2.42), (0.5, 2.52), (0.44, 2.54), (0.0, 2.46)],
          CARVED, segments=16)
    lathe(bm, [(0.0, 2.46), (0.07, 2.5), (0.09, 2.62), (0.0, 2.78)], GOLD, segments=8)
    body = finish('Fountain_Body', bm, mats, col, tile=1.2, bevel=0.012)
    body.parent = root

    # Water: pool surface, bowl surfaces and the sheets falling from each bowl rim (open tubes).
    wm = bmesh.new()
    lathe(wm, [(0.0, 0.46), (1.8, 0.46)], WATER, segments=8, phase=OCT)
    lathe(wm, [(0.0, 1.68), (0.9, 1.68)], WATER, segments=24)
    lathe(wm, [(0.0, 2.49), (0.46, 2.49)], WATER, segments=16)
    for r_top, z_top, r_bot, z_bot in ((0.97, 1.7, 1.08, 0.46), (0.49, 2.5, 0.6, 1.68)):
        verts = []
        for r, z in ((r_bot, z_bot), (r_top, z_top)):
            verts.append([wm.verts.new((r * math.cos(a), r * math.sin(a), z))
                          for a in (2 * math.pi * i / 24 for i in range(24))])
        for i in range(24):
            j = (i + 1) % 24
            wm.faces.new((verts[0][i], verts[0][j], verts[1][j], verts[1][i])).material_index = WATER
    for f in wm.faces:  # discs face up, sheets face out
        f.normal_update()
        if f.normal.z < -0.5:
            f.normal_flip()
    water = finish('Fountain_Water', wm, mats, col, tile=1.0, bevel=0, recalc=False)
    water.parent = root


def boss_pillar(mats, col, root):
    """Boss-hall column reaching the 14 m ceiling, with an iron brazier on its +X side. Collider r 0.9."""
    bm = bmesh.new()
    plinth = sq(bm, 1.9, 0.0, 0.62, STONE)
    panel(bm, side_faces(plinth), [(0.12, 0.04)])
    sq(bm, 1.78, 0.62, 0.78, CARVED, taper=0.9)
    lathe(bm, [(0.82, 0.78), (0.86, 0.86), (0.82, 0.96), (0.74, 1.02), (0.72, 1.1)], CARVED, segments=32)
    # Fluted shaft with a slight taper; flutes stop short of the base and capital mouldings.
    lathe(bm, [(0.7, 1.1), (0.7, 1.4), (0.66, 10.2), (0.66, 10.5)], CARVED, segments=64,
          flutes=(16, 0.07, 1.4, 10.2))
    for z in (1.1, 10.5):  # gold rings at the ends of the shaft
        lathe(bm, [(0.74, z - 0.06), (0.74, z + 0.06)], GOLD, segments=32)
    lathe(bm, [(0.66, 10.56), (0.78, 10.8), (0.98, 11.3), (1.06, 11.5)], CARVED, segments=32)
    sq(bm, 2.1, 11.5, 11.9, CARVED)
    dentils(bm, 0.8, 11.9, 12.1, 9, CARVED, out=0.06, size=0.1)
    sq(bm, 1.6, 11.9, 12.25, STONE)
    upper = sq(bm, 1.5, 12.25, 14.0, STONE)
    panel(bm, side_faces(upper), [(0.12, 0.04)])
    # Brazier on an iron arm, facing the hall's centre line (+X; the client turns pillars on +X).
    arm_z = 4.2
    box(bm, 0.62, 1.12, -0.045, 0.045, arm_z - 0.05, arm_z + 0.05, IRON)
    box(bm, 0.62, 0.7, -0.08, 0.08, arm_z - 0.35, arm_z + 0.2, IRON)       # wall plate
    lathe(bm, [(0.0, arm_z + 0.02), (0.08, arm_z + 0.02), (0.22, arm_z + 0.2), (0.24, arm_z + 0.26),
               (0.2, arm_z + 0.26), (0.0, arm_z + 0.16)], IRON, segments=12, cx=1.12)
    body = finish('Pillar_Body', bm, mats, col, tile=1.6, bevel=0.015)
    body.parent = root
    kit.empty('Pillar_Flame', col, loc=(1.12, 0, arm_z + 0.3), kind='CONE', size=0.2, parent=root)


def build():
    col = kit.reset_collection('Props')
    mats, _ = kit.materials(MAT_NAMES)
    # Laid out side by side in Blender; each root sits at the origin of its own prop in the GLB.
    for name, x, fn in (('Lamp', -5.0, lamp), ('Fountain', 0.0, fountain), ('BossPillar', 5.5, boss_pillar)):
        root = kit.empty(name, col, loc=(x, 0, 0), kind='ARROWS', size=0.6)
        fn(mats, col, root)
    return col


if __name__ == '__main__':
    collection = build()
    kit.save_blend(BLEND_PATH)
    kit.export_glb(collection, GLB_PATH)
