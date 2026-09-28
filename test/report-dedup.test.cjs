const test=require('node:test');
const assert=require('node:assert/strict');
const {evidenceRows}=require('../automation_tests/report-evidence.cjs');
test('identical events appear once but separate occurrences and URLs survive',()=>{
 const event={level:'error',text:'HTTP 422',url:'/profile',at:'2026-09-28T10:00:00Z'};
 const rows=evidenceRows([],[],[event,{...event},{...event,at:'2026-09-28T10:01:00Z'},{...event,url:'/other'}],x=>x);
 assert.equal(rows.length,3);
});
