"""Ground truth for film.ts agx(): linear Rec.709 probes through Blender's AgX view with each look.

Run: ~/apps/blender-5.2.3-linux-x64/blender -b --factory-startup -P tools/blender/agx_truth.py
Prints one JSON line per look, prefixed AGX: {"look": ..., "probes": [[[r, g, b], [R, G, B]], ...]}
with R, G, B the 16-bit display-referred sRGB values as 0..1. Blender writes the numbers through the
same code path as a rendered still (Image.save_render with the scene's view settings), dither off.
"""
import bpy, json, os, tempfile

GREYS = [0.0, 0.002, 0.01, 0.03, 0.05, 0.1, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.5, 2.0, 4.0, 8.0, 16.0]
COLOURS = [(0.18, 0.02, 0.02), (0.02, 0.18, 0.02), (0.02, 0.02, 0.18), (0.8, 0.3, 0.1), (0.4, 0.25, 0.2),
           (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (0.9, 0.8, 0.1), (0.1, 0.6, 0.7),
           (0.0116, 0.0116, 0.0116), (0.55, 0.55, 0.55)]
PROBES = [(g, g, g) for g in GREYS] + COLOURS
LOOKS = ['None', 'AgX - Punchy', 'AgX - Low Contrast', 'AgX - Medium Low Contrast',
         'AgX - Medium High Contrast', 'AgX - High Contrast']

sc = bpy.context.scene
sc.display_settings.display_device = 'sRGB'
sc.view_settings.view_transform = 'AgX'
sc.view_settings.exposure = 0.0
sc.view_settings.gamma = 1.0
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_depth = '16'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.dither_intensity = 0.0

n = len(PROBES)
img = bpy.data.images.new('probe', width=n, height=1, float_buffer=True, alpha=True)
img.colorspace_settings.name = 'Linear Rec.709'
flat = []
for r, g, b in PROBES:
    flat += [r, g, b, 1.0]
img.pixels = flat

tmp = tempfile.mkdtemp()
for look in LOOKS:
    sc.view_settings.look = look
    path = os.path.join(tmp, 'out.png')
    img.save_render(path, scene=sc)
    out = bpy.data.images.load(path, check_existing=False)
    out.colorspace_settings.name = 'Non-Color'
    px = list(out.pixels)
    probes = [[list(PROBES[i]), [round(px[i * 4 + c], 6) for c in range(3)]] for i in range(n)]
    print('AGX ' + json.dumps({'look': look, 'probes': probes}))
    bpy.data.images.remove(out)
