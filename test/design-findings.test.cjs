const test=require('node:test');
const assert=require('node:assert/strict');
const {designFindings}=require('../automation_tests/design-findings.cjs');
test('identical shared findings consolidate routes but retain different corrections',()=>{
 const item={category:'design improvement',component:'Navigation',evidence:'Spacing is tight',suggestion:'Increase spacing'};
 const observations=['/home','/settings'].map(url=>({url,screenshot:url+'.png',plan:{designFindings:[item]}}));
 observations.push({url:'/profile',screenshot:'profile.png',plan:{designFindings:[{...item,suggestion:'Wrap labels'}]}});
 const rows=designFindings(observations,x=>x);
 assert.equal(rows.length,2);
 assert.deepEqual(rows[0].occurrences.map(entry=>entry.url),['/home','/settings']);
 assert.equal(rows[0].occurrences[1].screenshot,'/settings.png');
 assert.equal(rows[1].suggestion,'Wrap labels');
});
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
