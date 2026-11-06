"""Builds the town teleport gate in Blender: a three-step stone dais, four carved obelisks with gold
bands, and a back wall bearing the town crest (a tower inside a ring).

gate.blend in this folder is the source of truth; this script is how it was made and can rebuild it.
Run it in the open Blender (Text Editor > Run Script) or `blender -b -P art/gate/build_gate.py`.
It replaces the `Gate` collection, saves gate.blend and exports client/public/models/teleport_gate.glb.

The gate's front faces Blender -Y (three.js +Z). The swirling orb, rune ring and sparks stay as
shaders in code, placed at the `Gate_Orb` and `Gate_Runes` empties.
"""
import importlib
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

GATE_DIR = globals().get('GATE_DIR') or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(GATE_DIR))
import blender_kit as kit  # noqa: E402

importlib.reload(kit)
from blender_kit import box, dentils, extruded_outline, finish, gem, panel, pyramid, side_faces, sq  # noqa: E402
from blender_kit import cylinder_y, torus_y  # noqa: E402

BLEND_PATH = os.path.join(GATE_DIR, 'gate.blend')
GLB_PATH = os.path.join(kit.MODELS_DIR, 'teleport_gate.glb')

MAT_NAMES = ['Stone', 'Paving', 'CarvedStone', 'Gold', 'GlowBlue']
STONE, PAVING, CARVED, GOLD, INLAY = range(len(MAT_NAMES))
TIER_H = 0.32
DECK = TIER_H * 3  # top of the dais


# ---- Parts -------------------------------------------------------------------------------------

def dais(mats, col):
    bm = bmesh.new()
    tiers = [(11.0, 9.0), (9.4, 7.6), (7.8, 6.2)]
    for i, (w, d) in enumerate(tiers):
        z0, z1 = TIER_H * i, TIER_H * (i + 1)
        cap = 0.08
        # Block riser set back under a granite-topped slab with a carved nosing.
        box(bm, -w / 2 + 0.05, w / 2 - 0.05, -d / 2 + 0.05, d / 2 - 0.05, z0, z1 - cap, STONE)
        box(bm, -w / 2, w / 2, -d / 2, d / 2, z1 - cap, z1, CARVED, top_mat=PAVING)
    return finish('Gate_Dais', bm, mats, col, tile=2.4, bevel=0.025)


def obelisk_mesh(mats, col):
    bm = bmesh.new()
    sq(bm, 1.8, 0.0, DECK, STONE)                                  # footing, mostly inside the dais
    plinth = sq(bm, 1.66, DECK, 1.86, STONE)
    panel(bm, side_faces(plinth), [(0.1, 0.06), (0.06, 0.05)])     # two-step moulded panel
    dentils(bm, 1.66 / 2, 1.78, 1.86, 9, CARVED)                     # under the cornice
    sq(bm, 1.84, 1.86, 1.94, CARVED)                               # two-step cornice
    sq(bm, 1.98, 1.94, 2.06, CARVED)
    sq(bm, 1.3, 2.06, 2.5, STONE)
    sq(bm, 1.12, 2.5, 2.62, GOLD)                                  # base band

    def width(z):  # one continuous taper from 0.95 at 2.62 to 0.62 at 6.05
        return 0.95 + (0.62 - 0.95) * (z - 2.62) / (6.05 - 2.62)

    lower = sq(bm, width(2.62), 2.62, 4.95, CARVED, taper=width(4.95) / width(2.62))
    panel(bm, side_faces(lower), [(0.06, 0.05), (0.035, 0.04)])
    sq(bm, width(4.95) + 0.08, 4.95, 5.05, GOLD)                   # mid band
    upper = sq(bm, width(5.05), 5.05, 6.05, CARVED, taper=width(6.05) / width(5.05))
    panel(bm, side_faces(upper), [(0.06, 0.05)])
    sq(bm, 0.74, 6.05, 6.21, GOLD)                                 # collar
    sq(bm, 0.7, 6.21, 7.01, CARVED, taper=0.24)                    # pyramidion
    pyramid(bm, 0.19, 7.01, 0.26, GOLD)                            # gold capstone

    # A glowing diamond on each face of the lower shaft, set in the bottom of the panel.
    z = 3.35
    off = width(z) / 2 - 0.09
    for n in ((0, -1, 0), (0, 1, 0), (1, 0, 0), (-1, 0, 0)):
        gem(bm, Vector(n) * off + Vector((0, 0, z)), n, INLAY)
    # Baked bevel: the four obelisks share this mesh (and stay one mesh in the GLB).
    return kit.baked_mesh('Gate_Obelisk', bm, mats, col, tile=1.6, bevel=0.014)


