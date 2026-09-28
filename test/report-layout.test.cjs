const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
test('overview comes first and design narrative lives inside the two design sections',async()=>{
 const template=fs.readFileSync(path.join(__dirname,'../automation_tests/report-template.html'),'utf8');
 const meta={account:'Fixture',role:'parent',platform:'mobile',timezone:'Europe/Riga',errors:[],designReviewed:true,designNarrative:{'broken design':'Layout defects summary','design improvement':'Optional refinements summary'},design:[{category:'broken design',component:'Goals',evidence:'Text overlaps progress',suggestion:'Wrap text',url:'/goals',at:'2026-09-28T10:00:00Z'}]};
 const values={SUMMARY_JSON:JSON.stringify({pages:1}),ROWS_JSON:'[]',MODELS_JSON:'[]',META_JSON:JSON.stringify(meta)};
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(template.replace(/{{([A-Z_]+)}}/g,(_,key)=>values[key]||''));
  assert.deepEqual(await page.locator('main > section').evaluateAll(nodes=>nodes.slice(0,4).map(n=>n.id)),['overview','evidence','broken-design','design-improvement']);
  assert.equal(await page.locator('#overview #narrative').count(),0);
  assert.equal(await page.locator('#broken-design .design-summary').innerText(),'Layout defects summary');
  assert.match(await page.locator('#broken-design').innerText(),/Wrap text/);
  assert.equal(await page.locator('#design-improvement .design-summary').innerText(),'Optional refinements summary');
  await page.setViewportSize({width:360,height:800});
  assert.equal(await page.locator('#broken-items').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),1);
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
