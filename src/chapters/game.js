import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {NODES,byNode,SCENES,nextChoices} from './data.js';
import {freshChapter,readChapter,writeChapter,taskProgress,stageComplete,finishStage,enterNode,returnToAnchor,completedTask} from './progress.js';
import {createWorldBank} from './worlds.js';
import {createAtlas} from '../atlas.js';
import {createBackgroundMusic} from '../background-music.js';
import {advanceFacing} from './steering.js';

const $=id=>document.getElementById(id),canvas=$('chapter-canvas');
const embedded=new URLSearchParams(location.search).get('embedded')==='1'&&window.parent!==window;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,.8));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,600),bank=createWorldBank(renderer,camera),loader=new GLTFLoader(),creatures=new Map();
const player=new THREE.Group(),modelRoot=new THREE.Group();player.add(modelRoot);
let storage;try{storage=localStorage;}catch{storage=null;}
const music=createBackgroundMusic($('chapter-music-toggle'),storage);
if(embedded){const startMusic=()=>music.start();document.addEventListener('pointerdown',startMusic,{once:true});document.addEventListener('keydown',startMusic,{once:true});}
let state=readChapter(storage)||freshChapter(),hasSaved=!!readChapter(storage),world,playing=false,busy=false,airborne=false,shoreMode=false,oxygen=100,stamina=100,breathReady=true,retreat=0,skipRequested=false,hazard=null;
let yaw=0,pitch=.25,zoom=11,cameraLift=.7,dragging=false,elapsed=0,last=performance.now(),fpsClock=last,frames=0,saveClock=0,walkClock=0,sprintClock=0,transitionClock=0,transitionPending=false;
const keys=new Set(),targets=[],footprints=[],look=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),moveVector=new THREE.Vector3();
let legacyUnlocked=[];try{legacyUnlocked=JSON.parse(storage?.getItem('life-explorer.p0.v1')||'{}').unlocked||[];}catch{}
const atlas=createAtlas(()=>({species:state.node,unlocked:[...legacyUnlocked,...state.unlocked],completed:state.completed,discoveries:[]}));
let toastTimeout;
function toast(message){$('chapter-toast').textContent=message;$('chapter-toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('chapter-toast').classList.remove('show'),4200);}
function dialogOpen(){return !!document.querySelector('dialog[open]');}
function active(){return playing&&!busy&&!dialogOpen()&&!document.hidden;}
function open(id){keys.clear();$(id).showModal();}
function close(id){$(id).close();if(id==='chapter-pause')music.resume();canvas.focus();keys.clear();}
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>close(button.dataset.close);
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('cancel',event=>{event.preventDefault();if(dialog.id!=='chapter-welcome'&&!busy)close(dialog.id);});
function save(){if(!playing)return;state.position=player.position.toArray();$('chapter-save').textContent=writeChapter(storage,state)?'✓ 进度已保存':'仅本次会话';}
async function createCreature(node){
 if(!creatures.has(node.model))creatures.set(node.model,loader.loadAsync(node.model).catch(error=>{creatures.delete(node.model);throw error;}));
 const gltf=await creatures.get(node.model),root=clone(gltf.scene);
 root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const scale=node.size/Math.max(size.x,size.y,size.z,1e-3);root.scale.multiplyScalar(scale);root.position.sub(center.multiplyScalar(scale));
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});return root;
}
function clearTargets(){for(const target of targets){world?.scene.remove(target.group);const geometries=new Set(),materials=new Set();target.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}targets.length=0;}
function clearHazard(){if(!hazard)return;hazard.mesh.parent?.remove(hazard.mesh);hazard.mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});hazard=null;}
function buildHazard(){if(!['F01','F02'].includes(state.node))return;
 const mesh=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0x324652,roughness:.77}),body=new THREE.Mesh(new THREE.SphereGeometry(1,18,12),skin);
 body.scale.set(.68,.42,1.8);mesh.add(body);const fin=new THREE.Mesh(new THREE.ConeGeometry(.5,.8,5),skin);fin.rotation.x=Math.PI/2;fin.position.set(0,.35,.25);mesh.add(fin);
 const tail=new THREE.Mesh(new THREE.ConeGeometry(.5,.8,5),skin);tail.rotation.x=Math.PI/2;tail.position.z=1.9;mesh.add(tail);
 mesh.visible=false;world.scene.add(mesh);hazard={mesh,active:false,time:0,cooldown:3};
}
function updateHazard(dt){if(!hazard)return;const node=byNode[state.node],task=node.id==='F01'?'evade':'cover';if(completedTask(state,task)){hazard.mesh.visible=false;hazard.active=false;return;}
 const p=state.progress[node.id]||{},ready=node.id==='F01'?p.explore&&p.feed>=1:p.passes>=1&&p.feed>=1;
 if(!ready)return;
 if(!hazard.active){hazard.cooldown-=dt;if(hazard.cooldown>0)return;hazard.active=true;hazard.time=0;hazard.mesh.visible=true;hazard.mesh.position.copy(player.position).add(new THREE.Vector3(0,.3,7));toast('大型捕食者靠近！继续游动，利用岩礁躲避。');}
 hazard.time+=dt;
 const delta=player.position.clone().sub(hazard.mesh.position),distance=delta.length();if(distance>0){hazard.mesh.position.addScaledVector(delta.normalize(),Math.min(distance,dt*(node.id==='F01'?2.3:2.9)));hazard.mesh.lookAt(player.position);}
 hazard.mesh.position.y+=Math.sin(elapsed*3)*.005;
 if(distance<1.5){player.position.copy(initialPosition(node));hazard.active=false;hazard.mesh.visible=false;hazard.cooldown=5;toast('避险后返回安全水域；已记录的目标不会丢失。');return;}
 if(node.id==='F01'&&hazard.time>8){progress('evade');hazard.active=false;hazard.mesh.visible=false;}
 if(node.id==='F02'&&hazard.time>16){hazard.active=false;hazard.mesh.visible=false;hazard.cooldown=4;toast('追逐结束。可再次靠近岩礁尝试隐蔽。');}
}
function clearFootprints(){for(const mark of footprints){mark.parent?.remove(mark);mark.geometry.dispose();mark.material.dispose();}footprints.length=0;}
function placeFootprint(){if(footprints.length>=24)return;const mark=new THREE.Mesh(new THREE.CircleGeometry(.15,12),new THREE.MeshBasicMaterial({color:0x463d30,transparent:true,opacity:.46,depthWrite:false,side:THREE.DoubleSide}));
 mark.rotation.x=-Math.PI/2;mark.scale.y=1.7;mark.position.set(player.position.x+(footprints.length%2?.25:-.25),world.groundHeight(player.position.x,player.position.z)+.025,player.position.z);mark.userData.created=elapsed;world.scene.add(mark);footprints.push(mark);}
