import zipfile,json,struct,pathlib
root=pathlib.Path.cwd(); out=root/'primordial-ocean'; report={}
for name,key in [('岩石5.zip','rock'),('热液喷口.zip','vent')]:
 p=root/name
 with zipfile.ZipFile(p) as z:
  report[key]={'archive':str(p),'entries':[{'name':i.filename,'bytes':i.file_size} for i in z.infolist()]}
  dest=out/'assets/source'/key; dest.mkdir(parents=True,exist_ok=True)
  for i in z.infolist():
   target=(dest/i.filename).resolve()
   target.relative_to(dest.resolve())
  z.extractall(dest)
 data=(dest/'base_basic_pbr.glb').read_bytes(); n=struct.unpack_from('<I',data,12)[0]; doc=json.loads(data[20:20+n])
 report[key]['gltf']={k:doc.get(k) for k in ['asset','extensionsUsed','materials','images','textures','meshes','nodes']}
 report[key]['accessors']=doc['accessors']
(out/'review/asset-audit.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
for key,v in report.items():
 print(key,json.dumps(v['gltf'],ensure_ascii=False)[:14000])

