"""Deterministic Blender scene builder. Blender 5.2; no external Python packages.
Run: blender --background --factory-startup --python scripts/build_scene.py
Coordinates: Blender Z-up/metres; exported glTF Y-up. Seed: 4107.
"""
import bpy, math, random, json, pathlib, time
import numpy as np
import bmesh
from mathutils import Vector, noise

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(4107)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name != 'Collection': bpy.data.collections.remove(col)
main = bpy.context.scene.collection
def collection(name):
    c = bpy.data.collections.new(name); main.children.link(c); return c
terrain_col = collection('01_Seafloor')
rocks_col = collection('02_Hyper3D_Rock_Fields')
vents_col = collection('03_Hyper3D_Hydrothermal_Vents')
detail_col = collection('04_Sediment_Debris')
collision_col = collection('05_Collision_Proxies')
markers_col = collection('06_Runtime_Emitters')
presentation_col = collection('07_Cameras_and_Lights')
library_col = collection('08_Asset_Library')
def move(o, col):
    for c in list(o.users_collection): c.objects.unlink(o)
    col.objects.link(o)
def mesh_object(name, verts, faces, col):
    me=bpy.data.meshes.new(name+'_Mesh'); me.from_pydata(verts, [], faces); me.update()
    ob=bpy.data.objects.new(name,me); col.objects.link(ob); return ob
def smooth(o):
    for p in o.data.polygons: p.use_smooth=True
