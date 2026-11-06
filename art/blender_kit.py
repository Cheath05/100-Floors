"""Shared helpers for the build scripts in art/*/: one material library and bmesh modelling tools.

Blender is Z-up; glTF export turns it into Y-up with Blender -Y as three.js +Z (the asset's front).
Textures live in art/textures (downscaled CC0 Poly Haven maps: 1k colour, 512 normal).
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ART_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ART_DIR, '..'))
TEX_DIR = os.path.join(ART_DIR, 'textures')
MODELS_DIR = os.path.join(REPO, 'client', 'public', 'models')


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


def textured(name, tex, roughness=0.85, diff_tex=None):
    m, nt, bsdf = fresh_material(name)
    diff = nt.nodes.new('ShaderNodeTexImage')
    diff.image = image((diff_tex or tex) + '_diff')
    diff.location = (-700, 200)
    nt.links.new(diff.outputs['Color'], bsdf.inputs['Base Color'])
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


def flat(name, color, metallic=0.0, roughness=0.5, emission=None, strength=0.0, alpha=1.0):
    m, _, bsdf = fresh_material(name)
    bsdf.inputs['Base Color'].default_value = hex_color(color) if isinstance(color, str) else color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = emission
        bsdf.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


# Names are what the client looks for: Glow* materials are swapped for unlit glows, Water for an
# animated water shader.
LIBRARY = {
    'Stone': lambda: textured('Stone', 'large_sandstone_blocks_01'),
    'Paving': lambda: textured('Paving', 'granite_tile', roughness=0.75),
    # Pale carved stone: sandstone_cracks with its colour map desaturated toward a cool grey.
    'CarvedStone': lambda: textured('CarvedStone', 'sandstone_cracks', 0.8, 'sandstone_cracks_pale'),
    'Gold': lambda: flat('Gold', '#c9a04a', metallic=1.0, roughness=0.32),
    'Iron': lambda: flat('Iron', '#2b2a2f', metallic=0.85, roughness=0.45),
    'GlowBlue': lambda: flat('GlowBlue', (0.02, 0.08, 0.2, 1), emission=(0.35, 0.8, 1.0, 1), strength=4),
    'GlowWarm': lambda: flat('GlowWarm', (0.3, 0.2, 0.08, 1), emission=(1.0, 0.72, 0.38, 1), strength=4),
    'Water': lambda: flat('Water', '#2f6f86', roughness=0.05, alpha=0.75),
    'RoofSlate': lambda: flat('RoofSlate', '#3e4756', roughness=0.7),
    'Copper': lambda: flat('Copper', '#5f9283', metallic=0.55, roughness=0.45),
    'Glass': lambda: flat('Glass', '#1b2533', metallic=0.3, roughness=0.12),
    'Wood': lambda: flat('Wood', '#5a3d27', roughness=0.75),
}


def materials(names):
    """Build the named materials; returns (list for the mesh slots, {name: slot index})."""
    mats = [LIBRARY[n]() for n in names]
    return mats, {n: i for i, n in enumerate(names)}


# The town crest's tower outline (x, z): arched door in the base, crenellated top. The crest is
# this tower inside a ring.
CREST_TOWER = [
    (-0.13, -0.25), (-0.045, -0.25), (-0.045, -0.15), (-0.032, -0.118), (0.0, -0.105),
    (0.032, -0.118), (0.045, -0.15), (0.045, -0.25), (0.13, -0.25), (0.1, 0.11),
    (0.14, 0.14), (0.14, 0.25), (0.09, 0.25), (0.09, 0.2), (0.025, 0.2), (0.025, 0.25),
    (-0.025, 0.25), (-0.025, 0.2), (-0.09, 0.2), (-0.09, 0.25), (-0.14, 0.25), (-0.14, 0.14),
    (-0.1, 0.11),
]


# ---- Geometry helpers (bmesh, local coordinates) -----------------------------------------------

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


def lathe(bm, profile, mats, segments=32, cx=0.0, cy=0.0, flutes=None, phase=0.0):
    """Surface of revolution around Z from a (radius, z) profile, bottom to top.

    `mats` is one slot for every profile segment (or a single int). A radius of 0 makes a pole;
    open ends are capped. `flutes` = (count, depth, z0, z1) cuts vertical flutes into rings whose
    z is inside [z0, z1]. `phase` turns the rings (pi/8 with 8 segments puts flat faces on X/Y).
    """
    if isinstance(mats, int):
        mats = [mats] * (len(profile) - 1)
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((cx, cy, z))])
            continue
        ring = []
        for i in range(segments):
            a = phase + 2 * math.pi * i / segments
            rr = r
            if flutes and flutes[2] - 1e-6 <= z <= flutes[3] + 1e-6:
                rr = r * (1 - flutes[1] * (0.5 + 0.5 * math.cos(flutes[0] * a)))
            ring.append(bm.verts.new((cx + rr * math.cos(a), cy + rr * math.sin(a), z)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(segments):
            j = (i + 1) % segments
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                quad = (a[0], b[j], b[i])
            elif len(b) == 1:
                quad = (a[i], a[j], b[0])
            else:
                quad = (a[i], a[j], b[j], b[i])
            f = bm.faces.new(quad)
            f.material_index = mats[k]
    for ring, m in ((rings[0], mats[0]), (rings[-1], mats[-1])):
        if len(ring) > 1:
            bm.faces.new(ring).material_index = m


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


def dentils(bm, half, z0, z1, count, mat, out=0.05, size=0.08,
            sides=((0, -1), (0, 1), (1, 0), (-1, 0)), cx=0.0, cy=0.0, span=None):
    """A row of small square blocks just proud of a face: classic carved dentil moulding."""
    span = span if span is not None else half * 2 - 0.2
    for nx, ny in sides:
        for i in range(count):
            t = -span / 2 + span * i / (count - 1)
            px, py = cx + nx * (half + out / 2) + ny * t, cy + ny * (half + out / 2) + nx * t
            hx = out / 2 if nx else size / 2
            hy = out / 2 if ny else size / 2
            box(bm, px - hx, px + hx, py - hy, py + hy, z0, z1, mat)


def gem(bm, center, nrm, mat, r=0.11, tall=1.8, flat_=0.3):
    """Flattened octahedron set into a face: a glowing diamond inlay."""
    up = Vector((0, 0, 1))
    nrm = Vector(nrm).normalized()
    lat = up.cross(nrm).normalized()
    c = Vector(center)
    ring = [bm.verts.new(c + nrm * r * flat_), bm.verts.new(c + lat * r),
            bm.verts.new(c - nrm * r * flat_), bm.verts.new(c - lat * r)]
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
    """World-scale box projection so a texture keeps one size everywhere."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.normal_update()
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            u, v = ((co.y, co.z), (co.x, co.z), (co.x, co.y))[ax]
            loop[uv].uv = (u / tile, v / tile)


def finish(name, bm, mats, col, tile=2.0, bevel=0.02, loc=(0, 0, 0), mesh=None, recalc=True):
    """Turn a bmesh into an object (or reuse `mesh`) with a bevel modifier for chamfered edges."""
    if mesh is None:
        if recalc:
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


def baked_mesh(name, bm, mats, col, tile=2.0, bevel=0.02):
    """Like finish(), but applies the bevel into a bare mesh so several objects can share it."""
    tmp = finish(name + '_tmp', bm, mats, col, tile=tile, bevel=bevel)
    mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    old = tmp.data
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.meshes.remove(old)
    mesh.name = name
    return mesh


def empty(name, col, loc=(0, 0, 0), kind='PLAIN_AXES', size=0.3, parent=None, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind
    e.empty_display_size = size
    e.location = loc
    e.rotation_euler = rot
    col.objects.link(e)
    if parent:
        e.parent = parent
    return e


# ---- Scene, saving, export ---------------------------------------------------------------------

def reset_collection(name):
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    return col


def save_blend(path):
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=False, do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile()


def export_glb(col, path):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in col.all_objects:
        o.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_image_format='AUTO', export_cameras=False, export_lights=False, export_yup=True,
        export_extras=False, export_animations=False)
