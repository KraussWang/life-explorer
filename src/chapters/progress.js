import {byNode,ANCHORS,EDGES} from './data.js';

export const CHAPTER_SAVE_KEY='life-explorer.fish-chapters.v1';
const cleanProgress=()=>({});
export function freshChapter(){return {version:1,node:'F01',position:null,completed:[],unlocked:['F01'],progress:cleanProgress(),anchors:{},quality:'low'};}
export function completedTask(state,id){return (state.progress[state.node]?.[id]||0)>=byNode[state.node].tasks.find(t=>t.id===id)?.target;}
export function stageComplete(state){return byNode[state.node].tasks.every(t=>completedTask(state,t.id));}
export function taskProgress(state,id,amount=1){
 const task=byNode[state.node].tasks.find(t=>t.id===id);if(!task)return false;
 const p=(state.progress[state.node]??={});const before=p[id]||0;p[id]=Math.min(task.target,before+amount);return p[id]!==before;
}
export function finishStage(state){if(!stageComplete(state))return false;state.completed=[...new Set([...state.completed,state.node])];return true;}
export function enterNode(state,to){
 const edge=(EDGES[state.node]||[]).find(e=>e[0]===to);if(!stageComplete(state)||!edge)throw new Error('路线尚未解锁');
 finishStage(state);
 if(ANCHORS.includes(state.node))state.anchors[state.node]=true;
 state.node=to;state.position=null;state.unlocked=[...new Set([...state.unlocked,to])];return edge;
}
export function returnToAnchor(state){
 const target=byNode[state.node].returnTo||(['F02','T01','A01'].findLast(id=>state.anchors[id]));
 if(!target||!state.anchors[target])return false;
 if(stageComplete(state))finishStage(state);
 state.node=target;state.position=null;return true;
}
const vector=v=>v===null||Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<300);
export function validateChapter(value){
 if(!value||value.version!==1||!byNode[value.node]||!vector(value.position))throw new Error('章节存档无效');
 const s=freshChapter();s.node=value.node;s.position=value.position?.slice()||null;
 for(const key of ['completed','unlocked']){
  if(!Array.isArray(value[key])||value[key].some(id=>!byNode[id]))throw new Error('章节节点无效');
  s[key]=[...new Set(value[key])];
 }
 s.unlocked=[...new Set([...s.unlocked,s.node])];
 if(!value.progress||typeof value.progress!=='object')throw new Error('任务进度无效');
 for(const [id,p] of Object.entries(value.progress)){
  if(!byNode[id]||!p||typeof p!=='object')throw new Error('任务进度无效');
  s.progress[id]={};
  for(const [taskId,count] of Object.entries(p)){
   const task=byNode[id].tasks.find(t=>t.id===taskId);
   if(!task||!Number.isInteger(count)||count<0||count>task.target)throw new Error('任务进度无效');
   s.progress[id][taskId]=count;
  }
 }
 if(value.anchors&&typeof value.anchors==='object')for(const id of ANCHORS)s.anchors[id]=value.anchors[id]===true;
 s.quality=value.quality==='high'?'high':'low';return s;
}
export function readChapter(storage){try{const raw=storage?.getItem(CHAPTER_SAVE_KEY);return raw?validateChapter(JSON.parse(raw)):null;}catch{return null;}}
export function writeChapter(storage,state){try{storage?.setItem(CHAPTER_SAVE_KEY,JSON.stringify(state));return !!storage;}catch{return false;}}