def select_only(obs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.hide_set(False); o.select_set(True)
    if obs: bpy.context.view_layer.objects.active=obs[0]

def image_from_array(name, data, noncolor=False):
    h,w=data.shape[:2]; rgba=np.ones((h,w,4),dtype=np.float32); rgba[:,:,:data.shape[2]]=data
    im=bpy.data.images.new(name,width=w,height=h,alpha=False)
    if noncolor: im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(rgba.ravel()); im.filepath_raw=str(OUT/(name+'.png')); im.file_format='PNG'; im.save(); im.pack(); return im

# Analytically rasterized procedural sediment: periodic and already baked to PNG.
# No unsupported procedural shader is exported. Original Hyper3D maps are untouched.
N=1024
y,x=np.mgrid[0:N,0:N].astype(np.float32)/N
rng=np.random.default_rng(4107)
fine=rng.random((N,N)).astype(np.float32)
macro=(np.sin(2*math.pi*(x*3+y*2)) + .45*np.sin(2*math.pi*(x*7-y*5)))*.5
ripples=np.sin(2*math.pi*(y*26 + .24*np.sin(x*2*math.pi*3)+.12*np.sin(y*2*math.pi*2)))
height=.035*macro+.007*ripples+.032*(fine-.5)
grains=np.maximum(0,(fine-.93)/.07)
base=np.clip(.34+.055*macro+.012*ripples+.21*(fine-.5)+grains*.19,0,1)
color=np.stack((base*.83,base*.92,base),axis=-1)
dx=(np.roll(height,-1,1)-np.roll(height,1,1))*N/12
dy=(np.roll(height,-1,0)-np.roll(height,1,0))*N/12
norm=np.stack((-dx,-dy,np.ones_like(dx)),axis=-1);norm/=np.linalg.norm(norm,axis=-1)[...,None];norm=norm*.5+.5
rough=np.repeat(np.clip(.88+fine*.1-grains*.2,0,1)[...,None],3,axis=-1)
sediment=bpy.data.materials.new('MAT_Baked_Basaltic_Sediment');sediment.use_nodes=True
nodes=sediment.node_tree.nodes; links=sediment.node_tree.links; bs=nodes.get('Principled BSDF')
bs.inputs['Roughness'].default_value=.94
for name,data,socket,nc in [('sediment_basecolor',color,'Base Color',False),('sediment_roughness',rough,'Roughness',True),('sediment_normal',norm,'Normal',True)]:
    tex=nodes.new('ShaderNodeTexImage');tex.image=image_from_array(name,data,nc);tex.label='Baked periodic sediment / 12 metres'
    if socket=='Normal':
        nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.65;links.new(tex.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs[socket])
    else:links.new(tex.outputs['Color'],bs.inputs[socket])

mound_rng=random.Random(601)
mounds=[(mound_rng.uniform(-100,100),mound_rng.uniform(-65,105),mound_rng.uniform(1,3.3),mound_rng.uniform(2.5,7)) for _ in range(70)]
def elevation(x,y):
    n=noise.multi_fractal(Vector((x*.035,y*.035,2.71)),1.0,2.0,4)
    small=noise.noise_vector(Vector((x*.18,y*.18,7.3)))[0]
    channel=-1.7*math.exp(-((x-5*math.sin(y*.035))/12)**2)
    ridges=5.5*math.exp(-((y-90)/19)**2)*(0.45+abs(math.sin(x*.068+.3)))
    rims=3.3*math.exp(-((abs(x)-93)/18)**2)
    mound=sum(h*math.exp(-((x-mx)**2+(y-my)**2)/(w*w)) for mx,my,h,w in mounds if abs(x-mx)<w*3 and abs(y-my)<w*3)
    detail=noise.noise_vector(Vector((x*.6,y*.6,13.3)))[0]
    return n*2.3 + small*.48 + detail*.18 + channel + ridges + rims + mound*.62 + .025*math.sin(y*3+x*.5)

SIZE=240; GRID=301
def grid_mesh(name, count, col):
    verts=[];faces=[]
    for j in range(count):
        yy=-SIZE/2+SIZE*j/(count-1)
        for i in range(count):
            xx=-SIZE/2+SIZE*i/(count-1);verts.append((xx,yy,elevation(xx,yy)))
    for j in range(count-1):
        for i in range(count-1):
            a=j*count+i;faces.append((a,a+1,a+count+1,a+count))
    o=mesh_object(name,verts,faces,col);smooth(o);return o
terrain=grid_mesh('Seafloor_240m_Channels_and_Ridges',GRID,terrain_col)
uv=terrain.data.uv_layers.new(name='SedimentUV_12m')
for p in terrain.data.polygons:
    for li in p.loop_indices:
        v=terrain.data.vertices[terrain.data.loops[li].vertex_index].co;uv.data[li].uv=(v.x/12,v.y/12)
terrain.data.materials.append(sediment)
terrain['role']='terrain';terrain['units']='metres'
collision_ground=grid_mesh('COLLISION_Seafloor',81,collision_col)
collision_ground['collision_type']='heightfield';collision_ground.display_type='WIRE';collision_ground.hide_render=True

sources={};audit={}
for kind in ['rock','vent']:
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/source'/kind/'base_basic_pbr.glb'))
    obs=[o for o in bpy.context.selected_objects if o.type=='MESH'];select_only(obs)
    if len(obs)>1:bpy.ops.object.join()
    o=bpy.context.object;o.name='SOURCE_'+kind
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    # Put model origin on the centre of its lowest bounding plane.
    lo=Vector(tuple(min(v.co[k] for v in o.data.vertices) for k in range(3)))
    hi=Vector(tuple(max(v.co[k] for v in o.data.vertices) for k in range(3)))
    offset=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z)); unit=hi.z-lo.z
    for v in o.data.vertices:v.co=(v.co-offset)/unit
    o.location=(0,0,0);move(o,library_col);smooth(o)
    o.data.materials[0].name='MAT_Hyper3D_'+kind+'_Original_PBR'
    audit[kind]={'original_vertices':len(o.data.vertices),'original_faces':len(o.data.polygons),'original_dimensions':[hi[k]-lo[k] for k in range(3)],'UV_preserved':True}
    # Save untouched full-resolution PBR asset before scene-specific cleanup.
    select_only([o]);bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'_source.glb')),export_format='GLB',use_selection=True,export_yup=True,export_tangents=True)
    if kind=='vent':
        original=o;o=bpy.data.objects.new('Vent_Cleaned_Master',original.data.copy());library_col.objects.link(o)
        mat=o.data.materials[0].copy();mat.name='MAT_Vent_Mineral_Crust';o.data.materials[0]=mat
        for tex in mat.node_tree.nodes:
            if tex.type=='TEX_IMAGE' and tex.image and 'metallic' in tex.image.name:
                im=tex.image;arr=np.array(im.pixels[:],dtype=np.float32).reshape(im.size[1],im.size[0],4)
                arr[:,:,1]=np.maximum(arr[:,:,1],.76);arr[:,:,2]*=.2
                tex.image=image_from_array('vent_mineral_mr',arr[:,:,:3],True)
        for node in mat.node_tree.nodes:
            if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.68
        tip=max(o.data.vertices,key=lambda v:v.co.z).co.copy();cx,cy=tip.x,tip.y
        bm=bmesh.new();bm.from_mesh(o.data)
        remove=[v for v in bm.verts if v.co.z>.70 and math.hypot(v.co.x-cx,v.co.y-cy)<.12]
        bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(o.data);bm.free()
        # Irregular mineral chimney with an actual open throat, rooted in source geometry.
        verts=[];faces=[];segments=16;rings=10
        for ring in range(rings):
            z=.64+ring*.029;r=.095*(1-ring/(rings-1)*.43)
            for k in range(segments):
                a=k*math.tau/segments;rr=r*(1+.12*math.sin(k*3.1+ring*.8)+.07*math.sin(k*7.3-ring))
                verts.append((cx+math.cos(a)*rr+.013*math.sin(ring*1.3),cy+math.sin(a)*rr+.009*math.cos(ring*1.7),z+.008*math.sin(k*2.3+ring)))
        for j in range(rings-1):
            for k in range(segments):
                a=j*segments+k;b=j*segments+(k+1)%segments;faces.append((a,b,b+segments,a+segments))
        inner_start=len(verts)
        for z,r in [(.901,.033),(.79,.023)]:
            for k in range(segments):
                a=k*math.tau/segments;verts.append((cx+math.cos(a)*r,cy+math.sin(a)*r,z))
        for k in range(segments):
            nxt=(k+1)%segments;outer=(rings-1)*segments
            faces.append((outer+k,outer+nxt,inner_start+nxt,inner_start+k))
            faces.append((inner_start+k,inner_start+nxt,inner_start+segments+nxt,inner_start+segments+k))
        faces.append(tuple(inner_start+segments+k for k in reversed(range(segments))))
        cap=mesh_object('Mineral_Chimney_Repair',verts,faces,library_col);cap.data.materials.append(o.data.materials[0]);uv=cap.data.uv_layers.new(name='UVMap')
        for loop in cap.data.loops:
            co=cap.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((math.atan2(co.y-cy,co.x-cx)/math.tau)%1,co.z*2%1)
        select_only([o,cap]);bpy.context.view_layer.objects.active=o;bpy.ops.object.join()
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
        # Fine actual crust displacement, without replacing the original UV or textures.
        for v in o.data.vertices:
            grain=noise.noise_vector(v.co*100)[0];v.co+=v.normal*grain*.0024
        smooth(o)
        audit[kind]['scene_cleanup']='Upper needle rebuilt as irregular open mineral chimney; original full-resolution GLB retained.'
        audit[kind]['emitter_local']=[cx,cy,.901]
    sources[kind]=[o]
    for label,ratio in [('MID',.24 if kind=='rock' else .45),('FAR',.035 if kind=='rock' else .15)]:
        cp=bpy.data.objects.new(kind+'_'+label,o.data.copy());library_col.objects.link(cp);select_only([cp])
        mod=cp.modifiers.new('Realtime_Decimation','DECIMATE');mod.ratio=ratio;bpy.ops.object.modifier_apply(modifier=mod.name);smooth(cp);sources[kind].append(cp)

