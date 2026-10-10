const test = require('node:test');
const assert = require('node:assert/strict');
const {assistantText} = require('../automation_tests/model-output.cjs');

test('extracts final assistant JSON instead of reasoning or tool output', () => {
  const json = '{"actions":[],"acceptanceTests":[]}';
  assert.equal(assistantText({output:[
    {type:'reasoning', content:'Internal analysis is not the final answer'},
    {type:'tool_call', content:'not an answer'},
    {type:'message', role:'assistant', content:[{type:'output_text', text:json}]},
  ]}), json);
  for (const body of [{output:[{type:'message',content:json}]}, {output:json}, {output_text:json}, {choices:[{message:{content:json}}]}, {response:json}]) {
    assert.equal(assistantText(body), json);
  }
  assert.equal(assistantText({output:[null, 42, {role:'user',content:'ignore'}, {type:'reasoning',text:'ignore'}]}), '');
  assert.equal(assistantText({}), '');
  assert.equal(assistantText({output:{text:'visible'}}), 'visible');
});
