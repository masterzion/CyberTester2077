const test=require('node:test');
const assert=require('node:assert/strict');
const {attachNetworkEvidence}=require('../automation_tests/network-evidence.cjs');
test('optional DEV fixture absence is informational, while enrollment errors remain failures',()=>{
 const listeners={}; const events=[];
 attachNetworkEvidence({on:(name,fn)=>listeners[name]=fn,url:()=>'/messages'},(...args)=>events.push(args));
 const response=(status,path,method='GET')=>({status:()=>status,url:()=>`https://example.test/api/gateway/messages/${path}`,request:()=>({method:()=>method})});
 listeners.response(response(404,'dev-device'));
 listeners.response(response(503,'dev-device'));
 listeners.response(response(400,'device-keys','POST'));
 assert.deepEqual(events.map(event=>event[0]),['info','error','error']);
});
test('failed responses retain endpoint and method but never signed queries or payloads',()=>{
 let listener; const events=[];
 attachNetworkEvidence({on:(_,fn)=>listener=fn,url:()=>'/parent/profile'},(...args)=>events.push(args));
 listener({status:()=>422,url:()=> 'https://example.test/profiles/me?token=secret',request:()=>({method:()=> 'PUT'})});
 assert.deepEqual(events,[['error','HTTP 422 PUT https://example.test/profiles/me','/parent/profile']]);
});

test('suspended network failures retain a safe endpoint and never become passes',()=>{
 const listeners={}; const events=[];
 attachNetworkEvidence({on:(name,fn)=>listeners[name]=fn,url:()=>'/child/home'},(...args)=>events.push(args));
 const request=errorText=>({failure:()=>({errorText}),url:()=> 'https://example.test/api?token=secret',method:()=> 'GET'});
 listeners.requestfailed(request('net::ERR_NETWORK_IO_SUSPENDED'));
 listeners.requestfailed(request('unexpected error containing secret'));
 listeners.requestfailed(request('net::ERR_ABORTED'));
 assert.deepEqual(events,[
  ['error','net::ERR_NETWORK_IO_SUSPENDED GET https://example.test/api','/child/home'],
  ['error','NETWORK_REQUEST_FAILED GET https://example.test/api','/child/home'],
 ]);
});
