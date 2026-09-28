const test=require('node:test');
const assert=require('node:assert/strict');
const {fullTime,applyFullTime}=require('../scripts/demo-screen-time.cjs');
test('all-day demo policy disables bedtime and school blocks',()=>{
  assert.equal(fullTime.bedtimeStart,fullTime.bedtimeEnd);
  assert.equal(fullTime.schoolTimeBlock,false);
  assert.deepEqual(fullTime.exceptions,[{type:'FAMILY',start:'00:00',end:'23:59'}]);
});
test('only exact configured child account is updated',async()=>{
  const calls=[];
  const client={async query(sql,args){calls.push({sql,args});return {rows:[{id:'policy'}]};}};
  assert.deepEqual(await applyFullTime(client,[{id:'child',email:'child@example.test',role:'CHILD'}],['child@example.test']),['child']);
  assert.equal(calls[0].args[0],'child');
  assert.equal(calls.length,3);
  await assert.rejects(applyFullTime(client,[],['unknown@example.test']));
});
