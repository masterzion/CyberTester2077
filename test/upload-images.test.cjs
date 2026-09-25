const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const {uploadConfig,selectImages}=require('../automation_tests/upload-images.cjs');
const {discoverControls,performInteraction}=require('../automation_tests/input-interactions.cjs');

test('upload configuration validates count and resolves paths relative to repository',()=>{
  assert.deepEqual(uploadConfig({upload_images:{folder:'images',count:2}},__dirname),{folder:path.join(__dirname,'images'),count:2});
  for(const count of [0,-1,1.5,'3',null]) {
    if(count!==null) assert.throws(()=>uploadConfig({upload_images:{count}},__dirname),/positive integer/);
  }
});

test('selects distinct compatible images and respects single-file limits',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'audit-upload-test-'));
  let browser;
  try {
    for(const name of ['a.svg','b.svg','c.svg','d.svg']) fs.writeFileSync(path.join(folder,name),'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    fs.writeFileSync(path.join(folder,'ignore.txt'),'not an image');
    const config={folder,count:3};
    const first=selectImages(config,'image/*',true,()=>0);
    const last=selectImages(config,'image/*',true,n=>n-1);
    assert.equal(first.files.length,3);
    assert.equal(new Set(first.files).size,3);
    assert.notDeepEqual(first.files,last.files);
    assert.equal(selectImages(config,'.png',true).files.length,0);
    assert.equal(selectImages(config,'.svg',false).files.length,1);
    assert.equal(selectImages({folder,count:8},'',true).files.length,4);
    assert.throws(()=>selectImages({folder:path.join(folder,'missing'),count:3}),/ENOENT/);
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();
    await page.setContent('<input type="file" accept="image/*" multiple>');
    const control=(await discoverControls(page))[0];
    const result=await performInteraction(page,control,null,1500,'QA',config);
    assert.equal(result.status,'PASS');
    assert.equal(result.uploadedFiles.length,3);
    assert.equal(await page.locator('input').evaluate(n=>n.files.length),3);
    await page.locator('input').evaluate(n=>n.multiple=false);
    assert.equal((await performInteraction(page,control,null,1500,'QA',config)).status,'WARN');
    assert.equal(await page.locator('input').evaluate(n=>n.files.length),1);
  } finally {
    if(browser) await browser.close();
    fs.rmSync(folder,{recursive:true,force:true});
  }
});
