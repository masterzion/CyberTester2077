const test=require('node:test');
const assert=require('node:assert/strict');
const {protectedField,needsText,generateText}=require('../automation_tests/contextual-text.cjs');
test('protect identity and password inputs but allow message text',()=>{
  for(const field of [{name:'childName'},{label:'First name'},{name:'password',type:'text'},{autocomplete:'new-password'},{type:'password'},{label:'Name'}]) assert.ok(protectedField(field));
  assert.equal(protectedField({label:'Message'}),false);
  assert.ok(needsText({tag:'textarea'}));
  assert.equal(needsText({tag:'input',type:'date'}),false);
});
test('generation carries role description, page and field purpose, without credentials',async()=>{
  const context={account:{role:'parent',description:'Supervises learning and family activities'},page:{url:'/parent/social',text:'Weekend activities'},field:{tag:'textarea',label:'Share a post'}};
  const result=await generateText(context,async payload=>{
    assert.deepEqual(JSON.parse(payload.input),context);
    assert.match(payload.system_prompt,/Never invent or change children's names/);
    return {output:[{type:'reasoning',content:'internal analysis'},{type:'message',content:'{"value":"Does anyone have a favourite outdoor learning activity for the weekend?"}'}]};
  });
  assert.match(result.value,/outdoor learning/);
});
test('never falls back to generic QA text or fills protected fields',async()=>{
  for(const content of ['not JSON','{"value":"QA TEST 123"}','{"value":"automated test content"}','{"skip":true,"reason":"insufficient context"}']) {
    assert.equal((await generateText({field:{tag:'textarea'}},async()=>({response:content}))).skip,true);
  }
  assert.equal((await generateText({field:{name:'childName'}},async()=>assert.fail('must not call model'))).skip,true);
});