function targetPosition(node,task,index){
 const spawn=world.spawn;
 const base=task.position||[spawn[0]+(index%2?7:-5),0,spawn[2]-(12+index*8)];
 const x=base[0]+(index?index*3:0),z=base[2]-(index?index*4:0),ground=world.groundHeight(x,z);
 const water=world.waterLevel??world.manifest?.waterLevel;
 const y=node.mode==='fly'?ground+Math.max(5,5+index*2):node.mode==='swim'&&water!==undefined?Math.min(water-.35,ground+1.7):ground+.4;
 return new THREE.Vector3(x,Math.max(ground+.35,y),z);
}
function makeNaturalMarker(task,index){
 const group=new THREE.Group();const p=targetPosition(byNode[state.node],task,index);group.position.copy(p);
 const dark=new THREE.MeshStandardMaterial({color:0x64574a,roughness:.9}),green=new THREE.MeshStandardMaterial({color:0x5d856a,roughness:.9}),prey=new THREE.MeshStandardMaterial({color:0xb6b9a2,roughness:.6});
 if(task.type==='feed'){
  if(state.node==='M03'||state.node==='M02'){
   for(let i=0;i<5;i++){const blade=new THREE.Mesh(new THREE.ConeGeometry(.12,.85,5),green);blade.position.set((i-2)*.21,.3,Math.sin(i*2)*.2);blade.rotation.z=(i-2)*.16;group.add(blade);}
  }else{const body=new THREE.Mesh(new THREE.CapsuleGeometry(.17,.36,4,8),prey);body.rotation.x=Math.PI/2;group.add(body);const tail=new THREE.Mesh(new THREE.ConeGeometry(.16,.32,4),prey);tail.rotation.x=Math.PI/2;tail.position.z=.42;group.add(tail);}
 }else if(task.type==='hide'){
  const cover=new THREE.Mesh(new THREE.IcosahedronGeometry(1.2,1),dark);cover.scale.set(1.5,.8,1);cover.position.y=.25;group.add(cover);
 }else if(task.id==='nest'){
  const nest=new THREE.Mesh(new THREE.TorusGeometry(.66,.15,7,18),dark);nest.rotation.x=Math.PI/2;group.add(nest);
 }else{
  for(let i=0;i<3;i++){const stone=new THREE.Mesh(new THREE.IcosahedronGeometry(.35+i*.08,0),i===1?green:dark);stone.position.set(i*.42-.4,0,i*.24);stone.scale.y=.35;group.add(stone);}
 }
 world.scene.add(group);return {task,index,group,position:p,anchor:p.clone(),used:false,phase:index*1.6};
}
function buildTargets(){
 clearTargets();const node=byNode[state.node];
 for(const task of node.tasks){
  if(['breathe','evade','walk','sprint','takeoff','land'].includes(task.type))continue;
  for(let i=0;i<task.target;i++){
   if((state.progress[node.id]?.[task.id]||0)>i)continue;
   targets.push(makeNaturalMarker(task,i));
  }
 }
}
function refreshTargets(){
 const node=byNode[state.node];for(const target of targets){const done=(state.progress[node.id]?.[target.task.id]||0)>target.index;target.group.visible=!done;}
}
function updateHud(){
 const node=byNode[state.node],done=stageComplete(state);
 $('scene-name').textContent=SCENES[node.sceneId];$('preset-name').textContent=node.biomePreset.replaceAll('-',' · ');
 $('stage-label').textContent=node.id+' / '+node.eraPreset.replaceAll('-',' ');$('stage-name').textContent=node.name;$('stage-trait').textContent=node.trait;
 $('model-disclaimer').hidden=!node.proxy;$('stage-status').textContent=done?'COMPLETE':'EXPLORING';
 $('stage-mission').textContent=done?'生态体验已完成':'体验这个谱系的生存策略';$('stage-note').textContent=node.note;
 $('chapter-tasks').innerHTML=node.tasks.map(task=>{const count=state.progress[node.id]?.[task.id]||0;return `<div class="requirement"><span>${count>=task.target?'✓':'○'} ${task.label}</span><b>${count} / ${task.target}</b></div><div class="meter"><i style="width:${count/task.target*100}%"></i></div>`;}).join('');
 $('next-stage').disabled=!done;$('next-stage').textContent=done?(node.terminal?'完成谱系 · 返回分支':node.id==='A03'?'探索鸟类起源 / 返回分支':'探索下一条谱系'):'完成三项生态体验';
 $('vertical-help').innerHTML=node.mode==='walk'?'<kbd>Shift</kbd> 短时冲刺':node.mode==='fly'?'<kbd>Space</kbd> 起飞 / 拍翼 · <kbd>Ctrl</kbd> 下降':'<kbd>Space / Ctrl</kbd> 上浮 / 下潜';
 $('chapter-lineage').innerHTML=NODES.filter(n=>state.unlocked.includes(n.id)).map(n=>`<span class="${n.id===node.id?'active':''}">${n.id} ${n.name}</span>`).join('<i></i>');
 $('chapter-anchor').disabled=!node.returnTo&&!['F02','T01','A01'].some(id=>state.anchors[id]&&id!==node.id);
}
function progress(taskId){if(!taskProgress(state,taskId))return;refreshTargets();updateHud();save();const node=byNode[state.node];toast(node.tasks.find(t=>t.id===taskId)?.label+' · 已记录');if(stageComplete(state)){finishStage(state);save();toast('三项生态体验已完成。可以选择下一条谱系。');if(node.id==='A01')setTimeout(()=>{if(active())open('egg-explainer');},700);else if(node.terminal||node.id==='A03')setTimeout(()=>{if(active())showEnding();},900);}}
function initialPosition(node){
 const p=new THREE.Vector3(...world.spawn);
 if(node.sceneId==='S03'){
  if(node.id==='M01')p.set(-10,world.groundHeight(-10,50)+2.2,50);
  else if(node.id==='M03')p.set(-10,world.groundHeight(-10,70)+.6,70);
  else p.set(-10,world.groundHeight(-10,75)+.45,75);
 }else if(node.sceneId==='S04')p.set(0,world.groundHeight(0,node.id==='T02'?-10:0)+.35,node.id==='T02'?-10:0);
 return p;
}
async function loadStage(){
 const node=byNode[state.node],nextWorld=await bank.get(node.sceneId),creature=await createCreature(node);
 if(world){clearTargets();clearFootprints();clearHazard();}world=nextWorld;world.setPreset?.(node.eraPreset,node.biomePreset);world.scene.add(player);
 modelRoot.clear();modelRoot.rotation.set(0,node.modelYaw,0);modelRoot.add(creature);player.scale.setScalar(1);player.quaternion.identity();
 player.position.copy(state.position?new THREE.Vector3(...state.position):initialPosition(node));world.constrain(player.position,.3);
 if(node.mode==='walk'||node.mode==='amphibious')player.position.y=world.groundHeight(player.position.x,player.position.z)+.35;
 oxygen=100;stamina=100;airborne=false;shoreMode=false;breathReady=true;retreat=0;walkClock=sprintClock=0;
 zoom=node.id==='M01'?18:node.id==='M02'||node.id==='A03'?16:node.mode==='fly'?9:node.sceneId==='S02'?8:node.sceneId==='S04'?8:11;
 camera.fov=node.id==='M01'?65:58;camera.updateProjectionMatrix();yaw=0;pitch=.25;cameraLift=.7;
 world.quality(state.quality==='high');buildTargets();buildHazard();updateHud();updateCamera(.1,true);save();
}
function updateCamera(dt,snap=false){if(!world)return;const node=byNode[state.node],ground=world.groundHeight(player.position.x,player.position.z),surface=world.waterSurface?.(player.position.x,player.position.z)??world.waterLevel??world.manifest?.waterLevel??-999;
 const targetLift=node.id==='M01'||node.id==='M02'||node.id==='A03'?2:node.mode==='fly'?1:node.id==='T01'?(ground>=surface-.18?1.15:.35):.7;
 cameraLift=THREE.MathUtils.lerp(cameraLift,targetLift,snap?1:1-Math.exp(-dt*4));const height=cameraLift;
 const target=look.copy(player.position).add(new THREE.Vector3(0,height,0));
 desiredCamera.set(Math.sin(yaw)*Math.cos(pitch)*zoom,Math.sin(pitch)*zoom+height+1.2,Math.cos(yaw)*Math.cos(pitch)*zoom).add(player.position);
 desiredCamera.y=Math.max(desiredCamera.y,world.groundHeight(desiredCamera.x,desiredCamera.z)+1.3);
 camera.position.lerp(desiredCamera,snap?1:1-Math.exp(-dt*5));camera.lookAt(target);
}
function move(dt){
 const node=byNode[state.node],ground=world.groundHeight(player.position.x,player.position.z),water=world.waterSurface?.(player.position.x,player.position.z)??world.waterLevel??world.manifest?.waterLevel??-999;
 const onLand=node.mode==='walk'||node.mode==='amphibious'&&ground>=water-.18;
 if(node.id==='T01'&&!shoreMode&&onLand){shoreMode=true;progress('shore');toast('四肢支撑身体：在湿泥地继续前进。');}
 moveVector.set(0,0,0);const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 if(keys.has('KeyW'))moveVector.add(f);if(keys.has('KeyS'))moveVector.sub(f);if(keys.has('KeyD'))moveVector.add(r);if(keys.has('KeyA'))moveVector.sub(r);
 const horizontal=moveVector.lengthSq()>0;if(horizontal)moveVector.normalize();
 const sprint=keys.has('ShiftLeft')&&stamina>1&&horizontal;
 const flapping=node.mode==='fly'&&airborne&&keys.has('Space')&&stamina>0;
 stamina=THREE.MathUtils.clamp(stamina+dt*(sprint||flapping?-23:17),0,100);
 const speed=node.speed*(sprint?1.6:1)*(onLand&&node.mode==='amphibious'?.72:1);
 const travel=horizontal?advanceFacing(player,moveVector,dt,node.id==='M01'?3:node.id==='M03'?2.5:8,speed*dt):0;
 if(onLand&&!airborne){player.position.y=ground+.35;if(travel>0){walkClock+=dt;if(node.id==='T01'&&walkClock>.5){walkClock=0;placeFootprint();progress('steps');}}}
 else if(node.mode==='fly'){
  if(airborne){player.position.y+=((flapping?3.6:0)-(keys.has('ControlLeft')?4:1.1))*dt;player.position.y=Math.max(ground+.4,player.position.y);}
  else player.position.y=ground+.35;
 }else{
  player.position.y+=((keys.has('Space')?1:0)-(keys.has('ControlLeft')?1:0))*speed*.62*dt;
  player.position.y=THREE.MathUtils.clamp(player.position.y,ground+.3,Math.max(ground+.3,water+.45));
 }
 world.constrain(player.position,.3);
 if(onLand&&!airborne)player.position.y=world.groundHeight(player.position.x,player.position.z)+.35;
 if(node.id==='A03'&&sprint&&horizontal){sprintClock+=dt;if(sprintClock>2.5)progress('run');}
 if(node.id==='F04'||node.id==='M01'||node.id==='M03'){
  const underwater=player.position.y<water-.13;
  oxygen=THREE.MathUtils.clamp(oxygen+dt*(underwater?-2.5:24),0,100);
  if(underwater)breathReady=true;
  if(oxygen===0){player.position.copy(initialPosition(node));oxygen=100;toast('返回安全水域，已完成任务保留。');}
  $('ecology-pressure').hidden=false;$('pressure-label').textContent='空气 / 氧气';$('pressure-fill').style.width=oxygen+'%';
 }else if(node.mode==='fly'){$('ecology-pressure').hidden=false;$('pressure-label').textContent='飞行耐力';$('pressure-fill').style.width=stamina+'%';}
 else $('ecology-pressure').hidden=true;
 if(node.id==='F04'||node.id==='T01'){
  retreat=Math.min(1,retreat+dt/35);
  if(node.id==='T01'&&world.waterLevel!==null){world.waterLevel=THREE.MathUtils.lerp(-.12,-.42,retreat);const surface=world.scene.children.find(o=>o.name==='chapter-water');if(surface)surface.position.y=world.waterLevel+.02;}
 }
}
function updateObjectives(){
 const node=byNode[state.node];let nearest=null,distance=Infinity;
 for(const target of targets){if(!target.group.visible)continue;
  if(target.task.type==='feed'&&['F01','F02','M01'].includes(node.id)){
   const pace=node.id==='F02'?1.5:.9;
   target.position.x=target.anchor.x+Math.sin(elapsed*pace+target.phase)*1.7;
   target.position.z=target.anchor.z+Math.cos(elapsed*pace*.7+target.phase)*1.2;
  }
  target.group.position.copy(target.position);target.group.position.y+=Math.sin(elapsed*1.7+target.phase)*.05;
  const d=player.position.distanceTo(target.position);
  if(d<distance){distance=d;nearest=target;}
  if(target.task.type==='travel'&&d<3.5){progress(target.task.id);break;}
 }
 const marker=$('chapter-marker');marker.hidden=!nearest||distance>22||dialogOpen();
 if(nearest){const projected=nearest.position.clone().add(new THREE.Vector3(0,1,0)).project(camera);marker.hidden=marker.hidden||projected.z>1;
  marker.style.left=THREE.MathUtils.clamp((projected.x*.5+.5)*innerWidth,90,innerWidth-90)+'px';marker.style.top=THREE.MathUtils.clamp((-projected.y*.5+.5)*innerHeight,100,innerHeight-140)+'px';
  marker.querySelector('small').textContent=nearest.task.label+' · '+distance.toFixed(0)+' m';
 }
 $('focus-hint').textContent=nearest?(distance<4?`按 E ${nearest.task.type==='feed'?'取食':'观察'} · ${nearest.task.label}`:`${nearest.task.label} · ${distance.toFixed(0)} m · R 对准`):stageComplete(state)?'按 E 或点击按钮，继续探索谱系':'继续完成生态体验';
}
function interact(){
 if(!active())return;const node=byNode[state.node],water=world.waterLevel??world.manifest?.waterLevel??-999;
 if(stageComplete(state)){nextAction();return;}
 if(node.tasks.some(t=>t.type==='breathe'&&!completedTask(state,t.id))&&player.position.y>=water-.13&&breathReady){breathReady=false;oxygen=100;progress('breathe');toast('吸入空气 · 再次下潜后可重新上浮呼吸。');return;}
 if(node.mode==='fly'&&airborne&&node.tasks.some(t=>t.type==='land'&&!completedTask(state,t.id))&&player.position.y<=world.groundHeight(player.position.x,player.position.z)+2.5){airborne=false;player.position.y=world.groundHeight(player.position.x,player.position.z)+.35;progress('land');return;}
 const near=targets.filter(t=>t.group.visible&&t.task.type!=='travel').sort((a,b)=>player.position.distanceTo(a.position)-player.position.distanceTo(b.position))[0];
 if(near&&player.position.distanceTo(near.position)<4){if(near.task.type==='hide'&&!hazard?.active){toast('捕食者接近时，在岩礁后按 E 隐蔽。');return;}progress(near.task.id);return;}
 toast('请先靠近可观察的生态线索。');
}
function aim(){const near=targets.filter(t=>t.group.visible).sort((a,b)=>player.position.distanceTo(a.position)-player.position.distanceTo(b.position))[0];if(!near)return;
 const delta=near.position.clone().sub(player.position);yaw=Math.atan2(-delta.x,-delta.z);pitch=.25;toast('已对准 '+near.task.label);}
