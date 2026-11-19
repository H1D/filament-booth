"""Bake Blender 5.2.3's AgX view transform into the LUT files the app ships (public/lut/).

Run from the repo root:
  ~/apps/blender-5.2.3-linux-x64/blender -b --factory-startup -P tools/blender/bake_agx.py -- bake
  ~/apps/blender-5.2.3-linux-x64/blender -b --factory-startup -P tools/blender/bake_agx.py -- study

`bake` writes public/lut/. `study` prints the interpolation error that chose PRE_SIZE and PRE_LOG2_MAX.
Both first check the OCIO path below against Blender's own image save.

How Blender forms the image, which is what the LUTs mirror. Scene-linear Rec.709 goes through the look
(applied in "AgX Log", a log encoding of an inset Rec.2020), then to E-Gamut, a log2 shaper, Blender's
own 57^3 cube (AgX_Base_sRGB.cube, hard-clipped to the display gamut), then the display decode
srgb_oetf(c^2.4). PyOpenColorIO ships inside Blender and expresses all of it as a LookTransform plus a
DisplayViewTransform, so the bake needs no render. Blender's save path is used only to check that.

Why this layout, measured against OCIO on 30000 random probes (study):
  One 3D LUT per look, resampled on its own grid: worst error 12 to 39/255 at 49^3 in Rec.709 log and
  21 to 28/255 at 49^3 in E-Gamut log. The cube hard-clips to the display gamut and a coarser grid
  cannot follow the clip edge.
  Blender's cube as the one shared base, tetrahedral: 0.07/255. Trilinear on the same cube: 13.8/255, so
  the cube stage must be tetrahedral on the GPU too.
  The look then only moves the shaper coordinate before the cube. Indexed by E-Gamut log that warp is
  98% outside Rec.709 and ruined by gamut-edge nodes (14 to 190/255). Indexed by Rec.709 log every node
  is a real colour and the warp is smooth.

Files and format (manifest.json repeats every number a reader needs):
  texel       3 x IEEE half float, little endian. Red varies fastest, then green, then blue.
  base shaper e = toWorking @ rgb (Rec.709 to E-Gamut); t = max((log2 e - log2Min) / (log2Max - log2Min), tFloor),
              e <= 0 gives tFloor. t is only clamped to 0..1 after the pre-warp is added. log2Min is 10 stops below scene grey 0.18, log2Max is 15 above it.
  agx-base    57^3 grid on t, node k at k / 56. Values are the cube's, encoded with the 2.4 power, 0..1.
  pre shaper  s = clamp((log2 v - log2Min) / (preLog2Max - log2Min), 0, 1) per Rec.709 channel v, v <= 0 gives 0.
  agx-<look>  PRE_SIZE^3 grid on s, node k at k / (PRE_SIZE - 1). Value is the look's change to the unclamped t.
              "none" has no file: its change is zero.
  per pixel   t' = clamp(t + trilinear(pre, s), 0, 1);  c = tetrahedral(base, t');  out = srgb_oetf(max(c, 0)^2.4).
"""
import gzip
import json
import os
import sys
import tempfile

import bpy
import numpy as np
import PyOpenColorIO as OCIO

LOOKS = {  # app look id -> Blender look name. 'none' is Blender's "None": no look transform.
    'none': None,
    'punchy': 'AgX - Punchy',
    'low-contrast': 'AgX - Low Contrast',
    'medium-low-contrast': 'AgX - Medium Low Contrast',
    'medium-high-contrast': 'AgX - Medium High Contrast',
    'high-contrast': 'AgX - High Contrast',
}
LOG2_MIN = -12.47393
LOG2_MAX = 12.5260688117  # both from the AllocationTransform in Blender's config
FLOOR_T = -4.0  # keeps log finite for a channel at or below zero
CUBE = 'AgX_Base_sRGB.cube'
PRE_SIZE = 49
PRE_LOG2_MAX = 8.0


def datafiles():
    return os.path.join(bpy.utils.system_resource('DATAFILES'), 'colormanagement')