# Low-detail continuous skirt prevents the playable area's edge becoming a cliff.
ring_verts=[];ring_faces=[];per_side=300;perimeter=per_side*4
for radius in [120,160,240,360,500]:
    for side in range(4):
        for k in range(per_side):
            t=-radius+2*radius*k/per_side
            xx,yy=[(t,-radius),(radius,t),(-t,radius),(-radius,-t)][side]
            ring_verts.append((xx,yy,elevation(xx,yy)))
for ring in range(4):
    for k in range(perimeter):
        nxt=(k+1)%perimeter;a=ring*perimeter+k;b=ring*perimeter+nxt
        ring_faces.append((a,a+perimeter,ring*perimeter+nxt+perimeter,b))
skirt=mesh_object('Distant_Seafloor_Skirt',ring_verts,ring_faces,terrain_col);smooth(skirt);skirt.data.materials.append(sediment);uv=skirt.data.uv_layers.new(name='SedimentUV_12m')
for loop in skirt.data.loops:
    co=skirt.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(co.x/12,co.y/12)
colliders=[];emitters=[];static=[terrain,skirt];placements=[]
def convex_proxy(o):
    # Explicit low polygon convex hull, separate from visible geometry.
    import bmesh
    me=bpy.data.meshes.new('COLLISION_'+o.name+'_Mesh');bm=bmesh.new()
    vs=list(o.data.vertices);step=max(1,len(vs)//80)
    for v in vs[::step]:bm.verts.new(v.co)
    result=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
    bmesh.ops.delete(bm,geom=result['geom_interior'],context='VERTS');bm.to_mesh(me);bm.free()
    c=bpy.data.objects.new('COLLISION_'+o.name,me);collision_col.objects.link(c);c.matrix_world=o.matrix_world.copy();c.hide_render=True;c.display_type='WIRE';c['collision_type']='convex'
    # Conservative runtime horizontal ellipse; actual proxy retained for physics engines.
    bpy.context.view_layer.update(); pts=[o.matrix_world@Vector(v) for v in o.bound_box]
    lo=[min(v[k] for v in pts) for k in range(3)];hi=[max(v[k] for v in pts) for k in range(3)]
    colliders.append({'name':o.name,'center':[(lo[0]+hi[0])/2,(lo[2]+hi[2])/2,-(lo[1]+hi[1])/2],'radius':[(hi[0]-lo[0])/2+.35,(hi[2]-lo[2])/2+.35,(hi[1]-lo[1])/2+.35],'minY':lo[2],'maxY':hi[2]})

def place(kind,name,x,y,h,angle=0,shape=(1,1,1),lod=1,collision=True):
    src=sources[kind][lod];o=bpy.data.objects.new(name,src.data);(rocks_col if kind=='rock' else vents_col).objects.link(o)
    o.location=(x,y,elevation(x,y)-h*.16);o.scale=(h*shape[0],h*shape[1],h*shape[2]);o.rotation_euler=(random.uniform(-.16,.16) if kind=='rock' else 0,random.uniform(-.16,.16) if kind=='rock' else 0,angle)
    if kind=='rock':
        footprint=h*.65*max(shape[0],shape[1])
        support=min(elevation(x+math.cos(a)*footprint,y+math.sin(a)*footprint) for a in [k*math.pi/4 for k in range(8)])
        o.location.z=min(o.location.z,support-h*.19)
    o['source']='Hyper3D / '+kind;o['lod']=lod;static.append(o)
    if collision and h>1.2:convex_proxy(o)
    placements.append({'name':name,'kind':kind,'height':h,'lod':lod})
    return o

# Art-directed foreground silhouettes leave a winding central exploration corridor.
for i,(x,y,h) in enumerate([(-15,-29,3.7),(16,-24,3.3),(-22,-8,5.4),(-12,5,2.4),(5,-18,1.1),(-7,-36,1.3),(28,21,4.2),(-33,27,6.1),(41,-3,4.0),(-32,-27,3.6)]):
    place('rock',f'Rock_Hero_{i:02}',x,y,h,random.uniform(0,6.28),(random.uniform(.85,1.3),random.uniform(.85,1.25),1),0 if i<3 else 1)
# Clustered fields, with variable scale, orientation, partial burial, and LOD.
centers=[(-40,-5),(36,13),(-23,40),(49,47),(-55,62),(15,70),(-60,-45),(65,-35),(-82,85),(78,87)]
for i in range(225):
    cx,cy=random.choice(centers);x=random.gauss(cx,13);y=random.gauss(cy,15)
    if abs(x)>112 or abs(y)>112 or (abs(x-5*math.sin(y*.035))<7 and y<50):continue
    h=random.uniform(.4,2.8)*(1.55 if y>55 else 1)
    place('rock',f'Rock_Cluster_{i:03}',x,y,h,random.uniform(0,6.28),(random.uniform(.65,1.5),random.uniform(.7,1.4),random.uniform(.75,1.35)),2 if y>40 or h<1.4 else 1, h>2)

vent_specs=[('Hero_Right',18,4,13.5,-.35,(.82,1,1)),('Mid_Left',-23,32,7.1,.5,(.8,1,1)),('Far_Centre',7,66,4.5,2.2,(.9,1,1)),('Far_Right',45,71,6.5,1.1,(.85,1,1)),('Far_Left',-59,84,4.6,2.7,(.9,1,1))]
for i,(name,x,y,h,angle,shape) in enumerate(vent_specs):
    o=place('vent','Vent_'+name,x,y,h,angle,shape,0 if i==0 else 1)
    # Tip on the actual imported mesh; not an assumed top-centre origin.
    top=Vector(audit['vent']['emitter_local'])
    bpy.context.view_layer.update();tip=o.matrix_world@top
    marker=bpy.data.objects.new('EMITTER_'+name,None);markers_col.objects.link(marker);marker.location=tip;marker.empty_display_type='SPHERE';marker.empty_display_size=.35;marker['runtime_effect']='Three.js turbulent buoyant plume'
    emitters.append({'name':name,'position':[tip.x,tip.z,-tip.y],'height':min(27,h*2.5),'width':h*.23,'seed':i*17+5})
    for j in range(24 if i==0 else 5):
        a=random.uniform(0,6.28);r=h*random.uniform(.24,.75)
        place('rock',f'Vent_Apron_{i}_{j}',x+math.cos(a)*r,y+math.sin(a)*r,h*random.uniform(.08,.22),a,(1,1,.8),1,False)

for i in range(28):
    x=-104+i*7.8;y=83+random.uniform(-5,18)
    place('rock',f'Rock_Distant_Ridge_{i:02}',x,y,random.uniform(4,8.5),random.uniform(0,6.28),(.8,.9,random.uniform(.9,1.4)),2,False)

# Connected, asymmetric outcrops and collapse aprons bridge rocks to sediment.
outcrops=[(-17,-21,5),(23,-21,5),(-27,9,6),(35,29,7),(-18,49,7),(18,63,9),(-49,38,8),(60,62,9)]
for i,(cx,cy,spread) in enumerate(outcrops):
    for j in range(15):
        x=cx+random.gauss(0,spread*.65);y=cy+random.gauss(0,spread*.27)
        h=random.uniform(.55,2.35)*(1.2 if j<4 else 1)
        place('rock',f'Rock_Outcrop_{i}_{j}',x,y,h,random.uniform(0,6.28),(random.uniform(.7,1.2),random.uniform(.7,1.3),random.uniform(.8,1.5)),1 if j<4 else 2,False)

# Secondary rubble fills the size gap between hero rocks and sediment grains.
for i in range(760):
    cx,cy=random.choice(centers);x=random.gauss(cx,15);y=random.gauss(cy,18)
    if abs(x)>110 or abs(y)>110:continue
    h=random.uniform(.16,.9)
    if i%8==0:h*=2.3
    place('rock',f'Rock_Rubble_{i:04}',x,y,h,random.uniform(0,6.28),(random.uniform(.7,1.5),random.uniform(.65,1.4),random.uniform(.6,1.3)),2,False)
# Physical small stones: 3 irregular low-poly shared meshes and thousands of instances.
for variant in range(3):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1)
    p=bpy.context.object;p.name=f'Gravel_Library_{variant}';move(p,library_col)
    for v in p.data.vertices:v.co*=.92+noise.noise_vector(v.co*3.5+Vector((variant,0,0)))[0]*.22
    smooth(p)
    p.data.materials.append(sources['rock'][0].data.materials[0]);uv=p.data.uv_layers.active or p.data.uv_layers.new(name='GravelUV')
    for loop in p.data.loops:
        co=p.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(co.x*.25+.5,co.y*.25+.5)
    for i in range(4000):
        if i%4:
            cx,cy=random.choice(centers+[(x,y) for x,y,_ in outcrops]);x=random.gauss(cx,11);y=random.gauss(cy,10)
        else:x=random.uniform(-95,95);y=random.uniform(-65,100)
        if abs(x)>113 or abs(y)>113:continue
        # Central clean-sand corridor and sparse patches interrupt scatter density.
        if abs(x-5*math.sin(y*.035))<5 and random.random()<.8:continue
        s=random.uniform(.035,.2)
        g=bpy.data.objects.new(f'Gravel_{variant}_{i:04}',p.data);detail_col.objects.link(g);g.location=(x,y,elevation(x,y));g.scale=(s*1.5,s,s*.65);g.rotation_euler.z=random.uniform(0,6.28);static.append(g)

