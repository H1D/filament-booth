"""Ground truth for scene.ts solveCamera and solveLight, built exactly as render.py builds them.

Run: ~/apps/blender-5.2.3-linux-x64/blender -b --factory-startup -P tools/blender/camera_and_lights_truth.py
Prints one JSON line per case, prefixed CAMERA or LIGHT. tests/scene.test.ts embeds the output.
"""
import bpy, json, math
from mathutils import Vector


def camera(name, shot, aim, cam):
    az, el, dist = cam
    aim = Vector(aim)
    d = Vector((math.sin(math.radians(az)) * math.cos(math.radians(el)),
                -math.cos(math.radians(az)) * math.cos(math.radians(el)),
                math.sin(math.radians(el))))
    cd = bpy.data.cameras.new('cam')
    cd.lens = shot['lens']
    cd.sensor_width = 36
    cd.sensor_fit = 'AUTO'
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = shot['fstop']
    cd.dof.focus_distance = dist
    cd.clip_start = 0.01
    ob = bpy.data.objects.new('cam', cd)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = aim + d * dist
    ob.rotation_euler = (aim - ob.location).to_track_quat('-Z', 'Y').to_euler()
    sc = bpy.context.scene
    sc.camera = ob
    sc.render.resolution_x, sc.render.resolution_y = shot['res']
    sc.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    # Camera.angle_y ignores the render resolution, so measure the real frustum: the view frame
    # corners (tr, br, bl, tl) for the scene's resolution and sensor fit, in camera space.
    tr, br, bl, tl = cd.view_frame(scene=sc)
    depth = -tr.z
    fov_y = 2 * math.atan((tl.y - bl.y) / 2 / depth)
    fov_x = 2 * math.atan((tr.x - tl.x) / 2 / depth)
    print('CAMERA ' + json.dumps({
        'name': name, 'cam': cam, 'aim': list(aim), 'lens': cd.lens, 'fstop': shot['fstop'], 'res': shot['res'],
        'position': list(ob.matrix_world.translation),
        'fov_y': fov_y, 'fov_x': fov_x,
        'forward': list(-(ob.matrix_world.col[2].xyz)),
        'up': list(ob.matrix_world.col[1].xyz),
        'aperture_radius_m': cd.dof.aperture_fstop and cd.lens / cd.dof.aperture_fstop / 2 / 1000,
    }))


def light(name, kind, loc, aim, size):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.size, ld.size_y = size
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    track = '-Z' if kind == 'area' else 'Z'
    ob.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat(track, 'Y').to_euler()
    bpy.context.view_layer.update()
    m = ob.matrix_world
    print('LIGHT ' + json.dumps({
        'name': name, 'kind': kind, 'loc': list(loc), 'aim': list(aim), 'size': list(size),
        'colX': list(m.col[0].xyz), 'colY': list(m.col[1].xyz), 'colZ': list(m.col[2].xyz),
    }))


camera('hero_light', {'lens': 85, 'fstop': 11, 'res': [1600, 2000]}, (0, 0, 0.088), (0, 22, 0.8))
camera('macro_landscape', {'lens': 100, 'fstop': 4, 'res': [2000, 1600]}, (0.012, -0.02, 0.075), (-15, 35, 0.25))
camera('side_az', {'lens': 50, 'fstop': 8, 'res': [1000, 1000]}, (0, 0, 0.05), (40, 10, 0.5))

C = (0, 0, 0.09)
light('top', 'area', (0.0, -0.1, 1.0), C, (1.2, 0.9))
light('left', 'area', (-0.75, -0.25, 0.4), C, (0.3, 1.2))
light('rim_l', 'area', (-0.3, 0.85, 0.35), C, (0.08, 1.0))
light('front', 'area', (0.0, -2.2, 0.55), C, (2.0, 0.8))
light('scrim_right', 'scrim', (0.85, 0.32, 0.45), C, (1.4, 1.8))
light('scrim_left', 'scrim', (-0.85, 0.6, 0.45), C, (1.2, 1.6))
light('overhead', 'area', (0.0, 0.0, 1.1), C, (1.4, 0.3))
light('overhead_scrim', 'scrim', (0.0, 0.0, 1.1), C, (1.4, 0.3))
light('below', 'area', (0.3, -0.2, -0.5), C, (1.0, 0.5))
light('straight_up', 'area', (0.0, 0.0, -1.0), C, (1.0, 0.5))
light('straight_up_scrim', 'scrim', (0.0, 0.0, -1.0), C, (1.0, 0.5))
light('near_vertical_1e-3', 'area', (1e-3, 0.0, 1.09), C, (1.0, 0.5))
light('near_vertical_1e-5', 'area', (1e-5, 0.0, 1.09), C, (1.0, 0.5))
light('near_vertical_1e-7', 'area', (1e-7, 0.0, 1.09), C, (1.0, 0.5))
