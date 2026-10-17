"""Convert the supplied organic-floc OBJ and textures to an editable transparent Blender/GLB asset.

Run: blender --background --python scripts/build_nutrient_floc.py
Source: ../../视觉效果/有机絮团.zip (base.obj and PNG texture maps).
"""

import math
import tempfile
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT.parent / "视觉效果" / "有机絮团.zip"
SOURCE = ROOT / "assets" / "source" / "nutrient-floc"
OUTPUT = ROOT / "public" / "models" / "nutrient-floc.glb"
REQUIRED = ("base.obj", "texture_diffuse.png", "texture_normal.png")

if not ARCHIVE.is_file():
    raise FileNotFoundError(f"Missing supplied model archive: {ARCHIVE}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

with tempfile.TemporaryDirectory(prefix="nutrient-floc-") as temp:
    temp = Path(temp)
    with zipfile.ZipFile(ARCHIVE) as archive:
        for name in REQUIRED:
            if name not in archive.namelist():
                raise ValueError(f"Missing {name} in {ARCHIVE}")
            (temp / name).write_bytes(archive.read(name))

    bpy.ops.wm.obj_import(filepath=str(temp / "base.obj"))
    objects = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    if not objects:
        raise ValueError("The OBJ did not contain a mesh")

    # The OBJ's long axis is Y. Put it upright in Blender (Z), then center it.
    for obj in objects:
        obj.rotation_euler.x = math.pi / 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = Vector(tuple(min(p[i] for p in corners) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in corners) for i in range(3)))
    center = (low + high) / 2
    factor = 1.76 / max(high[i] - low[i] for i in range(3))
    for obj in objects:
        for vertex in obj.data.vertices:
            vertex.co = (vertex.co - center) * factor
        obj.name = "SourceFloc"
        obj.data.name = "SourceFloc_Mesh"

    diffuse = bpy.data.images.load(str(temp / "texture_diffuse.png"), check_existing=False)
    diffuse.name = "OrganicFloc_Diffuse"
    normal = bpy.data.images.load(str(temp / "texture_normal.png"), check_existing=False)
    normal.name = "OrganicFloc_Normal"
    normal.colorspace_settings.name = "Non-Color"

    mat = bpy.data.materials.new("SourceFloc_Translucent")
    mat.diffuse_color = (0.89, 0.93, 0.98, 0.32)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Alpha"].default_value = 0.32
    bsdf.inputs["Roughness"].default_value = 0.68
    bsdf.inputs["Metallic"].default_value = 0
    color_node = nodes.new("ShaderNodeTexImage")
    color_node.name = "Original diffuse texture"
    color_node.image = diffuse
    color_node.location = (-450, 100)
    links.new(color_node.outputs["Color"], bsdf.inputs["Base Color"])
    normal_image = nodes.new("ShaderNodeTexImage")
    normal_image.name = "Original normal texture"
    normal_image.image = normal
    normal_image.location = (-450, -220)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.5
    normal_map.location = (-200, -220)
    links.new(normal_image.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    elif hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    mat.use_backface_culling = False

    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

    # The temporary extracted images must remain editable after this script exits.
    diffuse.pack()
    normal.pack()
    SOURCE.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "nutrient-floc.blend"))
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", use_selection=True,
                              export_apply=True, export_tangents=True)
    print(f"Converted {ARCHIVE} to {OUTPUT}")
