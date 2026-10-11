const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { chromium } = require('playwright');
const { completeLogin } = require('./login-completion.cjs');

test('real browser completes consent and rejects callback/session failures before exploration', async () => {
  let callbackStatus = 302, sessionStatus = 200, user = { id: 'fixture' };
  const application = createServer((req, res) => {
    if (new URL(req.url, 'http://fixture').pathname === '/auth/callback') {
      res.writeHead(callbackStatus, callbackStatus === 302 ? { location: '/home' } : {});
      return res.end('callback');
    }
    if (req.url === '/api/session') {
      res.writeHead(sessionStatus, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ user }));
    }
    res.end('Application');
  });
  await new Promise(resolve => application.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${application.address().port}`;
  const issuer = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<form action="${origin}/auth/callback"><button>Continue</button></form>`);
  });
  await new Promise(resolve => issuer.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    const enter = () => page.goto(`http://127.0.0.1:${issuer.address().port}`);
    const complete = () => completeLogin(page, origin, () => 5000);
    await enter(); await complete(); assert.equal(new URL(page.url()).pathname, '/home');
    user = { sub: 'operator-fixture' };
    await enter(); await complete(); assert.equal(new URL(page.url()).pathname, '/home');
    callbackStatus = 401;
    await enter(); await assert.rejects(complete(), /authenticated application page/);
    callbackStatus = 302;
    for (const status of [401, 503]) {
      sessionStatus = status; await enter(); await assert.rejects(complete(), /session validation failed/);
    }
    sessionStatus = 200; user = null;
    await enter(); await assert.rejects(complete(), /not authenticated/);
    sessionStatus = 404;
    await enter(); await complete();
    await page.goto(origin + '/home'); await complete();
    await page.coverage.stopJSCoverage();
  } finally {
    await browser.close();
    await Promise.all([new Promise(resolve => application.close(resolve)), new Promise(resolve => issuer.close(resolve))]);
  }
});