# Readable scene cameras, retained in editable .blend.
views=[('Main',(0,-43,7.3),(1,15,7.7)),('Oblique',(-45,-32,29),(4,28,2)),('Side',(49,-11,8),(4,22,6)),('Wide',(0,-77,23),(0,31,8)),('Ground',(-7,-25,2),(8,8,4)),('Vent_Detail',(27,-11,10),(17,4,8))]
camera_json=[]
for name,pos,target in views:
    bpy.ops.object.camera_add(location=pos);cam=bpy.context.object;cam.name='CAM_'+name;move(cam,presentation_col);cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=24 if name=='Main' else 30;cam.data.clip_end=400
    camera_json.append({'name':name,'position':[pos[0],pos[2],-pos[1]],'target':[target[0],target[2],-target[1]],'fov':62 if name=='Main' else 56})
    if name=='Main':bpy.context.scene.camera=cam
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.025,.095,.16,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.5
for name,loc,power,size,color in [('Surface_Key',(-12,-5,43),38000,35,(.57,.83,1)),('Blue_Fill',(25,35,33),23000,45,(.25,.58,1))]:
    bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.name=name;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.data.color=color;move(l,presentation_col)
bpy.ops.object.light_add(type='SUN',location=(0,0,40));l=bpy.context.object;l.name='Surface_Sun';l.rotation_euler=(.2,-.3,-.3);l.data.energy=2;l.data.angle=.18;l.data.color=(.65,.83,1);move(l,presentation_col)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.view_settings.view_transform='AgX'
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene['README']='Editable static seafloor. Runtime water, particles and plumes are in main.js. Blender Z-up; glTF Y-up. One unit = one metre.'