def blender_config():
    return OCIO.Config.CreateFromFile(os.path.join(datafiles(), 'config.ocio'))


def look_transform(look_name):
    look = OCIO.LookTransform()
    look.setSrc('Linear Rec.709')
    look.setDst('Linear Rec.709')
    look.setLooks(look_name)
    return look


def look_processor(config, look_name):
    return config.getProcessor(look_transform(look_name)).getDefaultCPUProcessor()


def full_processor(config, look_name):
    group = OCIO.GroupTransform()
    if look_name is not None:
        group.appendTransform(look_transform(look_name))
    view = OCIO.DisplayViewTransform()
    view.setSrc('Linear Rec.709')
    view.setDisplay('sRGB')
    view.setView('AgX')
    group.appendTransform(view)
    return config.getProcessor(group).getDefaultCPUProcessor()


def apply(cpu, rgb):
    out = np.ascontiguousarray(rgb, dtype=np.float32).copy()
    cpu.applyRGB(out)
    return out.astype(np.float64)


def working_matrix(config):
    """Rec.709 to Linear FilmLight E-Gamut, rows are outputs, rounded to 9 digits."""
    xform = OCIO.ColorSpaceTransform()
    xform.setSrc('Linear Rec.709')
    xform.setDst('Linear FilmLight E-Gamut')
    basis = np.eye(3, dtype=np.float32)
    config.getProcessor(xform).getDefaultCPUProcessor().applyRGB(basis)
    return np.array([float(f'{x:.9g}') for x in basis.T.ravel()]).reshape(3, 3)


def to_t(rgb, matrix, clamp=True):
    """The base shaper coordinate. Unclamped it keeps falling below 0 as a channel shrinks, as it does in
    OCIO between a look and the cube, so a look's change stays smooth there."""
    e = rgb @ matrix.T
    t = np.maximum((np.log2(np.maximum(e, 1e-30)) - LOG2_MIN) / (LOG2_MAX - LOG2_MIN), FLOOR_T)
    return np.clip(t, 0.0, 1.0) if clamp else t


def to_s(rgb, log2_max):
    s = (np.log2(np.maximum(rgb, 1e-30)) - LOG2_MIN) / (log2_max - LOG2_MIN)
    return np.clip(s, 0.0, 1.0)


def read_cube():
    with open(os.path.join(datafiles(), 'luts', CUBE)) as f:
        lines = f.read().splitlines()
    size = int(next(l for l in lines if l.startswith('LUT_3D_SIZE')).split()[1])
    rows = np.array([[float(x) for x in l.split()] for l in lines if l and (l[0].isdigit() or l[0] == '-')][-size ** 3:])
    return rows.reshape(size, size, size, 3)  # [blue][green][red], the .cube order is red fastest


def display(c):
    lin = np.maximum(c, 0.0) ** 2.4
    return np.clip(np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055), 0.0, 1.0)


def half(a):
    return a.astype(np.float16).astype(np.float64)


