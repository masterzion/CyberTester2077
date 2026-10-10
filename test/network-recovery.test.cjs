const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { attachNetworkEvidence } = require('../automation_tests/network-evidence.cjs');

test('real browser records an offline request and resumes without hiding the failure', async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ available: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);
    const evidence = [];
    attachNetworkEvidence(page, (...event) => evidence.push(event));
    await context.setOffline(true);
    const failed = page.waitForEvent('requestfailed');
    assert.equal(await page.evaluate(async () => {
      try { await fetch('/health?token=private-fixture'); return false; }
      catch { return true; }
    }), true);
    await failed;
    assert.equal(evidence.length, 1);
    assert.match(evidence[0][1], /^net::ERR_INTERNET_DISCONNECTED GET /);
    assert.ok(evidence[0][1].endsWith('/health'));
    assert.ok(!JSON.stringify(evidence).includes('private-fixture'));
    await context.setOffline(false);
    assert.deepEqual(await page.evaluate(async () => (await fetch('/health')).json()), { available: true });
    assert.equal(evidence.length, 1, 'recovery must not erase the earlier failure');
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