# Single static GLB with linked meshes; Three.js batches repeated meshes at load time.
select_only(static)
bpy.ops.export_scene.gltf(filepath=str(OUT/'primordial_ocean.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_tangents=True)
select_only(list(collision_col.objects))
bpy.ops.export_scene.gltf(filepath=str(OUT/'collision.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_materials='NONE')
heights=[[elevation(-120+240*i/300,-120+240*j/300) for i in range(301)] for j in range(301)]
manifest={'seed':4107,'units':'metres','coordinateSystem':'glTF Y-up; Blender (x,y,z) => (x,z,-y)','bounds':120,'waterLevel':55,'cameras':camera_json,'emitters':emitters,'colliders':colliders,'heightfield':{'size':240,'count':301,'rows':heights},'sourceAudit':audit,'placements':placements,'staticObjects':len(static)}
(OUT/'scene.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf8')
for o in library_col.objects:o.hide_render=True;o.hide_set(True)
for o in collision_col.objects:o.hide_set(True)
select_only([])
for im in bpy.data.images:
    if im.type=='IMAGE' and im.size[0]>0:
        try:im.pack()
        except RuntimeError:pass
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'primordial_ocean.blend'))
summary={'static_objects':len(static),'unique_meshes':len({o.data.name for o in static}),'unique_triangles':sum(sum(len(p.vertices)-2 for p in me.polygons) for me in {o.data for o in static}),'drawn_triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in static),'colliders':len(colliders),'emitters':emitters,'assets':audit}
(ROOT/'review/build-report.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
print('BUILD_COMPLETE',json.dumps(summary))
