const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {navigate} = require('../automation_tests/audit-navigation.cjs');

test('cancelled and stalled downloads fail verification instead of passing or hanging', {timeout:15000}, async () => {
  const http = require('node:http');
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {'content-disposition':'attachment; filename="app.apk"','content-type':'application/octet-stream'});
    response.write('incomplete fixture');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({acceptDownloads:true});
    page.once('download', item => { void item.cancel(); });
    await assert.rejects(navigate(page, `http://127.0.0.1:${server.address().port}/`, 3000), /Download failed/);
    await assert.rejects(navigate(page, `http://127.0.0.1:${server.address().port}/`, 1000), /Download completion timed out/);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('crawler verifies downloads separately from HTML and rejects HTTP errors', async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({acceptDownloads:true});
    await page.route('http://fixture.test/**', route => {
      const url = new URL(route.request().url());
      return route.fulfill(url.pathname === '/download' ? {
        status:200, headers:{'content-disposition':'attachment; filename="app.apk"'},
        contentType:'application/octet-stream', body:'download regression fixture',
      } : {status:url.pathname === '/unavailable' ? 503 : 200, contentType:'text/html', body:'<h1>Fixture</h1>'});
    });
    assert.deepEqual(await navigate(page, 'http://fixture.test/'), {kind:'page'});
    assert.deepEqual(await navigate(page, 'http://fixture.test/download'), {kind:'download', filename:'app.apk'});
    await assert.rejects(navigate(page, 'http://fixture.test/unavailable'), /HTTP 503/);
    assert.equal(page.listenerCount('download'), 0);
  } finally { await browser.close(); }
});
