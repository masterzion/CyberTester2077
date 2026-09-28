const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {discoverControls,performInteraction}=require('../automation_tests/input-interactions.cjs');
test('save waits for its own result, not an asynchronous upload rejection',async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent(`<form onsubmit="event.preventDefault(); const b=this.querySelector('button');b.disabled=true;b.textContent='Saving...';document.querySelector('#upload').textContent='Upload failed';setTimeout(()=>{b.disabled=false;b.textContent='Save';document.querySelector('#saved').textContent='Profile saved.'},200)">
  <section data-interaction-region="media-upload"><p role="alert" id="upload"></p></section>
  <button type="submit">Save</button><p role="status" id="saved"></p></form>`);
  const c=(await discoverControls(page)).find(c=>c.type==='submit');
  const result=await performInteraction(page,c,null,1000,'');
  assert.equal(result.status,'PASS');assert.match(result.detail,/Profile saved/);assert.doesNotMatch(result.detail,/Upload/);
 } finally {await browser.close();}
});
