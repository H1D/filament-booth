"""Ground truth for scene.ts kelvinToRgb: Blender's own light temperature colour.

Run: ~/apps/blender-5.2.3-linux-x64/blender -b --factory-startup -P tools/blender/kelvin_truth.py
Prints KELVIN {"kelvin": K, "rgb": [r, g, b]} per temperature: linear Rec.709, as Blender stores it.
"""
import bpy, json

ld = bpy.data.lights.new('t', 'AREA')
ld.use_temperature = True
for k in (1900, 2700, 3200, 4000, 5000, 5600, 6500, 8000, 10000):
    ld.temperature = k
    print('KELVIN ' + json.dumps({'kelvin': k, 'rgb': [round(c, 6) for c in ld.temperature_color]}))
