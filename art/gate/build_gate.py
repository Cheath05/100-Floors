"""Builds the town teleport gate in Blender: a three-step stone dais, four carved obelisks with gold
bands, and a back wall bearing the town crest (a tower inside a ring).

gate.blend in this folder is the source of truth; this script is how it was made and can rebuild it.
Run it in the open Blender (Text Editor > Run Script) or `blender -b -P art/gate/build_gate.py`.
It replaces the `Gate` collection, saves gate.blend and exports client/public/models/teleport_gate.glb.

Blender is Z-up with the gate's front facing -Y; glTF export turns that into Y-up facing +Z, the
same frame as the old code-built gate (client/src/lookdev/gate.ts). The swirling orb, rune ring and
sparks stay as shaders in code, placed at the `Gate_Orb` and `Gate_Runes` empties.
Textures are downscaled CC0 Poly Haven maps in ./textures (1k colour, 512 normal; the carved
stone colour map is desaturated toward pale grey).
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

GATE_DIR = globals().get('GATE_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(GATE_DIR, '..', '..'))
TEX_DIR = os.path.join(GATE_DIR, 'textures')
BLEND_PATH = os.path.join(GATE_DIR, 'gate.blend')
GLB_PATH = os.path.join(REPO, 'client', 'public', 'models', 'teleport_gate.glb')

# Material slots, the same list on every mesh.
STONE, PAVING, CARVED, GOLD, INLAY = range(5)
TIER_H = 0.32
DECK = TIER_H * 3  # top of the dais


# ---- Materials ---------------------------------------------------------------------------------

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def image(name, non_color=False):
    im = bpy.data.images.load(os.path.join(TEX_DIR, name + '.jpg'), check_existing=True)
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    return im


def fresh_material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True  # exports as single-sided glTF
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    out.location = (400, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return m, nt, bsdf


def stone_material(name, tex, tint=None, roughness=0.85, diff_tex=None):
    m, nt, bsdf = fresh_material(name)
    diff = nt.nodes.new('ShaderNodeTexImage')
    diff.image = image((diff_tex or tex) + '_diff')
    diff.location = (-700, 200)
    color_out = diff.outputs['Color']
    if tint:
        # A Multiply by a flat colour exports as glTF baseColorFactor.
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs[7].default_value = hex_color(tint)
        mix.location = (-350, 200)
        nt.links.new(color_out, mix.inputs[6])
        color_out = mix.outputs[2]
    nt.links.new(color_out, bsdf.inputs['Base Color'])
    nor = nt.nodes.new('ShaderNodeTexImage')
    nor.image = image(tex + '_nor', non_color=True)
    nor.location = (-700, -150)
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    nmap.location = (-350, -150)
    nt.links.new(nor.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    return m


def materials():
    stone = stone_material('GateStone', 'large_sandstone_blocks_01')
    paving = stone_material('GatePaving', 'granite_tile', roughness=0.75)
    # Pale carved stone: sandstone_cracks with its colour map desaturated toward a cool grey.
    carved = stone_material('GateCarved', 'sandstone_cracks', diff_tex='sandstone_cracks_pale', roughness=0.8)
    gold, _, bsdf = fresh_material('GateGold')
    bsdf.inputs['Base Color'].default_value = hex_color('#c9a04a')
    bsdf.inputs['Metallic'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.32
    inlay, _, bsdf = fresh_material('GateInlay')
    bsdf.inputs['Base Color'].default_value = (0.02, 0.08, 0.2, 1.0)
    bsdf.inputs['Emission Color'].default_value = (0.35, 0.8, 1.0, 1.0)
    bsdf.inputs['Emission Strength'].default_value = 4.0
    return [stone, paving, carved, gold, inlay]


# ---- Geometry helpers (all bmesh, local coordinates) -------------------------------------------

def faces_of(verts):
    return list({f for v in verts for f in v.link_faces})


def box(bm, x0, x1, y0, y1, z0, z1, mat, top_mat=None, taper=1.0):
    """Axis-aligned box from z0 to z1; `taper` scales the top face around the centre."""
    verts = bmesh.ops.create_cube(bm, size=1.0)['verts']
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for v in verts:
        top = v.co.z > 0
        s = taper if top else 1.0
        v.co.x = cx + v.co.x * (x1 - x0) * s
        v.co.y = cy + v.co.y * (y1 - y0) * s
        v.co.z = z1 if top else z0
    faces = faces_of(verts)
    for f in faces:
        f.normal_update()
        f.material_index = top_mat if top_mat is not None and f.normal.z > 0.9 else mat
    return faces


def sq(bm, w, z0, z1, mat, taper=1.0, cx=0.0, cy=0.0, top_mat=None):
    return box(bm, cx - w / 2, cx + w / 2, cy - w / 2, cy + w / 2, z0, z1, mat, top_mat, taper)


def pyramid(bm, w, z0, h, mat, cx=0.0, cy=0.0):
    r = w / 2
    base = [bm.verts.new((cx + x * r, cy + y * r, z0)) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    apex = bm.verts.new((cx, cy, z0 + h))
    faces = [bm.faces.new(base[::-1])]
    for i in range(4):
        faces.append(bm.faces.new((base[i], base[(i + 1) % 4], apex)))
    for f in faces:
        f.material_index = mat
        f.normal_update()
    return faces


def side_faces(faces, normals=None):
    out = []
    for f in faces:
        f.normal_update()
        if abs(f.normal.z) > 0.5:
            continue
        if normals and not any(f.normal.dot(Vector(n)) > 0.9 for n in normals):
            continue
        out.append(f)
    return out


def panel(bm, faces, steps):
    """Carve a stepped recessed panel into each face: one (border, depth) inset per step."""
    for border, depth in steps:
        if faces:
            bmesh.ops.inset_individual(bm, faces=faces, thickness=border, depth=-depth, use_even_offset=True)
    return faces


def dentils(bm, half, z0, z1, count, out=0.05, size=0.08, sides=((0, -1), (0, 1), (1, 0), (-1, 0)),
            cx=0.0, cy=0.0, span=None):
    """A row of small square blocks just proud of a face: classic carved dentil moulding."""
    span = span if span is not None else half * 2 - 0.2
    for nx, ny in sides:
        for i in range(count):
            t = -span / 2 + span * i / (count - 1)
            px, py = cx + nx * (half + out / 2) + ny * t, cy + ny * (half + out / 2) + nx * t
            hx = out / 2 if nx else size / 2
            hy = out / 2 if ny else size / 2
            box(bm, px - hx, px + hx, py - hy, py + hy, z0, z1, CARVED)


def gem(bm, center, nrm, mat, r=0.11, tall=1.8, flat=0.3):
    """Flattened octahedron set into a face: a glowing diamond inlay."""
    up = Vector((0, 0, 1))
    nrm = Vector(nrm).normalized()
    lat = up.cross(nrm).normalized()
    c = Vector(center)
    ring = [bm.verts.new(c + nrm * r * flat), bm.verts.new(c + lat * r),
            bm.verts.new(c - nrm * r * flat), bm.verts.new(c - lat * r)]
    top, bot = bm.verts.new(c + up * r * tall), bm.verts.new(c - up * r * tall)
    for i in range(4):
        a, b = ring[i], ring[(i + 1) % 4]
        for f in (bm.faces.new((a, b, top)), bm.faces.new((b, a, bot))):
            f.material_index = mat


def cylinder_y(bm, center, radius, depth, mat, segments=40):
    m = Matrix.Translation(center) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    verts = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius,
                                  radius2=radius, depth=depth, matrix=m)['verts']
    for f in faces_of(verts):
        f.material_index = mat


def torus_y(bm, center, R, r, mat, su=56, sv=10):
    """Ring in the XZ plane (facing -Y)."""
    c = Vector(center)
    grid = []
    for i in range(su):
        a = 2 * math.pi * i / su
        row = []
        for j in range(sv):
            b = 2 * math.pi * j / sv
            rad = R + r * math.cos(b)
            row.append(bm.verts.new(c + Vector((rad * math.cos(a), r * math.sin(b), rad * math.sin(a)))))
        grid.append(row)
    for i in range(su):
        for j in range(sv):
            i1, j1 = (i + 1) % su, (j + 1) % sv
            f = bm.faces.new((grid[i][j], grid[i][j1], grid[i1][j1], grid[i1][j]))
            f.material_index = mat


def extruded_outline(bm, pts, center, y_front, thickness, mat, scale=1.0):
    """A flat 2D outline (x, z) extruded from y_front back to y_front + thickness."""
    cx, cz = center
    verts = [bm.verts.new((cx + x * scale, y_front + thickness, cz + z * scale)) for x, z in pts]
    face = bm.faces.new(verts)
    face.material_index = mat
    geom = bmesh.ops.extrude_face_region(bm, geom=[face])['geom']
    moved = [g for g in geom if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, -thickness, 0), verts=moved)
    for f in faces_of(moved):
        f.material_index = mat


def box_uv(bm, tile):
    """World-scale box projection so the stone texture keeps one size everywhere."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.normal_update()
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            u, v = ((co.y, co.z), (co.x, co.z), (co.x, co.y))[ax]
            loop[uv].uv = (u / tile, v / tile)


