import bpy, pathlib, json
from mathutils import Vector
root=pathlib.Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
report={}
for kind in ['rock','vent']:
 bpy.ops.import_scene.gltf(filepath=str(root/'assets/source'/kind/'base_basic_pbr.glb'))
 o=bpy.context.selected_objects[0]
 print(kind,'DIM',list(o.dimensions),'ROT',list(o.rotation_euler),'SCALE',list(o.scale),'VERTS',len(o.data.vertices),'FACES',len(o.data.polygons))
 report[kind]={'dimensions':list(o.dimensions),'vertices':len(o.data.vertices),'faces':len(o.data.polygons),'uv_layers':len(o.data.uv_layers),'textures':[{'name':im.name,'size':list(im.size)} for im in bpy.data.images if im.type=='IMAGE']}
 o.location.x=-1.3 if kind=='rock' else 1.3
world=bpy.context.scene.world; world.color=(0.15,0.15,0.15)
bpy.ops.object.light_add(type='AREA',location=(2,-4,6)); bpy.context.object.data.energy=1000; bpy.context.object.data.shape='DISK'; bpy.context.object.data.size=5
bpy.ops.object.camera_add(location=(4,-7,3)); cam=bpy.context.object; cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler(); bpy.context.scene.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=6
s=bpy.context.scene; s.render.engine='CYCLES'; s.cycles.samples=16;s.render.resolution_x=1100;s.render.resolution_y=650;s.render.resolution_percentage=100;s.render.filepath=str(root/'review/source-models.png');s.view_settings.view_transform='AgX'
bpy.ops.render.render(write_still=True)
(root/'review/blender-source-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
