const test=require('node:test');
const assert=require('node:assert/strict');
const {applyDuplicates}=require('../deduplicate-docs.cjs');

test('accepts complete deduplicated Markdown including code and tables',()=>{
  const output='# Configuration\n\nRun on port 3000.\n\n```sh\nnpm start\n```\n\n| Port |\n| --- |\n| 4000 |\n';
  const result=applyDuplicates(output+'\nRun on port 3000.',output);
  assert.equal(result.text,output);
  assert.equal(result.changed,true);
  assert.equal(applyDuplicates(output,output).changed,false);
});
test('rejects empty, old-protocol, and explicitly truncated responses',()=>{
  assert.throws(()=>applyDuplicates('Original',' '),/no document content/);
  assert.throws(()=>applyDuplicates('Original','{"duplicates":[]}'),/returned JSON/);
  assert.throws(()=>applyDuplicates('Original','# Partial','length'),/truncated/);
});