def back_wall(mats, col):
    bm = bmesh.new()
    y0, y1 = 2.3, 2.9  # front face at y0 (Blender -Y is the gate's front)
    box(bm, -2.3, 2.3, y0 - 0.08, y1 + 0.08, DECK, DECK + 0.16, CARVED)             # base course
    wall = box(bm, -2.2, 2.2, y0, y1, DECK + 0.16, 2.46, STONE)
    panel(bm, side_faces(wall, normals=[(0, -1, 0), (0, 1, 0)]), [(0.14, 0.04), (0.05, 0.03)])
    box(bm, -2.35, 2.35, y0 - 0.1, y1 + 0.1, 2.46, 2.64, CARVED)                      # coping
    dentils(bm, 0.3, 2.38, 2.46, 17, CARVED, sides=((0, -1),), cy=2.6, span=4.0)
    for sx in (-1, 1):
        x = sx * 2.45
        post = sq(bm, 0.75, DECK, 3.26, STONE, cx=x, cy=2.6)
        panel(bm, side_faces(post, normals=[(0, -1, 0), (0, 1, 0), (sx, 0, 0)]), [(0.1, 0.035)])
        sq(bm, 0.9, 3.26, 3.38, CARVED, cx=x, cy=2.6)
        sq(bm, 0.8, 3.38, 3.83, CARVED, taper=0.25, cx=x, cy=2.6)
        pyramid(bm, 0.22, 3.83, 0.16, GOLD, cx=x, cy=2.6)
    return finish('Gate_Wall', bm, mats, col, tile=1.6, bevel=0.02)


TOWER = kit.CREST_TOWER


def crest(mats, col):
    bm = bmesh.new()
    cz = 1.79
    face = 2.37       # front of the wall's recessed panel
    cylinder_y(bm, Vector((0, face - 0.03, cz)), 0.46, 0.06, CARVED)        # stone medallion
    front = face - 0.06
    torus_y(bm, Vector((0, front, cz)), 0.38, 0.042, GOLD)
    extruded_outline(bm, TOWER, (0, cz), front - 0.05, 0.06, GOLD, scale=1.12)
    return finish('Gate_Crest', bm, mats, col, tile=1.2, bevel=0.006)


# ---- Build -------------------------------------------------------------------------------------

def build():
    col = kit.reset_collection('Gate')
    mats, _ = kit.materials(MAT_NAMES)
    root = bpy.data.objects.new('TeleportGate', None)
    root.empty_display_type = 'PLAIN_AXES'
    col.objects.link(root)
    parts = [dais(mats, col), back_wall(mats, col), crest(mats, col)]
    ob_mesh = obelisk_mesh(mats, col)
    for sx, sy, tag in ((-1, -1, 'FL'), (1, -1, 'FR'), (-1, 1, 'BL'), (1, 1, 'BR')):
        parts.append(finish(f'Gate_Obelisk_{tag}', None, mats, col, bevel=0,
                            loc=(sx * 4.55, sy * 3.55, 0), mesh=ob_mesh))
    # Anchors for the code-side effects: orb centre and the rune ring on the deck.
    for name, loc in (('Gate_Orb', (0, -0.3, DECK + 2.1)), ('Gate_Runes', (0, -0.3, DECK))):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = 'SPHERE' if name == 'Gate_Orb' else 'CIRCLE'
        e.empty_display_size = 1.55 if name == 'Gate_Orb' else 2.5
        e.location = loc
        if name == 'Gate_Runes':
            e.rotation_euler = (math.pi / 2, 0, 0)  # display circle flat on the deck
        col.objects.link(e)
        parts.append(e)
    for p in parts:
        p.parent = root
    return col, root


if __name__ == '__main__':
    collection, _ = build()
    kit.save_blend(BLEND_PATH)
    kit.export_glb(collection, GLB_PATH)
