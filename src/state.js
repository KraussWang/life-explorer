import species from './species.json' with {type:'json'};
import {ORGANIC_FLOC_CONFIG} from './organic-floc-config.js';
export { species };
export const byId=Object.fromEntries(species.map(s=>[s.id,s]));
export const SAVE_KEY='life-explorer.p0.v1';
export function fresh(){return {version:1,species:'cell',counts:{nutrient:0,food:0,specialization:0},collected:[],cold:'dormant',gathered:false,position:[0,5,22],origin:[0,5,22],unlocked:['cell'],checkpoint:null,quality:'low'};}
export function requirementsFor(s){return s.species==='cell'?{...byId.cell.requirements,nutrient:ORGANIC_FLOC_CONFIG.requiredAbsorptions}:byId[s.species].requirements;}
export function available(s){const r=requirementsFor(s);return !byId[s.species].ending&&Object.entries(r).every(([k,v])=>k==='cold'?s.cold==='active'||s.cold==='resolved':k==='gathered'?s.gathered:(s.counts[k]||0)>=v);}
export function phase(s){return byId[s.species].ending?'ENDING':available(s)?'OPPORTUNITY_AVAILABLE':'EXPLORING';}
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<150);
export function validate(raw,checkpoint=false){
 if(!raw||raw.version!==1||!Object.hasOwn(byId,raw.species)||!vector(raw.position)||!vector(raw.origin))throw new Error('存档版本或位置无效');
 const s=fresh();s.species=raw.species;s.position=[...raw.position];s.origin=[...raw.origin];
 for(const k of Object.keys(s.counts)){if(!Number.isInteger(raw.counts?.[k])||raw.counts[k]<0||raw.counts[k]>20)throw new Error('资源数据无效');s.counts[k]=raw.counts[k];}
 if(!['dormant','active','resolved'].includes(raw.cold)||typeof raw.gathered!=='boolean')throw new Error('事件数据无效');
 s.cold=raw.cold;s.gathered=raw.gathered;
 if(!Array.isArray(raw.collected)||!raw.collected.every(x=>typeof x==='string'&&/^(nutrient|food|specialization)-[0-9]+$/.test(x)))throw new Error('收集数据无效');
 s.collected=[...new Set(raw.collected)];
 // Resource IDs and counters must agree, or a restored stage could be unwinnable.
 for(const k of Object.keys(s.counts)){
  const limit=requirementsFor(s)[k]||0;
  const ids=s.collected.filter(id=>id.startsWith(k+'-'));
  const spawned=k==='nutrient'&&s.species==='cell'?ORGANIC_FLOC_CONFIG.count:limit;
  if(ids.some(id=>Number(id.split('-')[1])>=spawned)||ids.length!==s.counts[k]||s.counts[k]>limit)throw new Error('资源记录与阶段不一致');
 }
 if(!Array.isArray(raw.unlocked)||!raw.unlocked.every(id=>Object.hasOwn(byId,id)))throw new Error('图鉴数据无效');
 s.unlocked=[...new Set(['cell',...raw.unlocked,s.species])];s.quality=raw.quality==='high'?'high':'low';
 if(!checkpoint&&raw.checkpoint){s.checkpoint=validate(raw.checkpoint,true);if(s.checkpoint.species!=='worm')throw new Error('分叉记录无效');}
 return s;
}
export function readSave(storage){try{const raw=storage.getItem(SAVE_KEY);return {state:raw?validate(JSON.parse(raw)):null,error:null};}catch(e){return {state:null,error:e.message};}}
export function writeSave(storage,state){try{storage.setItem(SAVE_KEY,JSON.stringify(state));return true;}catch{return false;}}
export function evolve(state,id){
 if(!available(state)||!byId[state.species].next.includes(id))throw new Error('演化条件尚未满足');
 const next=structuredClone(state);next.species=id;next.counts={nutrient:0,food:0,specialization:0};next.collected=[];next.origin=[...state.position];
 next.unlocked=[...new Set([...state.unlocked,id])];
 if(id==='colony')next.cold='resolved';
 if(id==='worm')next.checkpoint={...structuredClone(next),checkpoint:null};
 return next;
}
export function restoreBranch(state){if(!state.checkpoint)return null;const s=structuredClone(state.checkpoint);s.unlocked=[...state.unlocked];s.quality=state.quality;s.checkpoint=structuredClone(state.checkpoint);return s;}
