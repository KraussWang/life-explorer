import * as THREE from 'three';
import {createWorld} from './src/world.js';
import {createScallopWorld} from './src/scallop/world.js';
import {growthForSpecies} from './src/algae.js';
import {species,byId,fresh,available,phase,requirementsFor,readSave,writeSave,evolve,restoreBranch} from './src/state.js';
import {makeModel,preload,animateModel,disposeInstance} from './src/models.js';
import {createObjectives} from './src/objectives.js';
import {loadNutrientFlocAsset} from './src/nutrient-floc.js';
import {createAtlas} from './src/atlas.js';
import {nearbyDiscoveries,recordDiscovery,catalogById} from './src/catalog.js';

const $=id=>document.getElementById(id),canvas=$('ocean');
const SCALLOP_PLAYER_SIZE=.55,SCALLOP_CAMERA_ZOOM=4;
const makePlayerModel=id=>makeModel(id,id==='bivalve'?{targetSize:SCALLOP_PLAYER_SIZE}:undefined);
let worldDirty=true;
let storage;try{storage=window.localStorage;}catch{storage=null;}
const saved=readSave(storage);let state=fresh(),world,primordialWorld,scallopWorld,objectives,model,started=false,busy=false,transition=null,elapsed=0,warmth=100;
const player=new THREE.Group(),keys=new Set();let yaw=0,pitch=.3,zoom=10,dragging=false,moving=false,scallopModelBottom=0;
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
const shadowContext=shadowCanvas.getContext('2d');
const shadowGradient=shadowContext.createRadialGradient(64,64,3,64,64,62);
shadowGradient.addColorStop(0,'rgba(255,255,255,0.7)');
shadowGradient.addColorStop(1,'rgba(255,255,255,0)');
shadowContext.fillStyle=shadowGradient;shadowContext.fillRect(0,0,128,128);
const contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:0x514938,map:new THREE.CanvasTexture(shadowCanvas),transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide}));
contactShadow.rotation.x=-Math.PI/2;contactShadow.visible=false;player.add(contactShadow);
const atlas=createAtlas(()=>state);let toastTimer,saveTimer=0,uiTimer=0,lastFrame=performance.now(),fpsStart=lastFrame,frames=0;
const vector=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),cameraTarget=new THREE.Vector3();
const heading=new THREE.Vector3(),desiredHeading=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
function modalOpen(){return !!document.querySelector('dialog[open]');}
function active(){return started&&!busy&&!transition&&!modalOpen()&&!document.hidden;}
function show(id){keys.clear();dragging=false;$(id).showModal();}
function close(id){$(id).close();keys.clear();canvas.focus();}
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>close(b.dataset.close);
for(const d of document.querySelectorAll('dialog')){d.addEventListener('cancel',e=>{e.preventDefault();if(d.id!=='welcome'&&!busy)close(d.id);});d.addEventListener('close',()=>keys.clear());}
function save(){if(!started)return;state.position=player.position.toArray();$('save-status').textContent=writeSave(storage,state)?'✓ 进度已保存':'存储不可用 · 仅本次会话';}
function applyQuality(){world.quality(state.quality==='high');worldDirty=true;$('quality').textContent='画质：'+(state.quality==='high'?'精细':'流畅');}
function setModel(object){
 if(model){player.remove(model);disposeInstance(model);}
 object.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(object);
 scallopModelBottom=object.name==='bivalve'?bounds.min.y:0;
 if(object.name==='bivalve'){
  const size=bounds.getSize(new THREE.Vector3());
  contactShadow.scale.set(size.x*1.15,size.z*1.15,1);
 }
 contactShadow.visible=object.name==='bivalve';
 model=object;player.add(model);
}
function scallopClearance(){return -scallopModelBottom*player.scale.y+.02;}
function placeScallopOnSand(){
 const clearance=scallopClearance();
 world.constrain(player.position,clearance);
 player.position.y=world.groundHeight(player.position.x,player.position.z)+clearance;
 contactShadow.position.y=scallopModelBottom+.01/player.scale.y;
}
function preloadNext(){for(const id of byId[state.species].next)preload(id).catch(()=>{});}
async function prepareWorld(species){
 if(species!=='bivalve')return primordialWorld;
 if(!scallopWorld)scallopWorld=await createScallopWorld(primordialWorld.renderer,primordialWorld.camera);
 return scallopWorld;
}
function activateWorld(next){
 if(world===next)return;
 next.scene.add(player);
 world=next;
 world.camera.fov=next===scallopWorld?55:62;
 world.camera.far=next===scallopWorld?1200:300;
 world.camera.updateProjectionMatrix();
 world.renderer.toneMappingExposure=next===scallopWorld?1.05:1.38;
 world.resize?.();
 worldDirty=true;
}
function leaveScallop(){
 if(world===scallopWorld)return;
 scallopWorld?.dispose();
 scallopWorld=null;
}
async function start(next){
 if(busy)return;busy=true;
 try{const [object,nextWorld]=await Promise.all([makePlayerModel(next.species),prepareWorld(next.species)]);state=next;activateWorld(nextWorld);player.position.fromArray(state.position);if(state.species==='bivalve'&&state.position[0]===0&&state.position[2]===5)player.position.fromArray(world.spawn);player.quaternion.identity();player.scale.setScalar(1);setModel(object);if(state.species==='bivalve')placeScallopOnSand();else world.constrain(player.position);state.position=player.position.toArray();objectives.build(state);applyQuality();started=true;warmth=100;$('hud').hidden=false;document.querySelectorAll('dialog[open]').forEach(d=>d.close());yaw=0;pitch=.3;zoom=state.species==='bivalve'?SCALLOP_CAMERA_ZOOM:10;updateCamera(1,true);updateUI();save();preloadNext();canvas.focus();leaveScallop();if(byId[state.species].ending&&state.species!=='bivalve')showEnding();else toast(state.species==='bivalve'?'扇贝谱系已解锁 · 按 Tab 查看图鉴，继续探索浅海。':state.species==='cell'?'WASD 寻找灰白有机絮团；靠近自动吸收，按 R 对准目标。':'已恢复探索，当前条件与图鉴均已保留。');}
 catch(e){leaveScallop();toast('形态或场景载入失败，请重试。'+e.message);}
 finally{busy=false;}
}
function newJourney(){const next=fresh();next.unlocked=[...new Set([...(started?state.unlocked:saved.state?.unlocked||[]),'cell'])];next.discoveries=[...(started?state.discoveries:saved.state?.discoveries||[])];next.quality=started?state.quality:saved.state?.quality||'low';return start(next);}
$('start').onclick=()=>{if(saved.state){$('save-warning').hidden=false;$('save-warning').textContent='重新开始会替换当前进度，已发现图鉴保留。再次点击确认。';if($('start').dataset.confirmed==='true')newJourney();$('start').dataset.confirmed='true';}else newJourney();};
$('continue').onclick=()=>start(saved.state);
function openPause(){if(!started||transition||busy||modalOpen())return;save();$('branch-pause').disabled=!state.checkpoint;$('restart-confirm').hidden=true;show('pause');}
$('pause-button').onclick=openPause;$('resume').onclick=()=>close('pause');
$('quality').onclick=()=>{state.quality=state.quality==='high'?'low':'high';applyQuality();save();};
$('save-now').onclick=()=>{save();toast($('save-status').textContent);};
$('restart').onclick=()=>$('restart-confirm').hidden=false;
$('cancel-restart').onclick=()=>$('restart-confirm').hidden=true;
$('confirm-restart').onclick=newJourney;
function openAtlas(){if(!started||transition||busy)return;if($('atlas').open){close('atlas');return;}document.querySelectorAll('dialog[open]').forEach(d=>d.close());show('atlas');atlas.open();}
$('atlas-button').onclick=openAtlas;$('ending-atlas').onclick=openAtlas;
async function branch(){if(busy||transition)return;const next=restoreBranch(state);if(next)await start(next);}
$('return-branch').onclick=branch;$('branch-pause').onclick=branch;
function openChoices(){
 if(!active()||!available(state))return;const spec=byId[state.species];
 $('choice-title').textContent=state.species==='worm'?'同一个起点，三种生活方式。':'新的可能，正在浮现。';
 $('choice-cards').innerHTML=spec.next.map(id=>{const s=byId[id];return `<article class="choice-card" style="--species-color:${s.color}"><div class="portrait">${s.icon}</div><div class="eyebrow">${s.latin}</div><h3>${s.name}</h3><p>${s.description}</p><div class="trait">${s.trait}</div><button class="primary" data-evolve="${id}">选择这一方向 <span>→</span></button></article>`;}).join('');
 $('choice-cards').querySelectorAll('[data-evolve]').forEach(b=>b.onclick=()=>beginEvolution(b.dataset.evolve));show('choice');
}
$('evolve-button').onclick=openChoices;
async function beginEvolution(id){
 if(busy||transition||!available(state)||!byId[state.species].next.includes(id))return;
 busy=true;keys.clear();$('choice-cards').querySelectorAll('button').forEach(b=>{b.disabled=true;b.textContent='正在准备形态…';});
 try{const [nextModel,nextWorld]=await Promise.all([makePlayerModel(id),prepareWorld(id)]);state.position=player.position.toArray();const next=evolve(state,id);close('choice');transition={time:0,duration:4.5,next,nextModel,nextWorld,switched:false};$('transition').hidden=false;$('transition-title').textContent=byId[id].name;$('transition-caption').textContent=id==='colony'?'细胞逐渐聚集、分工，寒潮中的合作延续下来。':id==='worm'?'细胞逐渐特化，身体的前后轴线与协调运动形成。':'许多世代之后，一种新的生活方式渐渐形成。';}
 catch(e){leaveScallop();toast('新形态或场景未能加载，进度已保留。请重试。');$('choice-cards').querySelectorAll('button').forEach(b=>{b.disabled=false;b.textContent='重试选择这一方向 →';});}
 finally{busy=false;}
}
function stepEvolution(dt){
 const t=transition;if(!t)return;t.time+=dt;const progress=Math.min(1,t.time/t.duration);$('transition-progress').style.width=progress*100+'%';
 if(!t.switched){player.scale.setScalar(Math.max(.08,1-progress*1.8));player.rotation.y+=dt*.8;if(progress>=.5){state=t.next;activateWorld(t.nextWorld);if(state.species==='bivalve')player.position.fromArray(world.spawn);setModel(t.nextModel);if(state.species==='bivalve'){placeScallopOnSand();state.position=player.position.toArray();state.origin=[...state.position];yaw=0;pitch=.3;zoom=SCALLOP_CAMERA_ZOOM;updateCamera(1,true);}objectives.build(state);applyQuality();t.switched=true;updateUI();}}
 else player.scale.setScalar(Math.min(1,.1+(progress-.5)*1.8));
 if(t.switched&&state.species==='bivalve')placeScallopOnSand();
 if(progress>=1){player.scale.setScalar(1);if(state.species==='bivalve')placeScallopOnSand();transition=null;warmth=100;$('transition').hidden=true;updateUI();save();preloadNext();if(byId[state.species].ending&&state.species!=='bivalve')showEnding();else toast(state.species==='bivalve'?'扇贝谱系已解锁 · 按 Tab 查看图鉴，继续探索浅海。':state.species==='colony'?'寒潮退去，早期生命海洋出现新的食物与特化资源。':'新形态已解锁：'+byId[state.species].name);}
}
function showEnding(){const s=byId[state.species];$('ending-icon').textContent=s.icon;$('ending-name').textContent=s.name;$('ending-description').textContent=s.description;show('ending');}
const requirementNames={nutrient:'营养吸收',cold:'进入冷流区',gathered:'靠近同类群',food:'复杂食物',specialization:'特化资源'};
function updateUI(){
 const spec=byId[state.species],can=available(state);$('species-name').textContent=spec.name;$('species-trait').textContent=spec.trait;$('phase-label').textContent=phase(state);
 $('chapter-number').textContent=spec.scene==='S01'?'CHAPTER 01 / 生命的起点':'CHAPTER 02 / 协作与分化';$('biome').textContent=state.species==='bivalve'?'史前浅海扇贝栖息地':spec.scene==='S01'?'原始海洋':'早期生命海洋';$('temperature').textContent=state.species==='bivalve'?'温暖浅海':state.cold==='active'?'极寒冷流':state.cold==='resolved'?'寒潮已退 · 生态复苏':'温暖水域';
 $('mission-title').textContent=spec.ending?'这条谱系，已被发现':can?'演化的机会已出现':state.species==='cell'?'生命需要能量':state.species==='flagellate'?'在寒潮中找到彼此':'让细胞学会分工';$('mission-hint').textContent=spec.strategy;
 $('requirements').innerHTML=Object.entries(requirementsFor(state)).map(([k,n])=>{const value=k==='cold'?state.cold!=='dormant':k==='gathered'?state.gathered:state.counts[k];const done=value>=n;return `<div class="requirement"><span>${done?'✓':'○'} ${requirementNames[k]}</span><b>${typeof n==='boolean'?(done?'已达成':'待探索'):value+' / '+n}</b></div>${typeof n==='number'?`<div class="meter"><i style="width:${Math.min(100,value/n*100)}%"></i></div>`:''}`;}).join('');
 $('evolve-button').disabled=!can;$('evolve-button').innerHTML=(can?'探索演化方向':spec.ending?'谱系已解锁':'演化条件尚未满足')+' <kbd>E</kbd>';
 $('event-banner').hidden=state.cold!=='active';$('frost').style.opacity=state.cold==='active'?'1':'0';$('model-tag').textContent=spec.placeholder?'蠕虫状祖先 · 占位形态':'你的种群 · '+spec.name;
 $('movement-control').innerHTML='<kbd>W A S D</kbd> '+(state.species==='bivalve'?'沿沙地移动':'游动');
 $('vertical-control').hidden=state.species==='bivalve';
 canvas.setAttribute('aria-label',state.species==='bivalve'?'生命探索者史前浅海，WASD 沿沙地移动':'生命探索者三维海洋，WASD 移动，空格上浮，Q 下潜');
 const lineage=['cell','flagellate','colony','worm'];$('lineage').innerHTML=[...lineage,byId[state.species].ending?state.species:'branch'].map((id,i)=>`${i?'<i></i>':''}<span class="${id===state.species?'active':''}">${id==='branch'?'三条谱系':byId[id].name}</span>`).join('');
}
function aim(){const target=objectives.target(state,player.position);if(target){const d=target.position.clone().sub(player.position);yaw=Math.atan2(-d.x,-d.z);pitch=.25;toast('已对准 '+target.name+'，按 W 前进，Space / Q 调整高度。');}else{yaw=0;pitch=.3;}}
function updateCamera(dt,snap=false){
 const scallop=state.species==='bivalve';
 cameraTarget.copy(player.position).add(new THREE.Vector3(0,scallop ? .15 : .4,0));desiredCamera.set(Math.sin(yaw)*Math.cos(pitch)*zoom,Math.sin(pitch)*zoom+(scallop ? .75 : 1.2),Math.cos(yaw)*Math.cos(pitch)*zoom).add(player.position);world.constrain(desiredCamera);
 world.camera.position.lerp(desiredCamera,snap?1:1-Math.exp(-dt*8));world.camera.lookAt(cameraTarget);
}
function move(dt){
 vector.set(0,0,0);const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 if(keys.has('KeyW')||keys.has('ArrowUp'))vector.add(f);if(keys.has('KeyS')||keys.has('ArrowDown'))vector.sub(f);if(keys.has('KeyD')||keys.has('ArrowRight'))vector.add(r);if(keys.has('KeyA')||keys.has('ArrowLeft'))vector.sub(r);if(state.species!=='bivalve'){if(keys.has('Space'))vector.y++;if(keys.has('KeyQ'))vector.y--;}
 moving=vector.lengthSq()>0;const speed=byId[state.species].speed*(state.cold==='active'?.6+warmth/250:1)*(keys.has('ShiftLeft')?1.5:1);
 if(moving){
  const vertical=vector.y;let turnSpeed=1;vector.y=0;
  if(vector.lengthSq()>0){
   vector.normalize();
   // Rotate the body toward camera-relative input, then swim along its actual
   // facing axis. Slow down while turning around so reverse input never sends
   // a still-forward-facing cell tail first or sideways.
   desiredHeading.setFromAxisAngle(up,Math.atan2(-vector.x,-vector.z));
   player.quaternion.slerp(desiredHeading,1-Math.exp(-dt*12));
   heading.set(0,0,-1).applyQuaternion(player.quaternion);
   turnSpeed=Math.max(0,heading.dot(vector));
   vector.copy(heading);
  }
  vector.y=vertical;
  vector.normalize().multiplyScalar(speed*dt);
  vector.x*=turnSpeed;vector.z*=turnSpeed;
  const steps=Math.max(1,Math.ceil(vector.length()/.25));
  for(let i=0;i<steps;i++){
   player.position.addScaledVector(vector,1/steps);
   if(state.species==='bivalve')placeScallopOnSand();else world.constrain(player.position);
  }
 }
 if(state.species==='bivalve')placeScallopOnSand();
 else{ // Keep the other bodies above the heightfield, including the procedural worm's waves.
  const floor=world.groundHeight(player.position.x,player.position.z)+1.5;player.position.y=Math.max(player.position.y,floor);
 }
 if(state.cold==='active'){const peers=objectives.items.find(i=>i.type==='peers');const sheltered=peers&&peers.position.distanceTo(player.position)<5;warmth=THREE.MathUtils.clamp(warmth+dt*(sheltered?20:-3),15,100);$('warmth-fill').style.width=warmth+'%';$('warmth-label').textContent=sheltered?'聚集庇护 · 体温回升':'低温减缓游动 · 同类群提供庇护';}
}
function updateTarget(){
 const target=objectives.target(state,player.position);$('target-marker').hidden=!target||modalOpen()||!!transition;
 if(!target){$('target-distance').textContent=available(state)?'按 E，主动确认下一步':byId[state.species].ending?'图鉴已更新 · 暂停菜单可返回分叉':'自由探索';return;}
 const distance=target.position.distanceTo(player.position),p=target.position.clone().add(new THREE.Vector3(0,1,0)).project(world.camera);const behind=p.z>1;
 const nutrient=target.type==='nutrient';
 $('target-marker').classList.toggle('nutrient',nutrient);
 $('target-marker').querySelector('span').textContent=nutrient?'·':'◇';
 // Nutrients get a nearby label; the mission panel and R remain available at range.
 if(nutrient)$('target-marker').hidden=distance>6||behind||Math.abs(p.x)>1||Math.abs(p.y)>1||modalOpen()||!!transition;
 $('target-distance').textContent=target.name+' · '+distance.toFixed(1)+' m'+(target.position.y-player.position.y>2?' · Space 上浮':player.position.y-target.position.y>2?' · Q 下潜':' · R 对准');
 $('target-marker').style.left=THREE.MathUtils.clamp((p.x*.5+.5)*innerWidth,340,innerWidth-90)+'px';$('target-marker').style.top=THREE.MathUtils.clamp((-p.y*.5+.5)*innerHeight,120,innerHeight-150)+'px';$('target-marker').querySelector('small').textContent=(behind?'↶ R 对准 · ':'')+target.name+' '+distance.toFixed(0)+' m';
 if(nutrient){
  $('target-marker').style.left=THREE.MathUtils.clamp((p.x*.5+.5)*innerWidth,100,innerWidth-100)+'px';
  $('target-marker').querySelector('small').textContent='有机絮团 · 靠近吸收 · '+distance.toFixed(1)+' m';
 }
}
canvas.addEventListener('pointerdown',e=>{if(!active())return;dragging=true;canvas.focus();canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!dragging||!active())return;yaw-=e.movementX*.005;pitch=THREE.MathUtils.clamp(pitch+e.movementY*.003,-.15,1.1);});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();if(active())zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.01,state.species==='bivalve'?2.8:5,state.species==='bivalve'?14:20);},{passive:false});
document.addEventListener('keydown',e=>{
 if(!started)return;
 if(e.code==='Tab'&&!modalOpen()&&!transition){e.preventDefault();openAtlas();return;}
 if(e.code==='Escape'){if(!modalOpen()){e.preventDefault();openPause();}return;}
 if(!active())return;
 if(e.code==='KeyE'&&!e.repeat){e.preventDefault();openChoices();return;}if(e.code==='KeyR'&&!e.repeat){aim();return;}
 if(['KeyW','KeyA','KeyS','KeyD','KeyQ','Space','ShiftLeft','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){keys.add(e.code);e.preventDefault();}
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();dragging=false;if(started&&!modalOpen()&&!transition)openPause();});
document.addEventListener('visibilitychange',()=>{keys.clear();if(document.hidden){save();if(started&&!modalOpen()&&!transition)openPause();}});
window.addEventListener('pagehide',save);
window.addEventListener('resize',()=>{world?.resize?.();worldDirty=true;});
function frame(now){
 requestAnimationFrame(frame);const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;if(!world)return;
 const playing=active(),animating=!document.hidden&&(!started||playing||!!transition);
 if(animating){elapsed+=dt;world.tick(dt);world.environment(state.cold==='active',growthForSpecies(state.species),dt);animateModel(model,state.species,elapsed,moving);if(transition)stepEvolution(dt);}
 if(playing){move(dt);if(objectives.update(state,player.position,elapsed,true,toast)){updateUI();save();if(available(state))toast('条件已达成！按 E 选择演化方向。');}saveTimer+=dt;if(saveTimer>4){save();saveTimer=0;}}
 if(!modalOpen()||!started)updateCamera(dt);
 if(!document.hidden&&(animating||!modalOpen()||worldDirty)){world.render();worldDirty=false;}
 atlas.tick(now/1000);uiTimer+=dt;if(uiTimer>.12&&started){updateTarget();uiTimer=0;if(playing){const found=nearbyDiscoveries(world,player.position).filter(id=>recordDiscovery(state,id));if(found.length){save();toast('图鉴新发现：'+found.map(id=>catalogById[id].name).join('、'));}}}
 frames++;if(now-fpsStart>1000){$('fps').textContent=Math.round(frames*1000/(now-fpsStart))+' FPS';fpsStart=now;frames=0;}
}
async function init(){
 try{
  const results=await Promise.all([createWorld(canvas,p=>$('progress').style.width=p*80+'%'),makeModel('cell'),loadNutrientFlocAsset()]);world=primordialWorld=results[0];setModel(results[1]);world.scene.add(player);player.position.set(0,5,22);world.constrain(player.position);objectives=createObjectives(world,results[2]);updateCamera(1,true);
  $('progress').style.width='95%';$('load-label').textContent='正在准备水体与生命光影…';await world.renderer.compileAsync(world.scene,world.camera);
  $('loading').classList.add('done');$('continue').hidden=!saved.state;if(saved.state)$('start').textContent='开始新的旅程';if(saved.error){$('save-warning').hidden=false;$('save-warning').textContent='存档无法读取：'+saved.error+'。可开始新旅程。';}show('welcome');
  // Read-only diagnostics for browser acceptance tests; no gameplay bypass is shipped.
  window.__life={get ready(){return !!world;},get snapshot(){return {state:structuredClone(state),phase:transition?'EVOLVING':$('choice').open?'CHOOSING':phase(state),environment:world===scallopWorld?'scallop':'primordial',position:player.position.toArray(),yaw,paused:modalOpen(),target:objectives.target(state,player.position)?{type:objectives.target(state,player.position).type,position:objectives.target(state,player.position).position.toArray()}:null,model:model?.name,modelBottom:state.species==='bivalve'?new THREE.Box3().setFromObject(model).min.y:null,cameraY:world.camera.position.y,cameraGround:world.groundHeight(world.camera.position.x,world.camera.position.z),facing:new THREE.Vector3(0,0,-1).applyQuaternion(player.quaternion).toArray(),cellAxis:state.species==='cell'?new THREE.Vector3(1,0,0).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())).toArray():null,drawCalls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,quality:{pixelRatio:world.renderer.getPixelRatio(),shadows:world.renderer.shadowMap.enabled},ground:world.groundHeight(player.position.x,player.position.z)};}};
 }catch(e){console.error(e);$('load-label').textContent='加载失败：'+e.message;$('retry-load').hidden=false;}
}
requestAnimationFrame(frame);init();
