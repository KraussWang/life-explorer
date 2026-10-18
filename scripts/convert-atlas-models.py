"""Blender background conversion: 60k triangles, 1024px maps, preserve rig actions."""
from pathlib import Path
import bpy, json, time
ROOT=Path(__file__).resolve().parents[1]
jobs=json.loads((ROOT/'assets/atlas-source/jobs.json').read_text(encoding='utf8'))
report=[]
for job in jobs:
    out=Path(job['output']);out.parent.mkdir(exist_ok=True)
    if out.exists():continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=Path(job['source'])
    if source.suffix=='.obj':
        bpy.ops.wm.obj_import(filepath=str(source))
        mat=bpy.data.materials.new('Original diffuse');mat.use_nodes=True
        nodes=mat.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(source.parent/'texture_diffuse.png'))
        mat.node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
        nodes.get('Principled BSDF').inputs['Roughness'].default_value=.75
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH':obj.data.materials.clear();obj.data.materials.append(mat)
    else:bpy.ops.import_scene.gltf(filepath=str(source))
    before=after=0
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    total=sum(len(o.data.polygons) for o in meshes)
    for obj in meshes:
        before+=len(obj.data.polygons)
        if total>60000:
            bpy.context.view_layer.objects.active=obj
            mod=obj.modifiers.new('Catalog runtime budget','DECIMATE');mod.ratio=60000/total
            bpy.ops.object.modifier_apply(modifier=mod.name)
        after+=len(obj.data.polygons)
    for im in bpy.data.images:
        w,h=im.size
        if max(w,h)>1024:im.scale(max(1,int(w*1024/max(w,h))),max(1,int(h*1024/max(w,h))))
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_animations=True,export_cameras=False,export_lights=False)
    report.append(dict(id=job['id'],source=str(source.relative_to(ROOT.parent)) if source.is_relative_to(ROOT.parent) else str(source),before=before,after=after,bytes=out.stat().st_size))
    print('CATALOG_READY',job['id'],out.stat().st_size,flush=True)
(ROOT/'public/atlas/model-provenance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
