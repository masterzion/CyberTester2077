'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readDesignState, contentIdentity, captureDesignEvidence} = require('../automation_tests/design-evidence.cjs');
const {completeAudit} = require('../automation_tests/audit-outcome.cjs');

test('design state reads designated content, not global or child background busy indicators', async () => {
  const {chromium} = require('playwright');
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<header data-session-state="restoring">Session</header><main><h1>Public information</h1><span aria-busy="true">Polling</span></main>');
    assert.equal(await readDesignState(page), 'ready');
    await page.locator('main').evaluate(root => {const status = document.createElement('p');status.dataset.designLoading = 'true';status.textContent = 'Loading children';root.append(status);});
    assert.equal(await readDesignState(page), 'restoring');
    await page.locator('[data-design-loading]').evaluate(node => node.hidden = true);
    assert.equal(await readDesignState(page), 'ready');
    await page.locator('[data-design-loading]').evaluate(node => node.remove());
    const identity = await contentIdentity(page);
    await page.locator('span').evaluate(node => node.textContent = 'Updated polling');
    await page.evaluate(() => {const script = document.createElement('script');script.type='application/json';script.textContent='{"hydration":2}';document.querySelector('main').append(script);});
    assert.equal(await contentIdentity(page), identity);
    await page.locator('main').evaluate(root => root.setAttribute('aria-busy', 'true'));
    assert.equal(await readDesignState(page), 'restoring');
    await page.locator('main').evaluate(root => root.setAttribute('data-session-state', 'unavailable'));
    assert.equal(await readDesignState(page), 'unavailable');
    await page.locator('main').evaluate(root => {root.removeAttribute('aria-busy');root.setAttribute('data-session-state', 'restoring');});
    assert.equal(await readDesignState(page), 'restoring');
    await page.locator('main').evaluate(root => root.removeAttribute('data-session-state'));
    assert.equal(await readDesignState(page), 'ready');
  } finally {await browser.close();}
});

function fixture(states, documents = ['settled']) {
  let reads = 0, htmlReads = 0;
  return {
    evaluate: async callback => {
      if(callback.name === '' && callback.toString().includes('performance.timeOrigin')) return documents[Math.min(htmlReads++,documents.length-1)];
      const state = states[Math.min(reads++,states.length-1)]; if(state instanceof Error) throw state; return state;
    },
    content: async () => documents[Math.min(htmlReads,documents.length-1)],
    locator: () => ({innerText:async () => 'Settled text'}),
    title:async () => 'Title', url:() => 'https://example.test/info',
    isClosed:() => false, waitForTimeout:async ms => new Promise(resolve => setTimeout(resolve,ms))
  };
}
const options = {timeoutMs:1000,discover:async () => [{id:'settled-control'}],screenshot:async () => 'image.png'};

test('restoration and context replacement settle before any evidence is captured', async () => {
  const page = fixture([new Error('Execution context was destroyed'),'restoring','ready']);
  let captures = 0;
  const result = await captureDesignEvidence(page,{...options,screenshot:async () => {captures++;return 'image.png';}});
  assert.equal(result.status,'ready');
  assert.equal(captures,1);
  assert.equal(result.evidence.html,'settled');
  assert.equal(result.evidence.text,'Settled text');
  assert.deepEqual(result.evidence.controls,[{id:'settled-control'}]);
});

test('unresolved restoration is incomplete without model evidence, unavailable is failure', async () => {
  const forbidden = async () => {throw new Error('Must not capture unsettled evidence');};
  const pending = await captureDesignEvidence(fixture(['restoring']),{timeoutMs:10,discover:forbidden,screenshot:forbidden});
  assert.equal(pending.status,'incomplete');
  assert.equal(pending.evidence,undefined);
  const target = {};
  assert.equal(completeAudit([{name:'Design evidence readiness',status:'WARN',extra:{outcomeVerified:false}}],target),'incomplete');
  assert.equal(target.exitCode,1);
  const failed = await captureDesignEvidence(fixture(['unavailable']),{...options,discover:forbidden,screenshot:forbidden});
  assert.equal(failed.status,'failed');
});

test('changed DOM is recaptured and terminal errors during capture cannot become success', async () => {
  let captures = 0;
  const result = await captureDesignEvidence(fixture(['ready'],['old','new','new','new']),{...options,screenshot:async () => `image-${++captures}.png`});
  assert.equal(result.evidence.html,'new');
  assert.equal(result.evidence.screenshot,'image-2.png');
  assert.equal((await captureDesignEvidence(fixture(['ready','unavailable']),options)).status,'failed');
  await assert.rejects(captureDesignEvidence({...fixture(['ready']),content:async () => {throw new Error('Real runtime error');}},options),/Real runtime error/);
});

test('hung discovery is bounded and navigation forces recapture', async () => {
  assert.equal((await captureDesignEvidence(fixture(['ready']),{...options,timeoutMs:10,discover:() => new Promise(() => {})})).status,'incomplete');
  const page = fixture(['ready']);
  let url = 'https://example.test/old', captures = 0;
  page.url = () => url;
  const result = await captureDesignEvidence(page,{...options,screenshot:async () => {captures++;url='https://example.test/new';return 'image.png';}});
  assert.equal(captures,2);
  assert.equal(result.evidence.url,'https://example.test/new');
});
