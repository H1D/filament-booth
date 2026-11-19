"""Ground truth for src/film.ts: what native Blender 5.2.3 writes for linear Rec.709 through its AgX view.

Run from the repo root:
  ~/apps/blender-5.2.3-linux-x64/blender -b --factory-startup -P tools/blender/agx_truth.py -- probes tests/fixtures
  ~/apps/blender-5.2.3-linux-x64/blender -b --factory-startup -P tools/blender/agx_truth.py -- image tests/fixtures

probes  writes agx-probes.json: the fixed probes the first film tests used plus 400 seeded random ones,
        each through every look, as 16-bit display sRGB integers.
image   renders a small Cycles scene, keeps its linear float frame (agx-image.f32, RGBA float32 little
        endian) and the 8-bit RGBA Blender writes for it (agx-image.u8). It also renders the same scene
        straight to PNG and prints how far that differs from the saved-from-float path the other
        outputs use, so the two can be trusted to be one path.

Everything goes through Image.save_render with the scene's view settings, 16-bit or 8-bit PNG, dither off:
the code a rendered still goes through.
"""
import json
import os
import sys

import bpy
import numpy as np

LOOKS = {
    'none': 'None',
    'punchy': 'AgX - Punchy',
    'low-contrast': 'AgX - Low Contrast',
    'medium-low-contrast': 'AgX - Medium Low Contrast',
    'medium-high-contrast': 'AgX - Medium High Contrast',
    'high-contrast': 'AgX - High Contrast',
}
GREYS = [0.0, 0.002, 0.01, 0.03, 0.05, 0.1, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.5, 2.0, 4.0, 8.0, 16.0, 0.55]
COLOURS = [(0.18, 0.02, 0.02), (0.02, 0.18, 0.02), (0.02, 0.02, 0.18), (0.8, 0.3, 0.1), (0.4, 0.25, 0.2),
           (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (0.9, 0.8, 0.1), (0.1, 0.6, 0.7),
           (0.0116, 0.0116, 0.0116)]
RANDOM_PER_KIND = 100


def fixed_probes():
    return np.array([(g, g, g) for g in GREYS] + COLOURS, np.float32)


def random_probes():
    """Four kinds, from deep shadow (2^-10) to 6 stops over white: near-neutral tints, independent channels,
    one dominant channel over weak ones including exact zeros, and scene-like colours of 30 to 100% saturation."""
    rng = np.random.default_rng(20261119)
    n = RANDOM_PER_KIND
    level = 2.0 ** rng.uniform(-10, 5, (n, 1))
    near_neutral = level * (1 - 0.5 * rng.random((n, 1)) * (1 - rng.random((n, 3))))
    independent = 2.0 ** rng.uniform(-8, 4, (n, 3))
    dominant = 2.0 ** rng.uniform(-6, 5, (n, 1)) * np.where(
        rng.random((n, 3)) < 0.3, 0.0, 10.0 ** -rng.uniform(0, 3, (n, 3)))
    dominant[np.arange(n), rng.integers(0, 3, n)] = 2.0 ** rng.uniform(-6, 5, n)
    sat = rng.uniform(0.3, 1.0, (n, 1))
    scene_like = 2.0 ** rng.uniform(-6, 6, (n, 1)) * ((1 - sat) + sat * rng.random((n, 3)))
    return np.concatenate([near_neutral, independent, dominant, scene_like]).astype(np.float32)


def configure_view(scene, look, depth):
    scene.display_settings.display_device = 'sRGB'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = look
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = depth
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.dither_intensity = 0.0


def through_blender(linear_image, scene, path):
    """Blender's display image for a linear float image, as 0..1 floats, RGBA."""
    linear_image.save_render(path, scene=scene)
    saved = bpy.data.images.load(path, check_existing=False)
    saved.colorspace_settings.name = 'Non-Color'
    px = np.array(saved.pixels, np.float64).reshape(-1, 4)
    bpy.data.images.remove(saved)
    return px


def linear_image(name, width, height, rgb):
    img = bpy.data.images.new(name, width=width, height=height, float_buffer=True, alpha=True)
    img.colorspace_settings.name = 'Linear Rec.709'
    flat = np.ones((width * height, 4), np.float32)
    flat[:, :3] = rgb
    img.pixels = flat.ravel().tolist()
    return img


def write_probes(out_dir):
    scene = bpy.context.scene
    fixed, rand = fixed_probes(), random_probes()
    probes = np.concatenate([fixed, rand])
    img = linear_image('probes', len(probes), 1, probes)
    looks = {}
    for name, blender_look in LOOKS.items():
        configure_view(scene, blender_look, '16')
        px = through_blender(img, scene, os.path.join(bpy.app.tempdir, f'{name}.png'))
        looks[name] = np.rint(px[:, :3] * 65535).astype(int).tolist()
    path = os.path.join(out_dir, 'agx-probes.json')
    with open(path, 'w') as f:
        json.dump({'fixed': len(fixed), 'probes': np.round(probes.astype(np.float64), 7).tolist(), 'looks': looks}, f, separators=(',', ':'))
    print(f'wrote {path}: {len(fixed)} fixed + {len(rand)} random probes x {len(LOOKS)} looks')


def build_scene(scene):
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)

    def material(colour, roughness, metallic=0.0):
        mat = bpy.data.materials.new('m')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*colour, 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
        return mat

    bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, 0))
    bpy.context.object.data.materials.append(material((0.45, 0.45, 0.45), 0.6))
    spheres = [((0.8, 0.05, 0.04), 0.35, 0.0), ((0.06, 0.55, 0.1), 0.45, 0.0), ((0.05, 0.1, 0.8), 0.25, 0.0),
               ((0.9, 0.75, 0.05), 0.4, 0.0), ((0.18, 0.18, 0.18), 0.7, 0.0), ((0.95, 0.95, 0.95), 0.1, 1.0)]
    for k, (colour, rough, metal) in enumerate(spheres):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.7, location=(-3.2 + k * 1.28, 0, 0.7), segments=48, ring_count=24)
        bpy.ops.object.shade_smooth()
        bpy.context.object.data.materials.append(material(colour, rough, metal))
    bpy.ops.object.light_add(type='AREA', location=(-2, -3, 5))
    light = bpy.context.object
    light.data.energy = 900
    light.data.size = 2.5
    light.rotation_euler = (0.5, -0.3, 0)
    bpy.ops.object.camera_add(location=(0, -8.5, 3.0))
    cam = bpy.context.object
    cam.rotation_euler = (np.deg2rad(77), 0, 0)
    scene.camera = cam
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.03, 0.035, 0.05, 1.0)
    scene.world = world
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.cycles.seed = 3
    scene.render.resolution_x, scene.render.resolution_y = 320, 160
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False


