const test=require('node:test');
const assert=require('node:assert/strict');
const {attachNetworkEvidence}=require('../automation_tests/network-evidence.cjs');
test('failed responses retain endpoint and method but never signed queries or payloads',()=>{
 let listener; const events=[];
 attachNetworkEvidence({on:(_,fn)=>listener=fn,url:()=>'/parent/profile'},(...args)=>events.push(args));
 listener({status:()=>422,url:()=> 'https://example.test/profiles/me?token=secret',request:()=>({method:()=> 'PUT'})});
 assert.deepEqual(events,[['error','HTTP 422 PUT https://example.test/profiles/me','/parent/profile']]);
});
