import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {NODES,byNode,EDGES,SCENES,nextChoices} from '../src/chapters/data.js';
import {freshChapter,stageComplete,taskProgress,enterNode,returnToAnchor,validateChapter,writeChapter,readChapter} from '../src/chapters/progress.js';
import {advanceFacing} from '../src/chapters/steering.js';

const complete=s=>{for(const task of byNode[s.node].tasks)for(let i=0;i<task.target;i++)taskProgress(s,task.id);assert.ok(stageComplete(s),s.node);};
test('all chapter models align their observed head axis with local -Z',()=>{
 const headAtPositiveZ=new Set(['F01','F02','F04','T02','A03','A04','M01','M02']);
 for(const node of NODES)assert.equal(node.modelYaw,headAtPositiveZ.has(node.id)?Math.PI:0,node.id);
});
test('a reversing creature waits to turn and advances only along its current facing',()=>{
 const player=new THREE.Group(),direction=new THREE.Vector3(0,0,1),forward=new THREE.Vector3(0,0,-1);
 let startedMoving=false;
 for(let i=0;i<90;i++){
  const before=player.position.clone();
  const travel=advanceFacing(player,direction,1/60,8,.1);
  const displacement=player.position.clone().sub(before);
  const heading=forward.clone().applyQuaternion(player.quaternion);
  assert.ok(displacement.dot(heading)>=-1e-10,'movement must never oppose the model heading');
  assert.ok(displacement.dot(direction)>=-1e-10,'movement must never go against the input');
  assert.ok(Math.abs(displacement.length()-travel)<1e-10);
  if(travel>0)startedMoving=true;
 }
 assert.ok(startedMoving,'movement resumes after the body turns');
 assert.ok(player.position.z>0);
});
test('the 13-node chapter uses only the three existing post-origin scene IDs and typed edges',()=>{
 assert.equal(NODES.length,13);assert.equal(new Set(NODES.map(n=>n.id)).size,13);
 for(const node of NODES){assert.ok(SCENES[node.sceneId]);assert.ok(node.model);assert.equal(node.tasks.length,3);assert.ok(new Set(node.tasks.map(t=>t.type)).size>=2,node.id);}
 for(const [from,edges] of Object.entries(EDGES))for(const [to,type] of edges){assert.ok(byNode[from]&&byNode[to]);assert.ok(['chapter','branch','lineage_jump'].includes(type));}
 assert.equal(nextChoices('F04')[0].edgeType,'lineage_jump');
});
test('branch rewind preserves completed routes, atlas unlocks, task progress and the current stage',()=>{
 const s=freshChapter();complete(s);enterNode(s,'F02');complete(s);enterNode(s,'F03');complete(s);
 assert.ok(returnToAnchor(s));assert.equal(s.node,'F02');assert.ok(s.unlocked.includes('F03'));
 enterNode(s,'F04');complete(s);enterNode(s,'T01');complete(s);enterNode(s,'T02');complete(s);
 assert.ok(returnToAnchor(s));assert.equal(s.node,'T01');enterNode(s,'A01');complete(s);enterNode(s,'M03');
 const memory=new Map(),storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
 assert.ok(writeChapter(storage,s));const restored=readChapter(storage);
 assert.equal(restored.node,'M03');assert.ok(restored.unlocked.includes('F03'));assert.ok(restored.unlocked.includes('T02'));
 assert.ok(restored.completed.includes('F03'));assert.ok(restored.completed.includes('T02'));
 assert.ok(returnToAnchor(restored));assert.equal(restored.node,'A01');
 assert.ok(restored.progress.F04.breathe===2);
});
test('invalid stage, coordinates and impossible task counters cannot silently corrupt a save',()=>{
 const s=freshChapter();assert.throws(()=>validateChapter({...s,node:'UNKNOWN'}));
 assert.throws(()=>validateChapter({...s,position:[999,0,0]}));
 assert.throws(()=>validateChapter({...s,progress:{F01:{feed:4}}}));
});