def lookup(grid, coord, tetrahedral):
    size = grid.shape[0]
    u = coord * (size - 1)
    i = np.minimum(np.floor(u).astype(int), size - 2)
    f = u - i
    fr, fg, fb = f[:, 0], f[:, 1], f[:, 2]

    def at(dr, dg, db):
        return grid[i[:, 2] + db, i[:, 1] + dg, i[:, 0] + dr]

    if not tetrahedral:
        out = 0.0
        for dr in (0, 1):
            for dg in (0, 1):
                for db in (0, 1):
                    w = (fr if dr else 1 - fr) * (fg if dg else 1 - fg) * (fb if db else 1 - fb)
                    out = out + w[:, None] * at(dr, dg, db)
        return out
    # The six tetrahedra of a cell, picked by the order of the fractions, as OCIO does.
    c000, c111 = at(0, 0, 0), at(1, 1, 1)
    out = np.empty_like(c000)
    rg, gb, rb = fr >= fg, fg >= fb, fr >= fb
    cases = [
        (rg & gb, at(1, 0, 0), at(1, 1, 0), (1 - fr, fr - fg, fg - fb, fb)),
        (rg & ~gb & rb, at(1, 0, 0), at(1, 0, 1), (1 - fr, fr - fb, fb - fg, fg)),
        (rg & ~gb & ~rb, at(0, 0, 1), at(1, 0, 1), (1 - fb, fb - fr, fr - fg, fg)),
        (~rg & gb & rb, at(0, 1, 0), at(1, 1, 0), (1 - fg, fg - fr, fr - fb, fb)),
        (~rg & gb & ~rb, at(0, 1, 0), at(0, 1, 1), (1 - fg, fg - fb, fb - fr, fr)),
        (~rg & ~gb, at(0, 0, 1), at(0, 1, 1), (1 - fb, fb - fg, fg - fr, fr)),
    ]
    for mask, c1, c2, w in cases:
        out[mask] = (w[0][:, None] * c000 + w[1][:, None] * c1 + w[2][:, None] * c2 + w[3][:, None] * c111)[mask]
    return out


def bake_pre(config, matrix, look_name, size, log2_max):
    """What the look does to the unclamped t, on a grid of Rec.709 colours, rounded through half float."""
    v = 2.0 ** (LOG2_MIN + np.arange(size) / (size - 1) * (log2_max - LOG2_MIN))
    b, g, r = np.meshgrid(v, v, v, indexing='ij')
    rgb = np.stack([r, g, b], axis=-1).reshape(-1, 3)
    warped = apply(look_processor(config, look_name), rgb)
    return half(to_t(warped, matrix, clamp=False) - to_t(rgb, matrix, clamp=False)).reshape(size, size, size, 3)


def pipeline(rgb, matrix, cube, pre, log2_max, tetrahedral=True):
    t = to_t(rgb, matrix, clamp=False)
    if pre is not None:
        t = t + lookup(pre, to_s(rgb, log2_max), False)
    return display(lookup(cube, np.clip(t, 0.0, 1.0), tetrahedral))


def random_probes(n, seed, hi_stops):
    """Linear Rec.709 from deep shadow to hi_stops over 1.0: independent log-uniform channels (mostly
    very saturated), tinted greys of every saturation, and colours with channels that are exactly zero."""
    rng = np.random.default_rng(seed)
    third = n // 3
    independent = 2.0 ** rng.uniform(-12.0, hi_stops, (third, 3))
    level = 2.0 ** rng.uniform(-12.0, hi_stops, (third, 1))
    tint = rng.uniform(0.0, 1.0, (third, 3))
    sat = rng.uniform(0.0, 1.0, (third, 1))
    tinted = level * ((1 - sat) + sat * tint)
    zeros = 2.0 ** rng.uniform(-8.0, hi_stops, (n - 2 * third, 3))
    zeros[rng.random(zeros.shape) < 0.45] = 0.0
    return np.concatenate([independent, tinted, zeros])


def check_against_blender(config):
    """The OCIO path must equal what Blender writes for a rendered still: view settings, 16-bit PNG, no dither."""
    probes = random_probes(300, 7, 4.0).astype(np.float32)
    probes = np.concatenate([probes, np.array([[g, g, g] for g in (0.0, 0.18, 1.0, 16.0)], np.float32)])
    sc = bpy.context.scene
    sc.display_settings.display_device = 'sRGB'
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '16'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.dither_intensity = 0.0
    img = bpy.data.images.new('bake_check', width=len(probes), height=1, float_buffer=True, alpha=True)
    img.colorspace_settings.name = 'Linear Rec.709'
    flat = np.ones((len(probes), 4), np.float32)
    flat[:, :3] = probes
    img.pixels = flat.ravel().tolist()
    tmp = tempfile.mkdtemp()
    worst = 0.0
    for app_look, blender_look in LOOKS.items():
        sc.view_settings.look = blender_look or 'None'
        path = os.path.join(tmp, f'{app_look}.png')
        img.save_render(path, scene=sc)
        saved = bpy.data.images.load(path, check_existing=False)
        saved.colorspace_settings.name = 'Non-Color'
        theirs = np.array(saved.pixels, np.float64).reshape(-1, 4)[:, :3]
        bpy.data.images.remove(saved)
        ours = np.clip(apply(full_processor(config, blender_look), probes), 0.0, 1.0)
        diff = np.abs(ours - theirs).max() * 255
        worst = max(worst, diff)
        print(f'  OCIO vs Blender save, {app_look}: worst {diff:.4f}/255 over {len(probes)} probes')
    return worst


