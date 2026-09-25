const test=require('node:test');
const assert=require('node:assert/strict');
const {replaceReport}=require('../automation_tests/report-file-writer.cjs');

test('retries transient Windows locks with unique temporary files',async()=>{
  const temporary=[],delays=[];
  let attempts=0;
  const io={
    async writeFile(file,html,options){temporary.push(file);assert.equal(options.flag,'wx');},
    async rename(from,to){assert.equal(to,'report.html');if(++attempts<3)throw Object.assign(new Error('locked'),{code:'EPERM'});},
    async unlink(file){assert.ok(temporary.includes(file));}
  };
  await replaceReport('report.html','first',io,async ms=>delays.push(ms));
  await replaceReport('report.html','second',io,async ms=>delays.push(ms));
  assert.deepEqual(delays,[50,100]);
  assert.notEqual(temporary[0],temporary[1]);
});

test('persistent lock fails after bounded retries without deleting report',async()=>{
  let attempts=0;
  const removed=[];
  await assert.rejects(replaceReport('report.html','new',{
    async writeFile(){},
    async rename(){attempts++;throw Object.assign(new Error('locked'),{code:'EBUSY'});},
    async unlink(file){removed.push(file);}
  },async()=>{}),/locked/);
  assert.equal(attempts,7);
  assert.equal(removed.length,1);
  assert.notEqual(removed[0],'report.html');
});

test('non-transient errors are not retried',async()=>{
  await assert.rejects(replaceReport('report.html','new',{
    async writeFile(){},
    async rename(){throw Object.assign(new Error('disk failure'),{code:'EIO'});},
    async unlink(){}
  },async()=>assert.fail('unexpected retry')),/disk failure/);
});