function showEnding(){finishStage(state);save();const node=byNode[state.node];$('chapter-ending-name').textContent=node.name;$('chapter-ending-note').textContent=node.note;
 $('chapter-return').hidden=!node.returnTo&&node.id!=='A03';$('chapter-bird').hidden=node.id!=='A03';open('chapter-ending');}
function openChoices(){if(!stageComplete(state))return;const options=nextChoices(state.node);if(!options.length){showEnding();return;}
 $('chapter-choice-title').textContent=state.node==='F02'||state.node==='T01'||state.node==='A01'?'选择一个谱系进行探索':'继续穿越演化时间';
 $('chapter-choice-cards').innerHTML=options.map((o,i)=>`<article class="choice-card" style="--species-color:${['#8dbcc3','#d8c999','#b6cba0'][i%3]}"><div class="portrait">${o.id}</div><div class="eyebrow">${SCENES[o.sceneId]} · ${o.biomePreset.replaceAll('-',' ')}</div><h3>${o.name}</h3><p>${o.trait}</p><div class="trait">${o.narration}</div><button class="primary" data-node="${o.id}">探索此谱系 ${o.id==='F04'?'· 推荐':''} →</button></article>`).join('');
 $('chapter-choice-cards').querySelectorAll('[data-node]').forEach(button=>button.onclick=()=>beginTransition(button.dataset.node));open('chapter-choices');}
