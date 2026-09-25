const test = require('node:test');
const assert = require('node:assert/strict');
const {matchCurrentControl} = require('../automation_tests/child-interface-audit.cjs');
test('rebinds a rerendered component to its current selector, not its old index', () => {
  const old = {tag:'button',label:'Open activities',id:'control-2',selector:'#old'};
  const current = {...old,id:'control-8',selector:'#fresh',visible:true,disabled:false};
  assert.equal(matchCurrentControl(old,[{...current,label:'Unrelated'},current]).selector,'#fresh');
});
test('does not guess when the component is absent, disabled or ambiguous', () => {
  const old={tag:'button',label:'Open activities'};
  const current={...old,visible:true,disabled:false};
  assert.equal(matchCurrentControl(old,[]),null);
  assert.equal(matchCurrentControl(old,[{...current,disabled:true}]),null);
  assert.equal(matchCurrentControl(old,[current,{...current}]),null);
});
