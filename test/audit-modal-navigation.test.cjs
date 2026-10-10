const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { discoverControls, performInteraction, probeEmptySubmission, isSubmit } = require('../automation_tests/input-interactions.cjs');
const { navigate } = require('../automation_tests/audit-navigation.cjs');

test('teacher application confirms submission for approval without claiming approval granted', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<form onsubmit="event.preventDefault();this.querySelector('[role=status]').textContent='Application submitted for school approval.'"><button>Apply as teacher</button><p role="status"></p></form>`);
    const result = await performInteraction(page, (await discoverControls(page))[0], null, 500, '');
    assert.equal(result.status, 'PASS');
    assert.equal(result.detail, 'Submission confirmed by UI: Application submitted for school approval.');
  } finally { await browser.close(); }
});

test('modal discovery and stale actions respect the active dialog', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<form><input required><button type="button" onclick="document.querySelector('dialog').showModal()">Add images</button><button>Save</button></form>
      <dialog><button type="button" onclick="this.closest('dialog').close()">Close library</button></dialog>`);
    const stale = await discoverControls(page);
    const add = stale.find(c => c.label === 'Add images');
    assert.equal(isSubmit(add), false);
    assert.equal(await probeEmptySubmission(page, add, 500), null);
    await performInteraction(page, add, null, 500, '');
    const current = await discoverControls(page);
    assert.equal(current.find(c => c.label === 'Save').visible, false);
    assert.equal(current.find(c => c.label === 'Close library').visible, true);
    assert.match((await performInteraction(page, add, null, 500, '')).detail, /active modal/);
    assert.equal(await probeEmptySubmission(page, stale.find(c => c.label === 'Save'), 500), null);
    await performInteraction(page, current.find(c => c.label === 'Close library'), null, 500, '');
    assert.equal((await discoverControls(page)).find(c => c.label === 'Save').visible, true);
  } finally { await browser.close(); }
});

test('empty probes select native form submissions, not navigation or schedule actions', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<a href="/children/new">Add Child</a><form><input required><button type="button">Add weekday</button><button type="button">Add weekend</button><button>Add Child</button></form>');
    const controls = await discoverControls(page);
    assert.equal(controls.filter(isSubmit).length, 1);
    for (const c of controls.filter(c => c.tag !== 'input' && !isSubmit(c)))
      assert.equal(await probeEmptySubmission(page, c, 100), null);
    assert.match((await probeEmptySubmission(page, controls.find(isSubmit), 500)).detail, /browser blocked/);
  } finally { await browser.close(); }
});

test('submissions navigating or reloading are attempted once and never inferred saved', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const target of ['/done', '/form']) {
      const page = await browser.newPage();
      let submissions = 0;
      await page.route('http://fixture.test/**', route => {
        if (route.request().method() === 'POST') submissions++;
        return route.fulfill({ contentType: 'text/html', body: `<form method="post" action="${target}"><button>Add Child</button></form>` });
      });
      await page.goto('http://fixture.test/form');
      const [button] = await discoverControls(page);
      const result = await performInteraction(page, button, null, 1000, '');
      assert.ok(['PASS', 'WARN'].includes(result.status), result.detail);
      assert.match(result.detail, /no data submission inferred|outcome not verified|no explicit success/);
      assert.equal(submissions, 1);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('navigation budget tolerates a delayed document but still fails at its explicit deadline', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://fixture.test/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 120));
      await route.fulfill({ contentType: 'text/html', body: '<main><h1>Identity</h1></main>' }).catch(() => {});
    });
    assert.deepEqual(await navigate(page, 'http://fixture.test/identity', 1000), { kind: 'page' });
    assert.equal(await page.locator('main h1').textContent(), 'Identity');
    await assert.rejects(navigate(page, 'http://fixture.test/slow', 30), /Timeout/);
    assert.equal(page.listenerCount('download'), 0);
  } finally { await browser.close(); }
});

test('context loss during feedback remains unverified; unrelated evaluation errors still fail', async () => {
  for (const message of ['Execution context was destroyed, most likely because of a navigation', 'Feedback implementation failed']) {
    let evaluations = 0, clicks = 0, disposed = false;
    const scope = {
      async evaluate() { if (++evaluations > 1) throw new Error(message); return []; },
      async dispose() { disposed = true; },
    };
    const el = {
      first() { return this; },
      async count() { return 1; },
      async isVisible() { return true; },
      async evaluate() { return false; },
      async evaluateHandle() { return scope; },
      async scrollIntoViewIfNeeded() {},
      async click() { clicks++; },
      locator() { return { locator() { return { async count() { return 0; } }; } }; },
    };
    const page = {
      locator(selector) { return selector.includes('role=menu') ? { async count() { return 0; } } : el; },
      url() { return 'http://fixture.test/form'; },
      isClosed() { return false; },
    };
    const action = performInteraction(page, { tag: 'button', type: 'submit', selector: '#submit' }, null, 500, '');
    if (message.startsWith('Execution')) {
      const result = await action;
      assert.equal(result.status, 'WARN');
      assert.match(result.detail, /attempted once, outcome not verified/);
    } else await assert.rejects(action, /Feedback implementation failed/);
    assert.equal(clicks, 1);
    assert.equal(disposed, true);
  }
});