function nextAction(){const node=byNode[state.node];if(node.terminal){showEnding();return;}openChoices();}
async function beginTransition(to){if(busy)return;busy=true;skipRequested=false;keys.clear();const target=byNode[to],edge=nextChoices(state.node).find(n=>n.id===to),previous=structuredClone(state);
 if($('chapter-choices').open)close('chapter-choices');if($('chapter-ending').open)close('chapter-ending');
 $('chapter-transition-title').textContent=target.name;$('chapter-transition-caption').textContent=edge?.narration||target.note;$('chapter-transition').hidden=false;$('chapter-transition-progress').style.width='0%';
 try{enterNode(state,to);await loadStage();transitionClock=0;transitionPending=true;if(skipRequested)endTransition();}
 catch(error){state=previous;console.error(error);$('chapter-transition').hidden=true;toast('场景或生物模型加载失败：'+error.message);}
 finally{busy=false;}
}
function endTransition(){transitionPending=false;$('chapter-transition').hidden=true;save();toast('已进入 '+byNode[state.node].name+' · '+byNode[state.node].note);canvas.focus();}
async function returnBranch(){if(busy)return;skipRequested=false;const previous=structuredClone(state);if(!returnToAnchor(state)){toast('当前尚无可返回的分支时间锚点。');return;}if($('chapter-pause').open)close('chapter-pause');if($('chapter-ending').open)close('chapter-ending');
 busy=true;$('chapter-transition').hidden=false;$('chapter-transition-title').textContent='返回分支时间锚点';$('chapter-transition-caption').textContent='图鉴和已经完成的其他谱系会保留。';
 try{await loadStage();transitionClock=0;transitionPending=true;if(skipRequested)endTransition();}catch(error){state=previous;console.error(error);toast('返回分支失败：'+error.message);$('chapter-transition').hidden=true;}finally{busy=false;}}
