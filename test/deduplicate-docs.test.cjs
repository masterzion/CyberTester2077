const test=require('node:test');
const assert=require('node:assert/strict');
const {applyDuplicates}=require('../deduplicate-docs.cjs');
test('verified model deduplication removes repetition but preserves distinct numbers and commands',()=>{
  const text='# Configuration\n\nRun npm start on port 3000.\n\nRun npm start on port 3000.\n\nRun npm start on port 4000.';
  const result=applyDuplicates(text,{duplicates:[{remove:2,keep:1},{remove:3,keep:1}]});
  assert.equal(result.removed,1);
  assert.match(result.text,/port 4000/);
  assert.equal(result.skipped.length,1);
});
test('malformed plans fail without modifying source text',()=>{
  assert.throws(()=>applyDuplicates('Unique information.',{}),/duplicates array/);
});
