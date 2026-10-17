import * as THREE from 'three';
import {createWorld} from './world.js';
const $=id=>document.getElementById(id);
try {
  const world=await createWorld($('ocean'),()=>{});
  let growth=.6,high=true,last=performance.now(),paused=false;
  world.quality(high);
  const views=[...world.manifest.cameras];
  const close=world.algae.placements.find(p=>p.surface==='rock'&&p.position[0]<-10&&p.position[2]>20&&p.position[1]>2);
  if(close){const [x,y,z]=close.position;views.push({name:'Algae_Close',position:[x+2.5,y+1.8,z+3.5],target:[x,y+.3,z],fov:48});}
  views.push({name:'Reverse',position:[-25,9,-30],target:[5,3,23],fov:60});
  for(const view of views){const opt=document.createElement('option');opt.value=view.name;opt.textContent=view.name;$('view').append(opt);}
  function setView(name){const v=views.find(v=>v.name===name)||views[0];world.camera.position.fromArray(v.position);world.camera.lookAt(new THREE.Vector3(...v.target));world.camera.fov=v.fov;world.camera.updateProjectionMatrix();$('view').value=v.name;}
  function setGrowth(value){growth=THREE.MathUtils.clamp(Number(value),0,1);$('growth').value=growth;$('value').value=growth.toFixed(2);}
  setView('Main');
  $('view').onchange=e=>setView(e.target.value);$('growth').oninput=e=>setGrowth(e.target.value);
  $('stages').onclick=e=>{if(e.target.dataset.growth!==undefined)setGrowth(e.target.dataset.growth);};
  $('quality').onclick=()=>{high=!high;world.quality(high);$('quality').textContent='画质：'+(high?'精细':'流畅');};
  let dragging=false;
  $('ocean').onpointerdown=e=>{dragging=true;$('ocean').setPointerCapture(e.pointerId);};
  $('ocean').onpointerup=()=>dragging=false;
  $('ocean').onpointermove=e=>{if(dragging){world.camera.rotation.y-=e.movementX*.003;world.camera.rotation.x=THREE.MathUtils.clamp(world.camera.rotation.x-e.movementY*.003,-1.4,1.4);}};
  $('ocean').onwheel=e=>{e.preventDefault();world.camera.translateZ(e.deltaY*.015);world.constrain(world.camera.position);};
  function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;
    if(!paused){world.tick(dt);world.environment(false,growth,dt);}world.render();
    $('status').textContent=`${world.algae.stats().placements} 处固定生态落点 · 生长 ${world.algae.currentGrowth.toFixed(2)}`;
  }
  // Isolated visual inspection API; the game exposes no evolution bypass.
  window.__algaeReview={world,views,setView,setGrowth,setQuality(value){high=value;world.quality(value);},
    settle(value){setGrowth(value);for(let i=0;i<240;i++)world.environment(false,growth,.05);world.render();},
    advance(seconds){world.tick(seconds);world.environment(false,growth,seconds);world.render();},
    pause(value){paused=value;},get stats(){return {...world.algae.stats(),calls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles};}};
  requestAnimationFrame(frame);
}catch(error){$('error').textContent=error.message;console.error(error);}
