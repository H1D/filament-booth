"""Rebuild a booth Scene in native Blender 5.2.3 and render it with Cycles.

  blender -b --factory-startup --debug-cycles --python tools/blender/render_scene.py -- \\
      scene.json out.png [--bvh bvh2|embree] [--threads N] [--samples N] [--view standard|film]

scene.json is src/scene.ts exportScene's format: the Scene with every typed array replaced by
{"buffer": name, "kind": "f32" | "i16" | "u32", "length": n}. Each buffer is a raw little-endian
file named <name>.bin next to the JSON. The image is written with the Standard view transform,
8 bit, RGBA when the film is transparent. `--view film` writes it as the app develops a photo
instead: AgX with the film's look.

The per-vertex part data (roughness, wall normals, plate mask) is derived here in NumPy,
independently of src/photo/cycles-upload.ts, so a parity run checks that code as well. The node
trees mean what cycles/api/scene.cpp builds; render.py is the reference for both.
"""
import argparse
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix

# Mirrors of src/print.ts and src/scene.ts constants.
WORD_FEATURE = (1, 4)
WORD_LAYER = (4, 2048)
WORD_SPEED = (8192, 256)
SPEED_STEP_MMS = 2
PLATE_EPS = 5e-6
ROUGH_MIN = 0.05
# Mirrors of cycles/api/scene.cpp constants.
PLATE_MASK_THRESHOLD = 0.999
GRIT_PER_GRAIN = 25000 / 6000
GRIT_WEIGHT = 0.35
RING_SEGMENTS = 256
ELLIPSE_SEGMENTS = 64
RING_LIFT_M = 1e-5

# Mirror of tools/blender/bake_agx.py LOOKS: app look id to Blender look name.
AGX_LOOKS = {
    'none': 'None',
    'punchy': 'AgX - Punchy',
    'low-contrast': 'AgX - Low Contrast',
    'medium-low-contrast': 'AgX - Medium Low Contrast',
    'medium-high-contrast': 'AgX - Medium High Contrast',
    'high-contrast': 'AgX - High Contrast',
}

DTYPES = {'f32': np.float32, 'i16': np.int16, 'u32': np.uint32}
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def args():
    a = argparse.ArgumentParser()
    a.add_argument('scene')
    a.add_argument('out')
    a.add_argument('--bvh', choices=('bvh2', 'embree'), default='bvh2')
    a.add_argument('--threads', type=int, default=0)
    a.add_argument('--samples', type=int, default=0)
    a.add_argument('--view', choices=('standard', 'film'), default='standard')
    return a.parse_args(sys.argv[sys.argv.index('--') + 1:])


def load(path):
    """The scene with buffers resolved to NumPy arrays of the type their field has."""
    base = os.path.dirname(os.path.abspath(path))

    def resolve(node):
        if isinstance(node, dict):
            if set(node) == {'buffer', 'kind', 'length'}:
                name = node['buffer']
                arr = np.fromfile(os.path.join(base, name + '.bin'), dtype=DTYPES[node['kind']])
                assert arr.size == node['length'], f'{name}: {arr.size} values, expected {node["length"]}'
                return arr
            return {k: resolve(v) for k, v in node.items()}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    with open(path) as f:
        return resolve(json.load(f))


def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def math_node(nt, op, a=None, b=None, c=None):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def new_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    return m, m.node_tree


def add_mesh(name, positions, index, normals=None):
    nv, nt = len(positions) // 3, len(index) // 3
    me = bpy.data.meshes.new(name)
    me.vertices.add(nv)
    me.vertices.foreach_set('co', positions.astype(np.float32))
    me.loops.add(nt * 3)
    me.loops.foreach_set('vertex_index', index.astype(np.int32))
    me.polygons.add(nt)
    me.polygons.foreach_set('loop_start', np.arange(0, nt * 3, 3, dtype=np.int32))
    me.update(calc_edges=False)
    if normals is not None:
        me.shade_smooth()
        me.normals_split_custom_set_from_vertices(normals.reshape(-1, 3))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def frame_matrix(x, y, z, p):
    m = Matrix.Identity(4)
    for r in range(3):
        m[r][0], m[r][1], m[r][2], m[r][3] = x[r], y[r], z[r], p[r]
    return m