def finish(name, bm, mats, col, tile=2.0, bevel=0.02, loc=(0, 0, 0), mesh=None):
    if mesh is None:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        box_uv(bm, tile)
        for f in bm.faces:
            f.smooth = True
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        for m in mats:
            mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    col.objects.link(obj)
    if bevel:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(30)
        mod.harden_normals = True
        mod.use_clamp_overlap = True
    return obj


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
    dentils(bm, 1.66 / 2, 1.78, 1.86, count=9)                     # under the cornice
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
    # Bake the bevel into the mesh so the four obelisks can share it (and stay one mesh in the GLB).
    tmp = finish('Gate_Obelisk_tmp', bm, mats, col, tile=1.6, bevel=0.014)
    mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    old = tmp.data
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.meshes.remove(old)
    mesh.name = 'Gate_Obelisk'
    return mesh


def back_wall(mats, col):
    bm = bmesh.new()
    y0, y1 = 2.3, 2.9  # front face at y0 (Blender -Y is the gate's front)
    box(bm, -2.3, 2.3, y0 - 0.08, y1 + 0.08, DECK, DECK + 0.16, CARVED)             # base course
    wall = box(bm, -2.2, 2.2, y0, y1, DECK + 0.16, 2.46, STONE)
    panel(bm, side_faces(wall, normals=[(0, -1, 0), (0, 1, 0)]), [(0.14, 0.04), (0.05, 0.03)])
    box(bm, -2.35, 2.35, y0 - 0.1, y1 + 0.1, 2.46, 2.64, CARVED)                      # coping
    dentils(bm, 0.3, 2.38, 2.46, count=17, sides=((0, -1),), cy=2.6, span=4.0)
    for sx in (-1, 1):
        x = sx * 2.45
        post = sq(bm, 0.75, DECK, 3.26, STONE, cx=x, cy=2.6)
        panel(bm, side_faces(post, normals=[(0, -1, 0), (0, 1, 0), (sx, 0, 0)]), [(0.1, 0.035)])
        sq(bm, 0.9, 3.26, 3.38, CARVED, cx=x, cy=2.6)
        sq(bm, 0.8, 3.38, 3.83, CARVED, taper=0.25, cx=x, cy=2.6)
        pyramid(bm, 0.22, 3.83, 0.16, GOLD, cx=x, cy=2.6)
    return finish('Gate_Wall', bm, mats, col, tile=1.6, bevel=0.02)


