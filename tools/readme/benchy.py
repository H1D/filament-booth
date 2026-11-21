import bpy, math

bpy.ops.wm.stl_import(filepath="3DBenchy.stl")
boat = bpy.context.object
boat.rotation_euler.z = math.radians(-35)

scene = bpy.context.scene
scene.camera.data.lens = 105
scene.render.resolution_x = scene.render.resolution_y = 1600
scene.cycles.samples = 64

color = bpy.data.materials["Filament"].node_tree.nodes["Principled BSDF"].inputs["Base Color"]
shots = [
    ("orange", "PLA_BASIC", (1.0, 0.16, 0.01, 1), "STUDIO"),
    ("gold", "PLA_SILK", (0.83, 0.52, 0.10, 1), "DARK"),
    ("teal", "PLA_MATTE", (0.0, 0.25, 0.27, 1), "RIM"),
]
for name, preset, rgba, look in shots:
    bpy.ops.booth.filament_apply(preset=preset)
    color.default_value = rgba
    bpy.ops.booth.look_apply(look=look)
    scene.render.filepath = f"renders/benchy-{name}.png"
    bpy.ops.render.render(write_still=True)
    print("saved", scene.render.filepath)
