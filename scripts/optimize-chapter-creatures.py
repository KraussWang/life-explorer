"""Build web-sized chapter models from the supplied artist GLBs.

Run with Blender in background mode. The source assets outside this project are
read only; the generated files are the ones loaded by the game and atlas.
"""
import bpy
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
asset_root = root.parent / '视觉效果' / '3D资产'
models = [
    ('腔棘鱼', 'coelacanth', 100_000),
    ('早期羊膜生物', 'amniote', 30_000),
    ('海牛', 'manatee', 80_000),
]
report = []

for source_name, output_name, face_budget in models:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = asset_root / source_name / 'base_basic_pbr.glb'
    output = root / 'public' / 'stages' / 'creatures' / f'{output_name}.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    before = sum(len(obj.data.polygons) for obj in meshes)
    for obj in meshes:
        faces = len(obj.data.polygons)
        if faces > face_budget:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            decimate = obj.modifiers.new('Web runtime detail budget', 'DECIMATE')
            decimate.ratio = face_budget / faces
            bpy.ops.object.modifier_apply(modifier=decimate.name)
    after = sum(len(obj.data.polygons) for obj in meshes)
    for image in bpy.data.images:
        width, height = image.size
        if max(width, height) > 1024:
            ratio = 1024 / max(width, height)
            image.scale(max(1, round(width * ratio)), max(1, round(height * ratio)))
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format='GLB', export_image_format='AUTO',
        export_animations=False, export_cameras=False, export_lights=False,
    )
    item = {
        'model': output_name, 'source': str(source.relative_to(root.parent)),
        'sourceFaces': before, 'runtimeFaces': after,
        'sourceBytes': source.stat().st_size, 'runtimeBytes': output.stat().st_size,
    }
    report.append(item)
    print(json.dumps(item, ensure_ascii=False), flush=True)

(root / 'review' / 'chapter-creature-optimization.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8'
)
