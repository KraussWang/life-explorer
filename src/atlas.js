import {catalog,catalogById,categories,rarities,isDiscovered} from './catalog.js';
import {createModelViewer} from './atlas-viewer.js';
import './atlas.css';
const $=id=>document.getElementById(id);
const icons={
 evolution:'<path d="M28 17c0-9-14-13-20-4-6 9 2 20 12 17 8-2 9-13 2-16-5-2-10 3-7 7 2 4 8 2 6-2M18 19l-8-8m6 6L6 17m10 5-8 5m13-2-2 8m7-13 7-1"/>',
 plant:'<path d="M20 34V13m0 14C7 28 4 20 5 16c9-1 14 3 15 11Zm0-8C29 19 34 12 32 8c-8 0-12 4-12 11Zm0-6C12 10 13 3 17 1c5 4 6 8 3 12Z"/>',
 marine:'<path d="M4 20c9-12 20-11 26-3l7-5v16l-7-5C23 31 13 31 4 20Zm11-8 5-6 4 7m-9 15 5 6 3-7"/><circle cx="11" cy="19" r="1"/>',
 stats:'<path d="M7 32V20h5v12Zm11 0V7h5v25Zm11 0V14h5v18Z"/>',
 lock:'<rect x="10" y="17" width="20" height="17" rx="3"/><path d="M14 17v-6a6 6 0 0 1 12 0v6m-6 6v5"/>',
 cube:'<path d="m20 4 15 9v16l-15 9-15-9V13Zm-15 9 15 9 15-9M20 22v16M12 9l15 9"/>',
};
export const icon=id=>`<svg viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[id]||icons.evolution}</svg>`;
export function createAtlas(getState){
 let selected='cell',category='all',status='all',statistics=false;
 const viewer=createModelViewer();
 $('atlas-sidebar').innerHTML=['evolution','plant','marine','stats'].map((id,i)=>`<button class="codex-section" data-category="${id}" aria-pressed="false">${icon(id)}<span><strong>${categories[id]||'收藏统计'}</strong><small>${['生命的演化历程','塑造世界的绿意','蔚蓝深处的生命','探索的足迹'][i]}</small></span></button>`).join('');
 $('atlas-tabs').innerHTML=['all','evolution','plant'].map(id=>`<button data-category="${id}" aria-pressed="${id==='all'}">${id==='all'?'':icon(id)}${id==='plant'?'植物':categories[id]}</button>`).join('');
 function filtered(){return catalog.filter(s=>(category==='all'||s.category===category)&&(status==='all'||isDiscovered(getState(),s)===(status==='unlocked')));}
 function updateCounts(){const n=catalog.filter(s=>isDiscovered(getState(),s)).length;$('atlas-count').innerHTML=`<b>${n}</b> / ${catalog.length}`;$('atlas-progress').style.width=100*n/catalog.length+'%';$('atlas-progressbar').setAttribute('aria-valuenow',n);$('atlas-progressbar').setAttribute('aria-valuemax',catalog.length);}
 function render(){
  updateCounts();const items=filtered();if(!items.some(s=>s.id===selected))selected=items[0]?.id||null;
  document.querySelectorAll('#atlas [data-category]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.category===(statistics?'stats':category)));
  document.querySelectorAll('#atlas [data-status]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.status===status));
  $('atlas-result-count').textContent=`${items.length} 个条目`;
  $('atlas-statistics').hidden=!statistics;$('atlas-list').hidden=statistics;
  if(statistics){$('atlas-statistics').innerHTML=`<div class="stats-intro"><span>YOUR JOURNEY</span><h3>每一个发现，都是生命的回声。</h3><p>演化记录与实地观察，将随游戏进度一同保存。</p></div>${['evolution','plant','marine'].map(c=>{const all=catalog.filter(s=>s.category===c),found=all.filter(s=>isDiscovered(getState(),s)).length;return `<article>${icon(c)}<h3>${categories[c]}</h3><b>${found}<small> / ${all.length}</small></b><div class="codex-meter"><i style="width:${100*found/all.length}%"></i></div></article>`;}).join('')}`;}
  $('atlas-list').innerHTML=items.length?items.map(s=>{const unlocked=isDiscovered(getState(),s),completed=getState().completed?.includes(s.id),view=s.image.views[s.image.hero];return `<button class="codex-card ${s.rarity} ${unlocked?'':'locked'} ${s.id===selected?'selected':''}" data-species="${s.id}" aria-pressed="${s.id===selected}" aria-label="${s.name}，${completed?'已完成专属体验':unlocked?'已解锁':'未解锁'}"><span class="card-flourish">⌘</span><span class="card-emblem">${icon(s.category)}</span><img class="card-organism" src="${view.image}" alt="" loading="lazy" draggable="false">${unlocked?'':`<span class="card-lock">${icon('lock')}</span>`}<span class="card-caption"><strong>${s.name}</strong><span class="card-meta"><small>${completed?'已完成专属体验':unlocked?categories[s.category]:'???'}</small><span class="rarity"><i></i>${unlocked?rarities[s.rarity]:'未解锁'}</span></span></span></button>`;}).join(''):'<div class="codex-empty"><span>◎</span><h3>尚无对应记录</h3><p>切换筛选，或回到海洋继续探索。</p><button id="atlas-reset">显示全部条目</button></div>';
  $('atlas-list').querySelectorAll('[data-species]').forEach(b=>b.onclick=()=>{selected=b.dataset.species;render();});
  if($('atlas-reset'))$('atlas-reset').onclick=()=>{category=status='all';render();};
  renderDetail();
 }
 function renderDetail(){
  const s=catalogById[selected];$('atlas-detail').hidden=!s;if(!s)return;
  const unlocked=isDiscovered(getState(),s),completed=getState().completed?.includes(s.id),hero=s.image.views[s.image.hero];
  $('atlas-detail').className=`codex-detail ${s.rarity} ${unlocked?'':'is-locked'}`;
  $('atlas-description').innerHTML=`<div class="detail-category"><span>${icon(s.category)}${categories[s.category]}</span><span class="rarity"><i></i>${rarities[s.rarity]}</span></div><h2>${s.name}</h2><p class="latin">${s.latin}</p><div class="specimen-board ${unlocked?'':'locked'}"><figure class="specimen-main"><img src="${hero.image}" alt="${s.name} · ${hero.label}"><figcaption>${hero.label}</figcaption></figure><div class="specimen-other">${s.image.views.filter(v=>v!==hero).map(v=>`<figure><img src="${v.image}" alt="${s.name} · ${v.label}"><figcaption>${v.label}</figcaption></figure>`).join('')}</div>${unlocked?'':`<div class="specimen-seal">${icon('lock')}<span>尚未发现</span></div>`}</div><div class="specimen-source">${s.image.kind==='source-crop'?`原始${s.image.views.length===4?'四':'三'}视图 · 独立裁剪`:'原始模型 · 四向观察'}</div><dl class="codex-facts"><dt>♧ &nbsp;名称</dt><dd>${s.name}</dd><dt>◉ &nbsp;类型</dt><dd>${categories[s.category]}</dd><dt>◷ &nbsp;时代 / 环境</dt><dd>${s.era}</dd><dt>◈ &nbsp;体验状态</dt><dd>${completed?'已完成专属体验':unlocked?'已解锁':'未发现'}</dd><dt>✧ &nbsp;特征</dt><dd>${unlocked?s.trait:'解锁后揭示'}</dd><dt>♧ &nbsp;演化意义</dt><dd>${unlocked?s.description:s.unlock.hint}</dd><dt>◌ &nbsp;栖息地</dt><dd>${s.habitat}</dd></dl>`;
  $('atlas-view-model').disabled=!unlocked;$('atlas-view-model').innerHTML=`${icon(unlocked?'cube':'lock')}<span>${unlocked?'查看模型':'尚未解锁'}<small>${unlocked?'3D MODEL':'CONTINUE EXPLORING'}</small></span>`;
 }
 document.querySelectorAll('#atlas [data-category]').forEach(b=>b.onclick=()=>{statistics=b.dataset.category==='stats';category=statistics?'all':b.dataset.category;render();});
 document.querySelectorAll('#atlas [data-status]').forEach(b=>b.onclick=()=>{statistics=false;status=b.dataset.status;render();});
 $('atlas-view-model').onclick=()=>{const entry=catalogById[selected];if(entry&&isDiscovered(getState(),entry))viewer.open(entry);};
 $('atlas').addEventListener('close',()=>viewer.close());
 return {open(){selected=getState().species;category=status='all';statistics=false;render();},tick(time){viewer.tick(time);}};
}
