import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {catalog,isDiscovered,recordDiscovery,nearbyDiscoveries} from '../src/catalog.js';
import {fresh,validate,restoreBranch,writeSave,readSave} from '../src/state.js';

test('every catalog model, variant and image resolves to a real local asset',()=>{
 assert.equal(new Set(catalog.map(s=>s.id)).size,catalog.length);
 for(const entry of catalog){
  for(const url of [entry.model,...(entry.variants||[]).map(v=>v.url),...entry.image.views.map(v=>v.image)])assert.ok(fs.statSync(new URL('../public'+url,import.meta.url)).size>100,url);
  if(entry.image.kind==='source-crop')for(const view of entry.image.views){const [x,y,r,b]=view.rect;assert.ok(r>x&&b>y&&x>=0&&y>=0&&r<=entry.image.size[0]&&b<=entry.image.size[1]);}
 }
});
test('old saves migrate; discoveries are idempotent and persist independently of playable lineage',()=>{
 const old=fresh();delete old.discoveries;const s=validate(old);assert.deepEqual(s.discoveries,[]);
 assert.equal(recordDiscovery(s,'fanweed'),true);assert.equal(recordDiscovery(s,'fanweed'),false);assert.equal(recordDiscovery(s,'elephant'),false);
 assert.equal(isDiscovered(s,catalog.find(e=>e.id==='fanweed')),true);assert.deepEqual(s.unlocked,['cell']);
 let raw;const store={setItem(k,v){raw=v;},getItem(){return raw;}};assert.ok(writeSave(store,s));assert.deepEqual(readSave(store).state.discoveries,['fanweed']);
 const branch=fresh();branch.species='worm';s.checkpoint=branch;assert.deepEqual(restoreBranch(s).discoveries,['fanweed']);
 assert.throws(()=>validate({...s,discoveries:['not-real']}));assert.throws(()=>validate({...s,discoveries:['elephant']}));
});
test('exploration requires proximity to real grown plants or habitat instances',()=>{
 const position={x:0,y:2,z:0},plant={position:[0,0,0],start:.2};
 const world={algae:{currentGrowth:0,placements:[plant],leaves:[]}};
 assert.deepEqual(nearbyDiscoveries(world,position),[]);world.algae.currentGrowth=.3;assert.deepEqual(nearbyDiscoveries(world,position),['filament']);
 assert.deepEqual(nearbyDiscoveries(world,{x:10,y:2,z:0}),[]);
 const habitat={manifest:{instances:{fanweed:[{p:[0,0,0]}],starfish:[{p:[100,0,100]}]}}};
 assert.deepEqual(nearbyDiscoveries(habitat,position),['fanweed']);
});
