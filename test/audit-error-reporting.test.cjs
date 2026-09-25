const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {discoverControls,exclusion}=require('../automation_tests/input-interactions.cjs');
const {inspectErrorOverlay,dismissErrorOverlay}=require('../automation_tests/error-overlay.cjs');
const {evidenceRows}=require('../automation_tests/report-evidence.cjs');

test('discovery does not mutate React DOM; shadow-root error controls are excluded and dismissed',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent('<button>Publish</button><nextjs-portal></nextjs-portal>');
    await page.locator('nextjs-portal').evaluate(node=>{
      const shadow=node.attachShadow({mode:'open'});
      shadow.innerHTML='<div role="dialog" data-nextjs-dialog>Console Error: hydration mismatch<button>Copy Error Info</button><button>Close</button></div>';
      shadow.querySelectorAll('button')[1].onclick=()=>shadow.querySelector('[role=dialog]').remove();
    });
    const before=await page.content();
    const controls=await discoverControls(page);
    assert.equal(await page.content(),before);
    assert.ok(exclusion(controls.find(c=>c.label==='Copy Error Info')));
    assert.equal(await page.locator(controls[0].selector).innerText(),'Publish');
    assert.match((await inspectErrorOverlay(page)).text,/hydration/);
    assert.equal(await dismissErrorOverlay(page),true);
    assert.equal(await inspectErrorOverlay(page),null);
  } finally {await browser.close();}
});

test('evidence includes browser failures, timestamps and historical overlay corrections',()=>{
  const at='2026-09-25T16:25:31.000Z';
  const rows=evidenceRows([{control:{label:'Copy Error Info'},result:{status:'PASS'},screenshot:'screenshots/1790355477166-interaction.png'}],[{name:'Browser error',extra:{consoleEvent:true},at,status:'FAIL'}],[{level:'error',text:'HTTP 502',url:'http://localhost/social',at}],s=>s);
  assert.equal(rows.length,2);
  assert.equal(rows[0].status,'INFO');
  assert.ok(rows[0].at);
  assert.equal(rows[1].status,'FAIL');
  assert.equal(rows[1].at,at);
  assert.equal(rows[1].detail,'HTTP 502');
});