function openAtlas(){if(!playing||busy)return;if($('atlas').open){close('atlas');return;}for(const d of document.querySelectorAll('dialog[open]'))d.close();open('atlas');atlas.open();}
function openPause(){if(!playing||busy||dialogOpen())return;save();music.pause();open('chapter-pause');}
$('chapter-continue').onclick=async()=>{music.start();close('chapter-welcome');await beginPlay(state);};
$('chapter-new').onclick=async()=>{music.start();state=freshChapter();close('chapter-welcome');await beginPlay(state);};
$('next-stage').onclick=nextAction;$('chapter-return').onclick=returnBranch;$('chapter-bird').onclick=()=>beginTransition('A04');
$('chapter-ending-atlas').onclick=openAtlas;$('atlas-button').onclick=openAtlas;$('pause-button').onclick=openPause;
$('egg-continue').onclick=()=>close('egg-explainer');
$('chapter-resume').onclick=()=>close('chapter-pause');$('chapter-anchor').onclick=returnBranch;
$('chapter-quality').onclick=()=>{state.quality=state.quality==='high'?'low':'high';world.quality(state.quality==='high');$('chapter-quality').textContent='画质：'+(state.quality==='high'?'精细':'流畅');save();};
$('chapter-save-now').onclick=()=>{save();toast($('chapter-save').textContent);};
function returnToOcean(){save();music.pause();if(embedded)window.parent.postMessage({type:'life-explorer:return-to-ocean'},location.origin);else location.assign('/');}
$('chapter-ocean-button').onclick=returnToOcean;
if(embedded)document.querySelector('a.brand').onclick=event=>{event.preventDefault();returnToOcean();};
$('skip-transition').onclick=()=>{skipRequested=true;if(transitionPending)endTransition();};
async function beginPlay(){busy=true;$('chapter-loading').hidden=false;
 try{await loadStage();playing=true;$('chapter-hud').hidden=false;$('chapter-loading').hidden=true;save();toast('靠近自然生态线索，按 E 观察或取食。');if(byNode[state.node].terminal&&stageComplete(state))showEnding();}
 catch(error){music.pause();console.error(error);$('chapter-load-label').textContent='加载失败：'+error.message;toast('章节载入失败，请刷新重试。');}
 finally{busy=false;}}