def link_to_part(ob, part_collection):
    if part_collection is not None:
        ob.light_linking.receiver_collection = part_collection


# ---- part ---------------------------------------------------------------------------------

def unpack(word, field):
    scale, size = field
    return (word // scale) % size


def part_arrays(mesh, material):
    """rough, normals, plate, tangent per vertex, as the BeadMaterial contract defines them."""
    word = mesh['word'].astype(np.int64)
    layers = material['layers']
    count = layers['count']
    feature = unpack(word, WORD_FEATURE)
    layer = np.minimum(unpack(word, WORD_LAYER), count - 1)
    speed = unpack(word, WORD_SPEED) * SPEED_STEP_MMS
    speed_rel = np.clip(speed / mesh['vRefMmS'] - 1, -1, 1)
    rough = (layers['rough'][layer * 4 + feature] + speed_rel * material['speedGain']).astype(np.float32)

    n = mesh['normal'].reshape(-1, 3).astype(np.float64)
    wall = feature == 0
    n[wall, 2] *= layers['flatten'][layer[wall]]
    length = np.linalg.norm(n, axis=1, keepdims=True)
    n = (n / np.where(length > 0, length, 1)).astype(np.float32)

    plate = (mesh['position'].reshape(-1, 3)[:, 2] <= PLATE_EPS).astype(np.float32)
    tangent = (mesh['tangent'].astype(np.float64) / 32767).astype(np.float32)
    return rough, n, plate, tangent


def bead_material(mat):
    m, nt = new_material('bead')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    texco = nt.nodes.new('ShaderNodeTexCoord')
    attr = {}
    for name in ('rough', 'plate', 'path_tangent'):
        attr[name] = nt.nodes.new('ShaderNodeAttribute')
        attr[name].attribute_name = name
    geometry = nt.nodes.new('ShaderNodeNewGeometry')

    mottle_noise = node(nt, 'ShaderNodeTexNoise', Scale=mat['mottleScale'], Detail=3.0)
    nt.links.new(texco.outputs['Object'], mottle_noise.inputs['Vector'])
    amp = mat['mottleAmp']
    mottle = math_node(nt, 'MULTIPLY_ADD', mottle_noise.outputs['Fac'], amp, -0.5 * amp)
    bead = math_node(nt, 'ADD', attr['rough'].outputs['Fac'], mottle)
    clamp = node(nt, 'ShaderNodeClamp', Min=ROUGH_MIN, Max=1.0)
    nt.links.new(bead, clamp.inputs['Value'])
    bead = clamp.outputs['Result']

    plate = math_node(nt, 'GREATER_THAN', attr['plate'].outputs['Fac'], PLATE_MASK_THRESHOLD)
    to_plate = math_node(nt, 'SUBTRACT', mat['plate']['rough'], bead)
    roughness = math_node(nt, 'MULTIPLY_ADD', plate, to_plate, bead)

    wear = mat.get('surfaceWear', 0.0)
    if wear > 0.0:
        smudge_noise = node(nt, 'ShaderNodeTexNoise', Scale=32.0, Detail=2.0)
        nt.links.new(texco.outputs['Object'], smudge_noise.inputs['Vector'])
        smudge_amp = 1.05 * wear
        smudge = math_node(nt, 'MULTIPLY_ADD', smudge_noise.outputs['Fac'], smudge_amp, -0.5 * smudge_amp)
        scuff_noise = node(nt, 'ShaderNodeTexNoise', Scale=180.0, Detail=3.0)
        nt.links.new(texco.outputs['Object'], scuff_noise.inputs['Vector'])
        scuff_amp = 0.65 * wear
        scuff = math_node(nt, 'MULTIPLY_ADD', scuff_noise.outputs['Fac'], scuff_amp, -0.5 * scuff_amp)
        wear_delta = math_node(nt, 'ADD', smudge, scuff)
        worn = math_node(nt, 'ADD', roughness, wear_delta)
        worn_clamp = node(nt, 'ShaderNodeClamp', Min=ROUGH_MIN, Max=1.0)
        nt.links.new(worn, worn_clamp.inputs['Value'])
        roughness = worn_clamp.outputs['Result']

    aniso = math_node(nt, 'MULTIPLY_ADD', plate, -mat['anisotropy'], mat['anisotropy'])

    cross = nt.nodes.new('ShaderNodeVectorMath')
    cross.operation = 'CROSS_PRODUCT'
    nt.links.new(geometry.outputs['Normal'], cross.inputs[0])
    nt.links.new(attr['path_tangent'].outputs['Vector'], cross.inputs[1])

    bsdf = node(nt, 'ShaderNodeBsdfPrincipled', **{'Base Color': (*mat['baseColor'], 1.0), 'IOR': mat['ior']})

    dust = mat.get('dust', 0.0)
    if dust > 0.0:
        vor = node(nt, 'ShaderNodeTexVoronoi', Scale=300.0, Randomness=1.0)
        nt.links.new(texco.outputs['Object'], vor.inputs['Vector'])
        shape = math_node(nt, 'MULTIPLY_ADD', vor.outputs['Distance'], -1.0 / (0.35 * 0.088), 1.0 / 0.35)
        shape.node.use_clamp = True
        sep_col = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(vor.outputs['Color'], sep_col.inputs['Color'])
        keep_lo = 0.94 - 0.16 * dust
        keep_inv = 1.0 / (1.0 - keep_lo)
        keep = math_node(nt, 'MULTIPLY_ADD', sep_col.outputs['Red'], keep_inv, -keep_lo * keep_inv)
        keep.node.use_clamp = True
        sep_n = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(geometry.outputs['Normal'], sep_n.inputs[0])
        up_inv = 1.0 / (0.80 - 0.15)
        up = math_node(nt, 'MULTIPLY_ADD', sep_n.outputs['Z'], up_inv, -0.15 * up_inv)
        up.node.use_clamp = True
        up2 = math_node(nt, 'MULTIPLY', up, up)
        settle = math_node(nt, 'MULTIPLY_ADD', up2, 1.0 - 0.10, 0.10)
        dust_strength = 0.45 + 0.45 * dust
        mask = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', shape, keep), settle), dust_strength)
        mask.node.use_clamp = True

        col_fac = math_node(nt, 'MULTIPLY', mask, 0.85)
        mix_col = nt.nodes.new('ShaderNodeMix')
        mix_col.data_type = 'RGBA'
        mix_col.blend_type = 'MIX'
        mix_col.clamp_factor = True
        mix_in = {s.identifier: s for s in mix_col.inputs}
        mix_out = {s.identifier: s for s in mix_col.outputs}
        mix_in['A_Color'].default_value = (*mat['baseColor'], 1.0)
        mix_in['B_Color'].default_value = (0.48, 0.46, 0.42, 1.0)
        nt.links.new(col_fac, mix_in['Factor_Float'])
        nt.links.new(mix_out['Result_Color'], bsdf.inputs['Base Color'])

        to_dust_r = math_node(nt, 'SUBTRACT', 0.92, roughness)
        roughness = math_node(nt, 'MULTIPLY_ADD', mask, to_dust_r, roughness)
        aniso = math_node(nt, 'MULTIPLY', aniso, math_node(nt, 'MULTIPLY_ADD', mask, -1.0, 1.0))

    sss = mat.get('subsurface', 0.0)
    if sss > 0.0:
        bsdf.subsurface_method = 'BURLEY'
        bsdf.inputs['Subsurface Weight'].default_value = sss
        bsdf.inputs['Subsurface Scale'].default_value = 0.0028
        bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.70, 0.45)

    nt.links.new(roughness, bsdf.inputs['Roughness'])
    nt.links.new(aniso, bsdf.inputs['Anisotropic'])
    nt.links.new(cross.outputs['Vector'], bsdf.inputs['Tangent'])

    if mat['plate']['textured']:
        grain = mat['plate']['grainPerM']
        craters = node(nt, 'ShaderNodeTexVoronoi', Scale=grain)
        grit = node(nt, 'ShaderNodeTexNoise', Scale=grain * GRIT_PER_GRAIN, Detail=2.0)
        nt.links.new(texco.outputs['Object'], craters.inputs['Vector'])
        nt.links.new(texco.outputs['Object'], grit.inputs['Vector'])
        height = math_node(nt, 'MULTIPLY_ADD', grit.outputs['Fac'], GRIT_WEIGHT, craters.outputs['Distance'])
        bump = node(nt, 'ShaderNodeBump', Distance=mat['plate']['bumpDistanceM'])
        nt.links.new(plate, bump.inputs['Strength'])
        nt.links.new(height, bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m


def add_part(part):
    mesh, mat = part['mesh'], part['material']
    rough, normals, plate, tangent = part_arrays(mesh, mat)
    ob = add_mesh('part', mesh['position'], mesh['index'], normals)
    me = ob.data
    me.attributes.new('rough', 'FLOAT', 'POINT').data.foreach_set('value', rough)
    me.attributes.new('plate', 'FLOAT', 'POINT').data.foreach_set('value', plate)
    # Not "tangent": Cycles resolves that name to the UV tangent, not to this attribute.
    me.attributes.new('path_tangent', 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', tangent)
    me.materials.append(bead_material(mat))
    t = part['toWorld']
    ob.matrix_world = Matrix([[t[c * 4 + r] for c in range(4)] for r in range(4)])
    collection = bpy.data.collections.new('lit_part')
    collection.objects.link(ob)
    return collection


# ---- studio -------------------------------------------------------------------------------

def add_backdrop(b):
    ob = add_mesh('sweep', b['positions'], b['index'], b['normals'])
    m, nt = new_material('backdrop')
    bsdf = node(nt, 'ShaderNodeBsdfPrincipled', **{'Base Color': (*b['albedo'], 1.0), 'Roughness': b['roughness']})
    tex = b.get('texture', 0.0)
    if tex > 0.0:
        texco = nt.nodes.new('ShaderNodeTexCoord')
        cloud = node(nt, 'ShaderNodeTexNoise', Scale=3.2, Detail=3.0)
        tooth = node(nt, 'ShaderNodeTexNoise', Scale=34.0, Detail=4.0)
        fine = node(nt, 'ShaderNodeTexNoise', Scale=180.0, Detail=4.0)
        for n in (cloud, tooth, fine):
            nt.links.new(texco.outputs['Object'], n.inputs['Vector'])

        ca, ta, fa = 0.58 * tex, 0.36 * tex, 0.44 * tex
        cloud_a = math_node(nt, 'MULTIPLY_ADD', cloud.outputs['Fac'], ca, 1.0 - 0.5 * ca)
        tooth_a = math_node(nt, 'MULTIPLY_ADD', tooth.outputs['Fac'], ta, -0.5 * ta)
        fine_a = math_node(nt, 'MULTIPLY_ADD', fine.outputs['Fac'], fa, -0.5 * fa)
        albedo_sum = math_node(nt, 'ADD', math_node(nt, 'ADD', cloud_a, tooth_a), fine_a)
        albedo_fac = node(nt, 'ShaderNodeClamp', Min=0.5, Max=1.5)
        nt.links.new(albedo_sum, albedo_fac.inputs['Value'])

        scaled = nt.nodes.new('ShaderNodeVectorMath')
        scaled.operation = 'SCALE'
        scaled.inputs[0].default_value = tuple(b['albedo'])
        nt.links.new(albedo_fac.outputs['Result'], scaled.inputs['Scale'])
        nt.links.new(scaled.outputs['Vector'], bsdf.inputs['Base Color'])

        cr, tr = 0.70 * tex, 0.55 * tex
        cloud_r = math_node(nt, 'MULTIPLY_ADD', cloud.outputs['Fac'], cr, b['roughness'] - 0.5 * cr)
        tooth_r = math_node(nt, 'MULTIPLY_ADD', tooth.outputs['Fac'], tr, -0.5 * tr)
        rough_clamp = node(nt, 'ShaderNodeClamp', Min=0.05, Max=1.0)
        nt.links.new(math_node(nt, 'ADD', cloud_r, tooth_r), rough_clamp.inputs['Value'])
        nt.links.new(rough_clamp.outputs['Result'], bsdf.inputs['Roughness'])

        bump = node(nt, 'ShaderNodeBump', Distance=0.0008, Strength=0.35 * tex)
        nt.links.new(tooth.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    nt.links.new(bsdf.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs[0])
    ob.data.materials.append(m)
    ob.is_shadow_catcher = b['shadowCatcher']


def add_prop(p):
    """A Principled BSDF at factory settings but base colour and roughness, shaded with the vertex
    normals as given. Not in the part's collection, so the part-only lights do not reach it."""
    g = p['geometry']
    ob = add_mesh(p['id'], g['positions'], g['index'], g['normals'])
    m, nt = new_material(p['id'])
    bsdf = node(nt, 'ShaderNodeBsdfPrincipled', **{'Base Color': (*p['albedo'], 1.0), 'Roughness': p['roughness']})
    nt.links.new(bsdf.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs[0])
    ob.data.materials.append(m)
    t = p['toWorld']
    ob.matrix_world = Matrix([[t[c * 4 + r] for c in range(4)] for r in range(4)])


def add_area(e, part_collection):
    ld = bpy.data.lights.new(e['id'], 'AREA')
    ld.shape = 'ELLIPSE' if e['shape'] == 'ellipse' else 'RECTANGLE'
    ld.size, ld.size_y = e['sizeM']
    ld.energy = e['powerW']
    ld.color = e['color']
    ld.spread = e['spreadRad']
    ob = bpy.data.objects.new(e['id'], ld)
    bpy.context.scene.collection.objects.link(ob)
    # A light emits along local -Z; local Y is the card's y axis.
    x = [-v for v in e['xAxis']]
    z = [-v for v in e['normal']]
    ob.matrix_world = frame_matrix(x, e['yAxis'], z, e['centre'])
    if e['partOnly']:
        link_to_part(ob, part_collection)


def add_scrim(e, part_collection):
    w, h = e['sizeM']
    if e['shape'] == 'ellipse':
        verts = [(0.0, 0.0, 0.0)] + [(0.5 * w * math.cos(a), 0.5 * h * math.sin(a), 0.0)
                                     for a in (2 * math.pi * i / ELLIPSE_SEGMENTS for i in range(ELLIPSE_SEGMENTS))]
        faces = [(0, 1 + i, 1 + (i + 1) % ELLIPSE_SEGMENTS) for i in range(ELLIPSE_SEGMENTS)]
    else:
        verts = [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)]
        faces = [(0, 1, 2, 3)]
    me = bpy.data.meshes.new(e['id'])
    me.from_pydata(verts, [], faces)
    ob = bpy.data.objects.new(e['id'], me)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = frame_matrix(e['xAxis'], e['yAxis'], e['normal'], e['centre'])
    ob.visible_camera = False
    # render.py's scrim: Generated Y mapped from bottom to top radiance.
    m, nt = new_material(e['id'])
    texco = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = node(nt, 'ShaderNodeMapRange', **{'To Min': e['bottomRadiance'], 'To Max': e['topRadiance']})
    emission = node(nt, 'ShaderNodeEmission', Color=(*e['color'], 1.0))
    nt.links.new(texco.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Y'], ramp.inputs['Value'])
    nt.links.new(ramp.outputs[0], emission.inputs['Strength'])
    nt.links.new(emission.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs[0])
    me.materials.append(m)
    if e['partOnly']:
        link_to_part(ob, part_collection)


def add_floor_cards(r, part_collection):
    cx, cy, cz = r['centre']
    z = cz + RING_LIFT_M
    inner, outer = r['innerRadiusM'], r['outerRadiusM']
    # A fan out to the radius where the fade reaches zero; the shader sets the radiance at each point.
    verts = [(cx, cy, z)] + [(cx + outer * math.cos(2 * math.pi * i / RING_SEGMENTS),
                              cy + outer * math.sin(2 * math.pi * i / RING_SEGMENTS), z) for i in range(RING_SEGMENTS)]
    faces = [(0, 1 + i, 1 + (i + 1) % RING_SEGMENTS) for i in range(RING_SEGMENTS)]
    me = bpy.data.meshes.new('floor_cards')
    me.from_pydata(verts, [], faces)
    ob = bpy.data.objects.new('floor_cards', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.visible_camera = ob.visible_diffuse = ob.visible_transmission = False
    ob.visible_volume_scatter = ob.visible_shadow = False
    ob.visible_glossy = True
    link_to_part(ob, part_collection)
    # (far + (key - far) * ((1 + cos(atan2(x - cx, cy - y) - key_azimuth)) / 2)^2) * (1 - smoothstep(inner, outer, r))
    m, nt = new_material('floor_cards')
    geometry = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geometry.outputs['Position'], sep.inputs[0])
    dx = math_node(nt, 'SUBTRACT', sep.outputs['X'], cx)
    dy = math_node(nt, 'SUBTRACT', cy, sep.outputs['Y'])
    azimuth = math_node(nt, 'ARCTAN2', dx, dy)
    cosine = math_node(nt, 'COSINE', math_node(nt, 'SUBTRACT', azimuth, r['keyAzimuthRad']))
    half = math_node(nt, 'MULTIPLY_ADD', cosine, 0.5, 0.5)
    weight = math_node(nt, 'MULTIPLY', half, half)
    radiance = math_node(nt, 'MULTIPLY_ADD', weight, r['keyRadiance'] - r['farRadiance'], r['farRadiance'])
    dist = math_node(nt, 'SQRT', math_node(nt, 'MULTIPLY_ADD', dy, dy, math_node(nt, 'MULTIPLY', dx, dx)))
    t = math_node(nt, 'MULTIPLY_ADD', dist, 1 / (outer - inner), -inner / (outer - inner))
    t.node.use_clamp = True
    smooth = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', t, t), math_node(nt, 'MULTIPLY_ADD', t, -2.0, 3.0))
    fade = math_node(nt, 'MULTIPLY_ADD', smooth, -1.0, 1.0)
    emission = node(nt, 'ShaderNodeEmission', Color=(1.0, 1.0, 1.0, 1.0))
    nt.links.new(math_node(nt, 'MULTIPLY', radiance, fade), emission.inputs['Strength'])
    nt.links.new(emission.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs[0])
    me.materials.append(m)


def add_world(w):
    world = bpy.data.worlds.new('studio')
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(REPO, 'public', 'hdr', w['hdrId'] + '.hdr'))
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Rotation'].default_value = (0, 0, w['rotationRad'])
    texco = nt.nodes.new('ShaderNodeTexCoord')
    bg = node(nt, 'ShaderNodeBackground', Strength=w['strength'])
    nt.links.new(texco.outputs['Generated'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs[0], env.inputs[0])
    nt.links.new(env.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], nt.nodes.new('ShaderNodeOutputWorld').inputs[0])


def add_camera(c):
    cd = bpy.data.cameras.new('camera')
    cd.lens = c['focalMm']
    cd.sensor_width = c['sensorMm']
    cd.sensor_fit = 'AUTO'
    cd.clip_start = c['clipStartM']
    cd.clip_end = 1000.0
    cd.dof.use_dof = c['apertureRadiusM'] > 0
    cd.dof.aperture_fstop = c['fStop']
    cd.dof.focus_distance = c['focusDistanceM']
    ob = bpy.data.objects.new('camera', cd)
    bpy.context.scene.collection.objects.link(ob)
    p = np.array(c['position'])
    fwd = np.array(c['target']) - p
    fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, np.array(c['up']))
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    ob.matrix_world = frame_matrix(right, up, -fwd, p)  # a Blender camera looks down -Z
    bpy.context.scene.camera = ob


# ---- render settings ----------------------------------------------------------------------

def setup_render(f, a, out):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = a.samples or f['samples']
    # f['timeLimitS'] is the booth desk's cap. Native renders always run to the full sample count.
    cy.time_limit = 0
    cy.use_adaptive_sampling = f['adaptiveThreshold'] > 0
    cy.adaptive_threshold = f['adaptiveThreshold']
    cy.adaptive_min_samples = 0
    cy.seed = 0
    cy.use_animated_seed = False
    cy.sampling_pattern = 'AUTOMATIC'
    cy.max_bounces = f['maxBounces']
    cy.diffuse_bounces = f['diffuseBounces']
    cy.glossy_bounces = f['glossyBounces']
    cy.transmission_bounces = f['transmissionBounces']
    cy.volume_bounces = 0
    cy.transparent_max_bounces = 8
    cy.min_light_bounces = 0
    cy.min_transparent_bounces = 0
    cy.caustics_reflective = True
    cy.caustics_refractive = True
    cy.blur_glossy = 1.0
    cy.sample_clamp_direct = f['clampDirect']
    cy.sample_clamp_indirect = f['clampIndirect']
    cy.use_light_tree = True
    cy.light_sampling_threshold = 0.01
    cy.use_guiding = False
    cy.use_fast_gi = False
    # The booth denoises as Blender does with Open Image Denoise and the "Fast" prefilter: colour
    # with the noisy albedo and normal (src/photo/denoise.ts). Parity scenes have it off.
    cy.use_denoising = bool(f.get('denoise', False))
    cy.denoiser = 'OPENIMAGEDENOISE'
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.denoising_prefilter = 'FAST'
    cy.denoising_quality = 'HIGH'
    cy.denoising_use_gpu = False
    cy.pixel_filter_type = 'BLACKMAN_HARRIS'
    cy.filter_width = f['filterWidthPx']
    cy.film_exposure = 1.0
    cy.use_auto_tile = False
    # Cycles reads its debug settings, the BVH layout among them, only with both preferences on.
    prefs = bpy.context.preferences
    prefs.view.show_developer_ui = True
    prefs.experimental.use_cycles_debug = True
    cy.debug_bvh_layout = a.bvh.upper()
    cy.debug_use_spatial_splits = False
    sc.render.use_texture_cache = False
    sc.render.film_transparent = f['transparent']
    sc.render.resolution_x = f['width']
    sc.render.resolution_y = f['height']
    sc.render.resolution_percentage = 100
    sc.render.dither_intensity = 0.0
    if a.threads > 0:
        sc.render.threads_mode = 'FIXED'
        sc.render.threads = a.threads
    if a.view == 'film':
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = AGX_LOOKS[f['look']]
    else:
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    sc.display_settings.display_device = 'sRGB'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA' if f['transparent'] else 'RGB'
    sc.render.image_settings.color_depth = '8'
    sc.render.filepath = os.path.abspath(out)


def main():
    a = args()
    t0 = time.perf_counter()
    s = load(a.scene)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    part_collection = add_part(s['part']) if s['part'] else None
    add_backdrop(s['backdrop'])
    for p in s['props']:
        add_prop(p)
    for e in s['lights']['emitters']:
        (add_area if e['kind'] == 'area' else add_scrim)(e, part_collection)
    if s['lights']['floorCards']:
        add_floor_cards(s['lights']['floorCards'], part_collection)
    add_world(s['world'])
    add_camera(s['camera'])
    setup_render(s['film'], a, a.out)
    t1 = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    t2 = time.perf_counter()
    print(f'BOOTH_NATIVE build {t1 - t0:.2f}s render {t2 - t1:.2f}s bvh {a.bvh} '
          f'threads {bpy.context.scene.render.threads} samples {bpy.context.scene.cycles.samples}', flush=True)


main()
