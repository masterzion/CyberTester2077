const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {exclusion,inputValue,priority,discoverControls,performInteraction,probeEmptySubmission}=require('../automation_tests/input-interactions.cjs');

test('language controls and scope changes are blocked; inputs precede submission',()=>{
  assert.ok(exclusion({tag:'button',label:'Language: English'}));
  assert.ok(exclusion({tag:'select',label:'Feed',options:[{text:'My posts'},{text:'Child supervised feed'}]}));
  assert.ok(priority({tag:'textarea'})<priority({tag:'button',label:'Send'}));
  assert.equal(inputValue({type:'number',min:'3'},undefined,'QA'),'3');
  assert.equal(inputValue({type:'date',min:'2026-10-01'},undefined,'QA'),'2026-10-01');
});

test('browser fixtures: close overlay, fill, upload, send, verify, and respect observe',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    page.setDefaultTimeout(1500);
    await page.setContent(`<form onsubmit="event.preventDefault(); document.querySelector('[role=status]').textContent='Message sent successfully'; this.reset()">
      <button type="button" aria-label="Language: English">English</button>
      <textarea placeholder="Message" required></textarea>
      <input type="file" accept="image/*" hidden>
      <button type="submit">Send</button>
      </form><div role="status"></div><div role="menu" style="position:fixed;inset:0;background:white">Open menu</div>
      <script>document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('[role=menu]').remove()})</script>`);
    let controls=await discoverControls(page);
    assert.equal((await performInteraction(page,controls[0],null,1500,'QA TEST')).status,'SKIP');
    const textarea=controls.find(c=>c.tag==='textarea');
    await performInteraction(page,textarea,null,1500,'QA TEST message');
    assert.equal(await page.locator('[role=menu]').count(),0);
    assert.equal(await page.locator('textarea').inputValue(),'QA TEST message');
    controls=await discoverControls(page);
    const file=controls.find(c=>c.type==='file');
    assert.equal((await performInteraction(page,file,null,1500,'QA')).status,'PASS');
    assert.equal(await page.locator('input[type=file]').evaluate(n=>n.files[0].type),'image/png');
    const submit=controls.find(c=>c.type==='submit');
    assert.equal((await performInteraction(page,submit,null,1500,'QA')).status,'PASS');
    assert.equal(await page.locator('textarea').inputValue(),'');
    assert.equal((await performInteraction(page,submit,{action:'observe'},1500,'QA')).status,'SKIP');
    assert.equal((await performInteraction(page,submit,null,1500,'QA')).status,'WARN');
  } finally {await browser.close();}
});

test('browser fixtures: application rejection is not reported as success',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent(`<button onclick="document.querySelector('[role=alert]').textContent='Error: message denied'">Send</button><div role="alert"></div>`);
    const controls=await discoverControls(page);
    assert.equal((await performInteraction(page,controls[0],null,1000,'QA')).status,'FAIL');
  } finally {await browser.close();}
});

test('browser fixtures: rich text, date, checkbox, select, and unconfirmed save',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent('<div contenteditable="true" aria-label="Compose"></div><input type="date"><input type="checkbox"><select><option value="">Choose</option><option value="one">One</option></select><button>Save</button>');
    for(const c of await discoverControls(page)) {
      const result=await performInteraction(page,c,null,150,'QA TEST');
      assert.equal(result.status,c.tag==='button'?'WARN':'PASS');
    }
    assert.equal(await page.locator('[contenteditable]').innerText(),'QA TEST');
    assert.ok(await page.locator('input[type=date]').inputValue());
    assert.equal(await page.locator('input[type=checkbox]').isChecked(),true);
    assert.equal(await page.locator('select').inputValue(),'one');
  } finally {await browser.close();}
});

test('empty and populated scenarios validate required fields without deleting drafts',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent(`<form onsubmit="event.preventDefault();document.querySelector('[role=status]').textContent='Post saved successfully'">
      <textarea required placeholder="Post"></textarea><button type="submit">Post</button></form><div role="status"></div>`);
    let controls=await discoverControls(page);
    let button=controls.find(c=>c.type==='submit');
    const empty=await probeEmptySubmission(page,button,500);
    assert.equal(empty.status,'PASS');
    assert.match(empty.detail,/browser blocked/);
    await performInteraction(page,controls[0],null,500,'QA TEST post');
    assert.equal(await probeEmptySubmission(page,button,500),null);
    assert.equal(await page.locator('textarea').inputValue(),'QA TEST post');
    assert.equal((await performInteraction(page,button,null,500,'QA')).status,'PASS');
    await page.setContent('<form><textarea></textarea><button disabled>Send</button></form>');
    controls=await discoverControls(page);
    assert.match((await probeEmptySubmission(page,controls[1],500)).detail,/disabled/);
    await page.setContent(`<form novalidate onsubmit="event.preventDefault();document.querySelector('[role=status]').textContent='Post saved successfully'"><textarea required></textarea><button type="submit">Post</button></form><div role="status"></div>`);
    controls=await discoverControls(page);
    assert.equal((await probeEmptySubmission(page,controls[1],500)).status,'FAIL');
  } finally {await browser.close();}
});
