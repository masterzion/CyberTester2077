const test=require('node:test');
const assert=require('node:assert/strict');
const {designFindings}=require('../automation_tests/design-findings.cjs');
test('design categories preserve evidence and stay separate from errors',()=>{
 const item={category:'broken design',component:'Goals',evidence:'Title overlaps progress',suggestion:'Wrap the title'};
 const observations=[{url:'/goals',at:'2026-09-28T10:00:00Z',screenshot:'goal.png',plan:{designFindings:[item,item,{...item,category:'design improvement',evidence:'Progress could be easier to scan'},{...item,category:'error'},{category:'broken design'}]}}];
 const rows=designFindings(observations,x=>x);
 assert.equal(rows.length,2);
 assert.equal(rows[0].screenshot,'goal.png');
 assert.equal(rows[0].url,'/goals');
 assert.ok(rows.every(x=>!x.status));
 assert.deepEqual(designFindings([{plan:{risks:['legacy risk']}}],x=>x),[]);
});