TOWER = [  # town crest tower outline (x, z), arched door cut into the base, crenellated top
    (-0.13, -0.25), (-0.045, -0.25), (-0.045, -0.15), (-0.032, -0.118), (0.0, -0.105),
    (0.032, -0.118), (0.045, -0.15), (0.045, -0.25), (0.13, -0.25), (0.1, 0.11),
    (0.14, 0.14), (0.14, 0.25), (0.09, 0.25), (0.09, 0.2), (0.025, 0.2), (0.025, 0.25),
    (-0.025, 0.25), (-0.025, 0.2), (-0.09, 0.2), (-0.09, 0.25), (-0.14, 0.25), (-0.14, 0.14),
    (-0.1, 0.11),
]


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

def gate_collection():
    col = bpy.data.collections.get('Gate')
    if col:
        for o in list(col.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new('Gate')
        bpy.context.scene.collection.children.link(col)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    return col


def build():
    col = gate_collection()
    mats = materials()
    for im in list(bpy.data.images):
        if im.users == 0:
            bpy.data.images.remove(im)
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


def export(col, root):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in col.all_objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH, export_format='GLB', use_selection=True, export_apply=True,
        export_image_format='AUTO', export_cameras=False, export_lights=False, export_yup=True,
        export_extras=False, export_animations=False)


if __name__ == '__main__' or globals().get('GATE_RUN'):
    collection, gate_root = build()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile()
    export(collection, gate_root)
