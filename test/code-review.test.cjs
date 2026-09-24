const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createReader,reviewDocument}=require('../code-review-docs.cjs');
test('read-only code tools recurse, constrain paths, and validate review citations',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'code-review-'));
  fs.mkdirSync(path.join(root,'nested'));
  const file=path.join(root,'nested','handler.ts');
  fs.writeFileSync(file,'export function approve() { return true; }\n');
  fs.writeFileSync(path.join(root,'.env'),'SECRET=hidden');
  const reader=createReader([root]);
  assert.deepEqual(reader.execute({op:'find',query:'handler'}).matches,['0/nested/handler.ts']);
  assert.equal(reader.execute({op:'grep',query:'approve'}).lines[0].line,1);
  assert.throws(()=>reader.execute({op:'read',file:'../outside.ts'}),/Unknown/);
  assert.throws(()=>reader.execute({op:'exec',query:'anything'}),/Only/);
  assert.equal(reader.execute({op:'find',query:'.env'}).total,0);
  let round=0;
  const findings=await reviewDocument({name:'done.md',purpose:'Done',text:'Approval exists'},reader,async()=>({plan:round++===0?
    {requests:[{op:'read',file:'0/nested/handler.ts',start:1,end:1}]}:
    {findings:[{status:'implemented',claim:'Approval',detail:'Function exists',evidence:[{file:'0/nested/handler.ts',line:1}]},{status:'implemented',claim:'Unseen',evidence:[{file:'0/nested/handler.ts',line:99}]}]}}));
  assert.equal(findings[0].status,'implemented');
  assert.equal(findings[1].status,'unverified');
  assert.equal(fs.readFileSync(file,'utf8'),'export function approve() { return true; }\n');
});
