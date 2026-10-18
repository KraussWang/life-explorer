"""Build derived catalog assets. Originals and gameplay models remain untouched.
Run with Python, then Blender --background --python scripts/convert-atlas-models.py.
"""
from pathlib import Path
import json, shutil, zipfile, sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / '视觉效果'
OUT = ROOT / 'public/atlas'
STAGING = ROOT / 'assets/atlas-source'
OUT.mkdir(exist_ok=True)
STAGING.mkdir(exist_ok=True)
jobs = []

def job(id, source):
    jobs.append({'id': id, 'source': str(source), 'output': str(OUT / 'models' / (id+'.glb'))})

for id, folder in ([] if '--images-only' in sys.argv else [('lungfish','非洲肺鱼模型'),('amphibian','两栖动物模型')]):
    job(id, SOURCE/'3D资产'/folder/'base_basic_pbr.glb')
shutil.copy2(SOURCE/'3D资产/蠕虫.glb', OUT/'worm.glb')
for id, name in ([] if '--images-only' in sys.argv else [('tyrannosaur','霸王龙'),('elephant','大象'),('shrub','灌木'),
                 ('bush','形似灌木'),('tree','树2'),('coral-tube','管状珊瑚'),
                 ('coral-mass','珊瑚一大坨'),('chordate','早期脊索动物'),('finfish','有鳍鱼'),('fanweed','扇形海草')]):
    folder=STAGING/id;folder.mkdir(exist_ok=True)
    with zipfile.ZipFile(SOURCE/'3D资产'/(name+'.zip')) as z:
        names=z.namelist()
        model=next((n for n in ['base_basic_pbr.glb','base_high_pbr.glb'] if n in names),None)
        if model:
            with z.open(model) as src, open(folder/model,'wb') as dst:shutil.copyfileobj(src,dst)
        else:
            model='base.obj'
            for n in [model,'texture_diffuse.png']:
                with z.open(n) as src, open(folder/n,'wb') as dst:shutil.copyfileobj(src,dst)
    job(id, folder/model)
with zipfile.ZipFile(SOURCE/'3D资产/海洋生物带骨骼版.zip') as z:
    for item in z.infolist():
        if '--images-only' in sys.argv:break
        if not item.filename.endswith('.glb') or '__MACOSX' in item.filename:continue
        try:name=item.filename.encode('cp437').decode('utf8')
        except UnicodeError:name=item.filename
        id=next(id for key,id in [('无鱼鳍','fish-rig'),('鲸鱼','whale'),('扇贝','bivalve-rig'),('有鳍','finfish-rig')] if key in name)
        target=STAGING/(id+'.glb')
        with z.open(item) as src, open(target,'wb') as dst:shutil.copyfileobj(src,dst)
        job(id,target)
if jobs:(STAGING/'jobs.json').write_text(json.dumps(jobs,ensure_ascii=False,indent=2),encoding='utf8')

# Rectangles are normalized against the ORIGINAL image, never the UI mockup.
# Labels and adjacent views are excluded; the cell sheet really has only 3 views.
sheets={
 'cell':('单细胞.png',[(0,.27,.415,.62),(.415,.27,.59,.62),(.59,.27,1,.62)],0,['正面','侧面','背面']),
 'flagellate':('鞭毛生物三视图2.png',[(.07,.11,.29,.42),(.37,.11,1,.43),(.005,.50,.635,.88),(.68,.50,.98,.89)],1,['正面','左侧','右侧','背面']),
 'colony':('多细胞概念图.png',[(.01,.06,.49,.48),(.51,.06,.99,.48),(.01,.56,.49,.98),(.51,.56,.99,.98)],0,['正面','侧面','背面','顶部']),
 'worm':('蠕虫四视图.png',[(.018,.11,.235,.40),(.245,.135,.99,.39),(.018,.53,.235,.83),(.245,.53,.99,.83)],1,['正面','侧面','背面','顶部']),
 'bivalve':('双壳贝三视图.png',[(.02,.015,.49,.455),(.52,.015,.985,.455),(.02,.50,.49,.925),(.52,.51,.99,.915)],2,['正面','侧面','背面','顶部']),
 'slug':('海蛞蝓三视图.png',[(.01,.04,.36,.44),(.37,.04,.99,.44),(.01,.53,.36,.94),(.37,.53,.99,.94)],1,['正面','侧面','背面','顶部']),
 'finfish':('腔棘鱼三视图.png',[(.01,.06,.28,.48),(.29,.06,.99,.48),(.01,.54,.28,.94),(.29,.54,.99,.94)],1,['正面','侧面','背面','顶部']),
 'chordate':('原始鱼类三视图.png',[(.01,.06,.21,.41),(.22,.05,.99,.42),(.01,.51,.21,.91),(.22,.53,.99,.88)],1,['正面','侧面','背面','顶部']),
}
manifest={}
for id,(filename,rects,hero,labels) in sheets.items():
    src=Image.open(SOURCE/'概念图'/filename).convert('RGB');w,h=src.size
    views=[]
    for i,rect in enumerate(rects):
        pixel=tuple(round(v*(w if j%2==0 else h)) for j,v in enumerate(rect))
        crop=src.crop(pixel).convert('RGBA')
        # Remove only near-white background connected to the crop boundary.
        rgb=crop.convert('RGB');mask=Image.new('RGB',crop.size);rp=rgb.load();px=mask.load()
        for y in range(mask.height):
            for x in range(mask.width):
                c=rp[x,y];background=min(c)>236 or (id in ['bivalve','slug'] and min(c)>165 and max(c)-min(c)<13)
                px[x,y]=(255,255,255) if background else (0,0,0)
        for x in range(mask.width):
            if px[x,0]==(255,255,255):ImageDraw.floodfill(mask,(x,0),(128,128,128))
            if px[x,mask.height-1]==(255,255,255):ImageDraw.floodfill(mask,(x,mask.height-1),(128,128,128))
        for y in range(mask.height):
            if px[0,y]==(255,255,255):ImageDraw.floodfill(mask,(0,y),(128,128,128))
            if px[mask.width-1,y]==(255,255,255):ImageDraw.floodfill(mask,(mask.width-1,y),(128,128,128))
        alpha=mask.convert('L').point(lambda x:0 if x==128 else 255)
        crop.putalpha(alpha);bbox=alpha.getbbox()
        if bbox:crop=crop.crop(bbox)
        crop.thumbnail((800,650));target=f'{id}-{i}.webp';crop.save(OUT/target,quality=93)
        views.append({'label':labels[i],'image':'/atlas/'+target,'rect':list(pixel)})
    manifest[id]={'source':'视觉效果/概念图/'+filename,'size':[w,h],'kind':'source-crop','hero':hero,'views':views}
# UI ornament only. No creature from this reference is used in a catalog card.
reference=Image.open(SOURCE/'概念图/生物图鉴.png')
reference.crop((735,0,1460,106)).save(OUT/'header.webp',quality=90)
reference.crop((0,787,246,941)).save(OUT/'fossil.webp',quality=90)
Image.open(SOURCE/'概念图/原始海洋2.png').resize((1000,667)).save(OUT/'ocean.webp',quality=85)
(OUT/'images.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(f'Prepared {len(jobs)} model conversion jobs and {len(manifest)} source sheets',flush=True)
