import bpy, math
bpy.ops.wm.stl_import(filepath="3DBenchy.stl")
boat = bpy.context.object
boat.rotation_euler.z = math.radians(-35)
bpy.ops.booth.filament_apply(preset="PLA_BASIC")
bpy.data.materials["Filament"].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (1.0, 0.16, 0.01, 1)
scene = bpy.context.scene
cam = scene.camera
scene.render.resolution_x = 2000
scene.render.resolution_y = 1000
scene.cycles.samples = 64
cam.data.lens = 135
cam.booth.target = (0.006, 0.0, 0.025)
cam.data.dof.aperture_fstop = 32
cam.data.dof.focus_distance = 0.2
for look in ("RAKING", "STUDIO"):
    bpy.ops.booth.look_apply(look=look)
    scene.render.filepath = f"hero/closeup-{look.lower()}.png"
    bpy.ops.render.render(write_still=True)
