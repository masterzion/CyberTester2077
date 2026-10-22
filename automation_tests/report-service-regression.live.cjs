// Read-only validation of the report's authenticated service/navigation failures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { chromium } = require('playwright');
const { navigate } = require('./audit-navigation.cjs');
const { completeLogin, LOGIN_IDENTIFIER_SELECTOR } = require('./login-completion.cjs');
const { assertLocalUrl, installLocalBrowserGuard, localRequestGet } = require('./local-only.cjs');
installLocalBrowserGuard(chromium);

test('report parent can read activities and reach identity management content', { timeout: 240000 }, async () => {
  const settings = YAML.parse(fs.readFileSync(path.join(__dirname, 'automation-settings.yml'), 'utf8'));
  const accounts = YAML.parse(fs.readFileSync(path.join(__dirname, 'credentials.yml'), 'utf8')).accounts;
  const account = accounts.find(row => row.name === 'Līga Kalniņa' && row.role === 'parent');
  assert.ok(account, 'Report account must exist in authorized credentials');
  const origin = assertLocalUrl(settings.web.app_url, 'web.app_url').origin;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const output = path.join(__dirname, 'output', 'report-service-' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(output, { recursive: true });
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  try {
    const deadline = Date.now() + 120000;
    const remaining = () => Math.max(1, deadline - Date.now());
    await page.goto(origin + '/auth/login', { waitUntil: 'commit', timeout: remaining() });
    const identifier = page.locator(LOGIN_IDENTIFIER_SELECTOR).first();
    await identifier.waitFor({ state: 'visible', timeout: remaining() });
    await identifier.fill(account.email);
    await page.locator('input[type=password]').first().fill(account.password_env ? process.env[account.password_env] : account.password);
    await page.getByRole('button', { name: /sign in/i }).click({ timeout: remaining() });
    await completeLogin(page, origin, remaining);
    const session = await localRequestGet(context, origin + '/api/session');
    assert.equal(session.status(), 200);
    assert.ok((await session.json()).user?.id);
    for (let i = 0; i < 3; i++) {
      const response = await localRequestGet(context, origin + '/api/gateway/education/activities', { timeout: 60000 });
      assert.equal(response.status(), 200, 'Authenticated activities must succeed');
      const body = await response.json();
      assert.ok(Array.isArray(body) || Array.isArray(body.activities) || Array.isArray(body.items), 'Activities response must contain the collection');
      console.log(JSON.stringify({ endpoint: '/api/gateway/education/activities', status: response.status(), attempt: i + 1, collectionValidated: true }));
    }
    await navigate(page, origin + '/identity');
    const manage = page.locator('main a[href="/auth/oidc/start?intent=manage"]');
    await manage.waitFor({ state: 'visible', timeout: 30000 });
    assert.ok((await manage.textContent()).trim());
    console.log(JSON.stringify({ endpoint: '/identity', authenticated: true, managementControlVisible: true }));
  } finally {
    const coverage = await page.coverage.stopJSCoverage();
    fs.writeFileSync(path.join(output, 'browser-coverage.json'), JSON.stringify(coverage.map(({ url, ranges }) => ({ url: url.split('?')[0], ranges }))));
    await context.close();
    await browser.close();
  }
});