def study(config):
    matrix = working_matrix(config)
    raw_cube = read_cube()
    cube = half(raw_cube)
    probes = random_probes(30000, 11, 6.0)
    print(f'{len(probes)} probes per look, 2^-12 to 2^6 over white. Error = |LUT - OCIO| in 1/255, no rounding.')
    truth = {name: np.clip(apply(full_processor(config, look), probes), 0, 1) for name, look in LOOKS.items()}
    for label, grid, tetra in (('half float, tetrahedral', cube, True), ('float32, tetrahedral', raw_cube, True),
                               ('half float, trilinear', cube, False)):
        err = np.abs(pipeline(probes, matrix, grid, None, PRE_LOG2_MAX, tetra) - truth['none']).max() * 255
        print(f'none, cube only, {label}: worst {err:.3f}')
    for log2_max in (6.0, 8.0):
        for size in (17, 25, 33, 41, 49):
            row = []
            for name, look in LOOKS.items():
                if look is None:
                    continue
                pre = bake_pre(config, matrix, look, size, log2_max)
                e = np.abs(pipeline(probes, matrix, cube, pre, log2_max) - truth[name]).max(axis=1) * 255
                row.append(f'{name}: {e.max():.2f} (p99.9 {np.percentile(e, 99.9):.2f})')
            print(f'preLog2Max {log2_max:.0f}, pre {size}^3, worst: ' + '  '.join(row))


def write(path, a):
    data = a.astype('<f2').tobytes()
    with open(path, 'wb') as f:
        f.write(data)
    return len(data), len(gzip.compress(data, 9))


def bake(config, out_dir):
    matrix = working_matrix(config)
    os.makedirs(out_dir, exist_ok=True)
    cube = read_cube()
    sizes = {'base': write(os.path.join(out_dir, 'agx-base.bin'), cube)}
    looks = {}
    for name, look in LOOKS.items():
        if look is None:
            looks[name] = None
            continue
        looks[name] = {'file': f'agx-{name}.bin', 'size': PRE_SIZE}
        sizes[name] = write(os.path.join(out_dir, looks[name]['file']), bake_pre(config, matrix, look, PRE_SIZE, PRE_LOG2_MAX))
    manifest = {
        'format': 'agx-lut-2',
        'blender': bpy.app.version_string,
        'toWorking': matrix.ravel().tolist(),
        'log2Min': LOG2_MIN,
        'log2Max': LOG2_MAX,
        'preLog2Max': PRE_LOG2_MAX,
        'tFloor': FLOOR_T,
        'base': {'file': 'agx-base.bin', 'size': cube.shape[0]},
        'looks': looks,
    }
    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    for name, (raw, gz) in sizes.items():
        print(f'  {name}: {raw} bytes, {gz} gzip')
    print(f'total: {sum(s[0] for s in sizes.values())} bytes raw, {sum(s[1] for s in sizes.values())} gzip')


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    mode = args[0] if args else 'bake'
    config = blender_config()
    print('Blender', bpy.app.version_string, 'OpenColorIO', OCIO.__version__)
    worst = check_against_blender(config)
    if worst > 0.05:
        raise SystemExit(f'OCIO path disagrees with Blender by {worst:.3f}/255; do not trust the bake')
    if mode == 'study':
        study(config)
    else:
        bake(config, args[1] if len(args) > 1 else 'public/lut')


main()
