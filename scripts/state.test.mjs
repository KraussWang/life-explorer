import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,available,evolve,restoreBranch,validate,readSave,writeSave,SCALLOP_ENTRY_POSITION} from '../src/state.js';
function collect(s,type,n){s.counts[type]=n;for(let i=0;i<n;i++)s.collected.push(type+'-'+i);}
test('complete chain requires resources and environmental contact, retains all branches',()=>{
 let s=fresh();assert.equal(available(s),false);assert.throws(()=>evolve(s,'flagellate'));
 collect(s,'nutrient',3);s=evolve(s,'flagellate');assert.equal(available(s),false);
 collect(s,'nutrient',2);assert.equal(available(s),false);s.cold='active';assert.equal(available(s),false);s.gathered=true;
 s=evolve(s,'colony');assert.equal(s.cold,'resolved');assert.equal(available(s),false);
 collect(s,'food',1);collect(s,'specialization',2);s=evolve(s,'worm');assert.equal(s.checkpoint.species,'worm');
 for(const id of ['bivalve','slug','fish']){s=evolve(s,id);assert.equal(available(s),false);s=validate(JSON.parse(JSON.stringify(s)));s=restoreBranch(s);assert.equal(s.species,'worm');assert.ok(s.unlocked.includes(id));}
 assert.equal(s.unlocked.length,7);
});
test('scallop coordinates migrate without losing checkpoint or discoveries',()=>{
 let s=fresh();collect(s,'nutrient',3);s=evolve(s,'flagellate');collect(s,'nutrient',2);s.cold='resolved';s.gathered=true;
 s=evolve(s,'colony');collect(s,'food',1);collect(s,'specialization',2);s=evolve(s,'worm');
 s=evolve(s,'bivalve');assert.equal(s.positionSpace,'scallop');assert.deepEqual(s.position,SCALLOP_ENTRY_POSITION);
 const legacy=structuredClone(s);delete legacy.positionSpace;legacy.position=[34,8,-20];legacy.origin=[34,8,-20];
 const migrated=validate(legacy);assert.equal(migrated.positionSpace,'scallop');assert.deepEqual(migrated.position,SCALLOP_ENTRY_POSITION);
 assert.equal(migrated.checkpoint.species,'worm');assert.ok(migrated.unlocked.includes('bivalve'));
 const current=validate({...s,position:[2,2,-4]});assert.deepEqual(current.position,[2,2,-4]);
 assert.equal(restoreBranch(current).positionSpace,'primordial');
});
test('reject damaged saves that would hide all remaining resources',()=>{
 const s=fresh();s.collected=['nutrient-0','nutrient-1','nutrient-2'];assert.throws(()=>validate(s));s.counts.nutrient=3;assert.doesNotThrow(()=>validate(s));s.collected.push('food-0');assert.throws(()=>validate(s));
});
test('reject inherited IDs, unknown versions, invalid positions and checkpoints',()=>{
 for(const id of ['constructor','toString','__proto__','unknown'])assert.throws(()=>validate({...fresh(),species:id}));
 assert.throws(()=>validate({...fresh(),unlocked:['constructor']}));assert.throws(()=>validate({...fresh(),version:99}));assert.throws(()=>validate({...fresh(),position:[NaN,0,0]}));assert.throws(()=>validate({...fresh(),checkpoint:fresh()}));
});
test('storage unavailable and broken JSON are recoverable',()=>{
 assert.equal(writeSave(null,fresh()),false);assert.ok(readSave(null).error);assert.ok(readSave({getItem:()=>'{broken'}).error);assert.equal(readSave({getItem:()=>null}).state,null);
});
