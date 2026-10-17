"""Deterministic, low-poly filament assets; never edits the original ocean or grass.
blender --background --factory-startup --python scripts/build_algae.py
"""
import bpy
import json
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models' / 'algae'
SOURCE = ROOT / 'assets' / 'source' / 'algae'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
palette = [(0.11, .19, .025, 1), (.22, .30, .045, 1), (.32, .39, .065, 1)]
materials = []
for i, color in enumerate(palette):
    mat = bpy.data.materials.new(['Dark green', 'Olive', 'Yellow green'][i])
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = .87
    materials.append(mat)

audit = []
def export(obj, filename):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=str(OUT / filename), export_format='GLB', use_selection=True)
    obj.data.calc_loop_triangles()
    audit.append({'file': filename, 'triangles': len(obj.data.loop_triangles), 'bytes': (OUT / filename).stat().st_size})

def filaments(variant, lod=False):
    rng = random.Random(73190 + variant)
    vertices, faces, colors = [], [], []
    count, segments, sides = (10, 5, 3) if lod else (30 + variant * 8, 10, 4)
    for strand in range(count):
        theta = rng.uniform(0, math.tau)
        height = rng.uniform(.65, 1.0) * [.38, .62, .82][variant]
        reach = rng.uniform(.48, 1.08) * [1.1, .8, 1.0][variant]
        root = Vector((rng.uniform(-.12, .12), rng.uniform(-.12, .12), 0))
        phase = rng.uniform(0, math.tau)
        width = rng.uniform(.0045, .0085) * (1.5 if lod else 1)
        base = len(vertices)
        for j in range(segments + 1):
            t = j / segments
            # An arched, then drooping path has no rigid upright grass stalk.
            # Lateral meanders and distributed holdfasts keep the strands distinct.
            reach_t = reach * (.35*t + .65*t*t)
            meander = .12 * math.sin(t*7 + phase) * t
            center = root + Vector((math.cos(theta)*reach_t-math.sin(theta)*meander,
                                    math.sin(theta)*reach_t+math.cos(theta)*meander,
                                    height*math.sin(t*math.pi*[.82, .66, .74][variant])+.04*t))
            # Slender tapered tubes, rather than flat seagrass blades.
            for k in range(sides):
                a = k * math.tau / sides
                vertices.append(center + Vector((math.cos(a)*width*(1-.92*t), math.sin(a)*width*(1-.92*t), 0)))
        for j in range(segments):
            for k in range(sides):
                faces.append((base+j*sides+k, base+j*sides+(k+1)%sides, base+(j+1)*sides+(k+1)%sides, base+(j+1)*sides+k))
                colors.append(strand % 3)
        faces.append(tuple(base+k for k in reversed(range(sides))))
        colors.append(strand % 3)
    mesh = bpy.data.meshes.new('Filament geometry')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f'Filament_{variant}' + ('_LOD' if lod else ''), mesh)
    bpy.context.collection.objects.link(obj)
    # Vertex color palette keeps each GLB to one primitive / one draw call.
    filament_mat = materials[1].copy()
    filament_mat.name = 'Filament vertex pigment'
    color_node = filament_mat.node_tree.nodes.new('ShaderNodeVertexColor')
    color_node.layer_name = 'Color'
    filament_mat.node_tree.links.new(color_node.outputs['Color'], filament_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    mesh.materials.append(filament_mat)
    attr = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    mesh.color_attributes.active_color = attr
    for poly, idx in zip(mesh.polygons, colors):
        poly.use_smooth = True
        for li in poly.loop_indices:
            attr.data[li].color = palette[idx]
    export(obj, f'filament-{variant}' + ('-lod' if lod else '') + '.glb')
    obj.location = (variant * 2.2, 2.6 if lod else 0, 0)
    return obj

for v in range(3):
    filaments(v)
    filaments(v, True)

# Editable irregular film material: the runtime counterpart uses world-space noise
# on existing rock faces, so it has no overlay z-fighting or extra geometry.
film = bpy.data.materials.new('Irregular olive biofilm')
film.use_nodes = True
nodes, links = film.node_tree.nodes, film.node_tree.links
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 3.8
noise.inputs['Detail'].default_value = 3
ramp = nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = .38
ramp.color_ramp.elements[0].color = (.018, .035, .008, 1)
ramp.color_ramp.elements[1].position = .64
ramp.color_ramp.elements[1].color = (.18, .25, .035, 1)
links.new(noise.outputs['Fac'], ramp.inputs[0])
links.new(ramp.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])
nodes.get('Principled BSDF').inputs['Roughness'].default_value = .95
film.use_fake_user = True

# Reuse supplied leaf asset only at the worm and later stages.
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.import_scene.gltf(filepath=str(ROOT.parent / '视觉效果' / '海草' / '水草.glb'))
leaves = [o for o in bpy.context.selected_objects if o.type == 'MESH']
for obj in leaves:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
bpy.ops.object.join()
leaf = bpy.context.object
leaf.name = 'Reused_leaf_algae'
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
points = [leaf.matrix_world @ Vector(c) for c in leaf.bound_box]
lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
scale = 1.25 / max(hi.z-lo.z, .001)
for vertex in leaf.data.vertices:
    world = leaf.matrix_world @ vertex.co
    vertex.co = (world - Vector(((lo.x+hi.x)/2, (lo.y+hi.y)/2, lo.z))) * scale
leaf.matrix_world.identity()
dec = leaf.modifiers.new('WebGL budget', 'DECIMATE')
dec.ratio = min(1, 1100 / max(len(leaf.data.polygons), 1))
bpy.ops.object.modifier_apply(modifier=dec.name)
leaf.data.materials.clear()
leaf.data.materials.append(materials[0])
for p in leaf.data.polygons:
    p.material_index = 0
export(leaf, 'leaf-reused.glb')
leaf.location = (6.6, 0, 0)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=.7, location=(6.6, 2.6, .5))
swatch = bpy.context.object
swatch.name = 'Biofilm_material_preview'
swatch.data.materials.append(film)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'early-algae.blend'))
(OUT / 'asset-manifest.json').write_text(json.dumps({'seed': 73190, 'assets': audit}, indent=2))
print(json.dumps(audit))
