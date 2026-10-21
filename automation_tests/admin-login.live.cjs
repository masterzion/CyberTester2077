const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { chromium } = require('playwright');
const { accountTarget } = require('./account-target.cjs');
const { cfg, login } = require('./child-interface-audit.cjs');
const settings = YAML.parse(fs.readFileSync(path.join(__dirname, 'automation-settings.yml'), 'utf8'));

const accounts = YAML.parse(fs.readFileSync(path.join(__dirname, 'credentials.yml'), 'utf8')).accounts;

// Login only: no exploratory actions, content changes, or session artifacts.
for (const role of ['event_add', 'root', 'review']) {
  test(`${role} signs into ADM and lands on /home with its own operator session`, { timeout: 240000 }, async () => {
    const account = accounts.find(row => row.role === role && row.runtest_web === true);
    assert.ok(account, `Missing configured ${role} account`);
    const target = accountTarget(account, settings, {});
    assert.equal(new URL(target.appUrl).hostname, 'localhost');
    Object.assign(cfg, {
      appUrl: target.appUrl, role, accountName: account.name,
      email: account.email, password: account.password_env ? process.env[account.password_env] : account.password,
      loginTimeoutMs: Number(account.login_timeout_seconds || 60) * 1000,
    });
    assert.ok(cfg.password, 'Configured password is required');
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      let callbackDestination;
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.origin === target.appUrl && url.pathname === '/auth/callback')
          callbackDestination = response.headers().location;
      });
      await login(page);
      assert.equal(callbackDestination, new URL('/home', target.appUrl).href);
      const landing = new URL(page.url());
      assert.equal(landing.origin, target.appUrl);
      assert.equal(landing.pathname, '/home');
      const response = await context.request.get(target.appUrl + '/api/session');
      assert.equal(response.status(), 200);
      const session = await response.json();
      assert.equal(session.authenticated, true);
      assert.equal(session.user.sub, account.account_id);
      assert.ok(session.permissions?.includes(role) || session.permission === role,
        'ADM session must confirm the expected operator permission');
    } finally {
      cfg.password = '';
      await browser.close();
    }
  });
}