def write_image(out_dir):
    scene = bpy.context.scene
    build_scene(scene)
    look = 'AgX - Medium High Contrast'
    exr = os.path.join(bpy.app.tempdir, 'frame.exr')
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '32'
    scene.render.filepath = exr
    bpy.ops.render.render(write_still=True)
    frame = bpy.data.images.load(exr, check_existing=False)
    frame.colorspace_settings.name = 'Linear Rec.709'
    linear = np.array(frame.pixels, np.float32)
    width, height = frame.size
    configure_view(scene, look, '8')
    saved = through_blender(frame, scene, os.path.join(bpy.app.tempdir, 'saved.png'))
    u8 = np.rint(saved * 255).astype(np.uint8)

    png = os.path.join(bpy.app.tempdir, 'direct.png')
    scene.render.filepath = png
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    direct = bpy.data.images.load(png, check_existing=False)
    direct.colorspace_settings.name = 'Non-Color'
    direct_u8 = np.rint(np.array(direct.pixels, np.float64).reshape(-1, 4) * 255).astype(np.uint8)

    px = linear.reshape(-1, 4)
    print(f'frame {width}x{height}, linear min {px[:, :3].min():.5f}, max {px[:, :3].max():.2f}, '
          f'{100 * (px[:, :3].max(axis=1) > 1).mean():.1f}% of pixels have a channel over 1.0')
    print(f'render-to-PNG vs save-from-float: worst {np.abs(direct_u8.astype(int) - u8.astype(int)).max()} levels, '
          f'{100 * (direct_u8 != u8).any(axis=1).mean():.2f}% of pixels differ')
    linear.astype('<f4').tofile(os.path.join(out_dir, 'agx-image.f32'))
    u8.tofile(os.path.join(out_dir, 'agx-image.u8'))
    with open(os.path.join(out_dir, 'agx-image.json'), 'w') as f:
        json.dump({'width': width, 'height': height, 'look': 'medium-high-contrast'}, f)
    print(f'wrote agx-image.{{f32,u8,json}} in {out_dir}')


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    mode, out_dir = args[0], args[1]
    os.makedirs(out_dir, exist_ok=True)
    {'probes': write_probes, 'image': write_image}[mode](out_dir)


main()