canvas.addEventListener('pointerdown',e=>{if(!active())return;dragging=true;canvas.setPointerCapture(e.pointerId);canvas.focus();});
canvas.addEventListener('pointermove',e=>{if(!dragging||!active())return;yaw-=e.movementX*.005;pitch=THREE.MathUtils.clamp(pitch+e.movementY*.003,-.25,1.15);});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();if(active())zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.01,4,30);},{passive:false});
document.addEventListener('keydown',e=>{
 if(!playing)return;
 if(e.code==='Tab'&&!busy){e.preventDefault();openAtlas();return;}
 if(e.code==='Escape'){if(!dialogOpen())openPause();return;}
 if(!active())return;
 if(e.code==='KeyE'&&!e.repeat){e.preventDefault();interact();return;}
 if(e.code==='KeyR'&&!e.repeat){aim();return;}
 if(e.code==='Space'&&!e.repeat&&byNode[state.node].mode==='fly'&&!airborne){airborne=true;player.position.y+=.8;progress('takeoff');}
 if(['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ShiftLeft'].includes(e.code)){keys.add(e.code);e.preventDefault();}
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();dragging=false;if(active())openPause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();save();}});
window.addEventListener('pagehide',save);window.addEventListener('resize',()=>world?.resize());
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;
 if(!world)return;
 if(transitionPending){transitionClock+=dt;$('chapter-transition-progress').style.width=Math.min(100,transitionClock/6*100)+'%';if(transitionClock>=6)endTransition();}
 if(active()){elapsed+=dt;world.tick(dt);move(dt);updateObjectives();updateHazard(dt);const node=byNode[state.node];modelRoot.rotation.z=node.mode==='fly'&&airborne?Math.sin(elapsed*9)*.065:node.mode==='swim'?Math.sin(elapsed*(node.id==='M03'?2:5))*.035:0;
  for(const mark of footprints)mark.material.opacity=Math.max(0,.46-(elapsed-mark.userData.created)*.03);
  saveClock+=dt;if(saveClock>3){save();saveClock=0;}}
 updateCamera(dt);if(!document.hidden)world.render();atlas.tick(now/1000);
 frames++;if(now-fpsClock>1000){$('chapter-fps').textContent=Math.round(frames*1000/(now-fpsClock))+' FPS';fpsClock=now;frames=0;}
}
requestAnimationFrame(frame);
 $('chapter-loading').hidden=true;$('chapter-continue').hidden=!hasSaved;
 if(embedded)beginPlay();else open('chapter-welcome');
window.__chapters={get snapshot(){return {node:state.node,completed:[...state.completed],unlocked:[...state.unlocked],progress:structuredClone(state.progress),sceneId:byNode[state.node].sceneId,position:player.position.toArray(),facing:new THREE.Vector3(0,0,-1).applyQuaternion(player.quaternion).toArray(),ground:world?.groundHeight(player.position.x,player.position.z),water:world?.waterSurface?.(player.position.x,player.position.z)??world?.waterLevel??world?.manifest?.waterLevel??null,airborne,shoreMode,oxygen,transition:transitionPending};},sample(x,z){return {ground:world?.groundHeight(x,z),water:world?.waterSurface?.(x,z)??null};}};
