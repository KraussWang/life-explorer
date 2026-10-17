"""Reopen the deliverable and verify packed images, cameras, UVs and emitter anchors."""
import bpy, pathlib, json
from mathutils import Vector
root=pathlib.Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'primordial_ocean.blend'))
manifest=json.loads((root/'public/assets/scene.json').read_text(encoding='utf8'))
report={'blender':bpy.app.version_string,'objects':len(bpy.data.objects),'checks':{}}
checks=report['checks']
checks['six_cameras']=len([o for o in bpy.data.objects if o.type=='CAMERA'])==6
checks['all_images_packed']=all(im.packed_file is not None for im in bpy.data.images if im.type=='IMAGE' and im.size[0]>0)
checks['static_meshes_have_UV']=all(len(o.data.uv_layers)>0 for c in ['01_Seafloor','02_Hyper3D_Rock_Fields','03_Hyper3D_Hydrothermal_Vents','04_Sediment_Debris'] for o in bpy.data.collections[c].objects)
checks['collision_hidden_in_render']=all(o.hide_render for o in bpy.data.collections['05_Collision_Proxies'].objects)
checks['library_hidden_in_render']=all(o.hide_render for o in bpy.data.collections['08_Asset_Library'].objects)
checks['positive_scales']=all(min(o.scale)>0 for o in bpy.data.objects if o.type=='MESH')
errors=[]
for e in manifest['emitters']:
    marker=bpy.data.objects['EMITTER_'+e['name']]
    expected=Vector((e['position'][0],-e['position'][2],e['position'][1]))
    errors.append((marker.location-expected).length)
checks['emitter_coordinate_conversion']=max(errors)<.0001
checks['metre_units']=bpy.context.scene.unit_settings.scale_length==1
def ground(x,y):
    hf=manifest['heightfield'];n=hf['count'];u=max(0,min(n-1.001,(x+120)/240*(n-1)));v=max(0,min(n-1.001,(y+120)/240*(n-1)));i=int(u);j=int(v);a=u-i;b=v-j
    return (hf['rows'][j][i]*(1-a)+hf['rows'][j][i+1]*a)*(1-b)+(hf['rows'][j+1][i]*(1-a)+hf['rows'][j+1][i+1]*a)*b
floating=[]
for c in ['02_Hyper3D_Rock_Fields','03_Hyper3D_Hydrothermal_Vents']:
    for o in bpy.data.collections[c].objects:
        if max(o.dimensions)<1:continue
        pts=[o.matrix_world@v.co for v in list(o.data.vertices)[::max(1,len(o.data.vertices)//300)]]
        clearance=min(p.z-ground(p.x,p.y) for p in pts if abs(p.x)<120 and abs(p.y)<120) if any(abs(p.x)<120 and abs(p.y)<120 for p in pts) else 0
        if clearance>.12:floating.append({'name':o.name,'minSampleClearance':clearance})
report['sampledContactWarnings']=floating
checks['no_floating_large_rocks_in_samples']=len(floating)==0
report['passed']=all(checks.values())
(root/'review/blend-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('BLEND_VERIFICATION',json.dumps(report))
if not report['passed']:raise RuntimeError('Saved Blender verification failed')
