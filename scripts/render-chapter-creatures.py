"""Render four atlas views for the web chapter models."""
import bpy
from mathutils import Vector
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for name in ('coelacanth', 'amniote', 'manatee'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root / 'public' / 'stages' / 'creatures' / f'{name}.glb'))
    mesh = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
    for obj in bpy.context.scene.objects:
        obj.select_set(obj == mesh)
    bpy.context.view_layer.objects.active = mesh
    mesh.rotation_euler = (0, 0, 0)
    world = bpy.data.worlds.new('Preview world')
    bpy.context.scene.world = world
    world.color = (0.4, 0.4, 0.4)
    camera_data = bpy.data.cameras.new('Preview camera')
    camera = bpy.data.objects.new('Preview camera', camera_data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 2.6
    for location in ((3, 4, 5), (-3, 4, -5)):
        light_data = bpy.data.lights.new('Preview light', 'AREA')
        light_data.energy = 500
        light_data.shape = 'DISK'
        light_data.size = 5
        light = bpy.data.objects.new('Preview light', light_data)
        bpy.context.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (Vector((0, .3, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = True
    for index, location in enumerate(((0, .8, 4), (4, 1.2, 0), (0, .8, -4), (0, 4, .1))):
        camera.location = location
        camera.rotation_euler = (Vector((0, .3, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(root / 'public' / 'atlas' / f'{name}-{index}.png')
        bpy.ops.render.render(write_still=True)
