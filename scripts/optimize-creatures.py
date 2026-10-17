"""Create runtime-only LOD copies; never modifies the artist's original assets."""
import bpy, pathlib, json
root=pathlib.Path(__file__).resolve().parents[1]
report=[]
for name in ['fish','bivalve']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=root/'assets'/'source'/'creatures'/f'{name}.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    before=after=0
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH': continue
        before+=len(obj.data.polygons)
        bpy.context.view_layer.objects.active=obj
        if len(obj.data.polygons)>100000:
            dec=obj.modifiers.new('Runtime detail budget','DECIMATE')
            dec.ratio=100000/len(obj.data.polygons)
            bpy.ops.object.modifier_apply(modifier=dec.name)
        after+=len(obj.data.polygons)
    for image in bpy.data.images:
        w,h=image.size
        if max(w,h)>2048:
            scale=2048/max(w,h)
            image.scale(int(w*scale),int(h*scale))
    output=root/'public'/'models'/f'{name}-lod.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_image_format='AUTO',export_animations=False,export_cameras=False,export_lights=False)
    report.append({'model':name,'beforeFaces':before,'afterFaces':after,'beforeBytes':source.stat().st_size,'afterBytes':output.stat().st_size})
    print(report[-1],flush=True)
(root/'review'/'model-optimization.json').write_text(json.dumps(report,indent=2))
