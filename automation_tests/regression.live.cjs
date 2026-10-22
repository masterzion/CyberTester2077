// Explicit live smoke: reads configured accounts and performs no content writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { chromium } = require('playwright');
const { attachNetworkEvidence } = require('./network-evidence.cjs');
const { completeLogin } = require('./login-completion.cjs');
const { assertLocalUrl, installLocalBrowserGuard } = require('./local-only.cjs');
installLocalBrowserGuard(chromium);
const output = path.join(__dirname, 'output', 'live-regression-' + new Date().toISOString().replace(/[:.]/g, '-'));
const config = YAML.parse(fs.readFileSync(path.join(__dirname, 'automation-settings.yml'), 'utf8'));
const accounts = YAML.parse(fs.readFileSync(path.join(__dirname, 'credentials.yml'), 'utf8')).accounts;
const origin = process.env.APP_URL || config.web.app_url;
fs.mkdirSync(output, { recursive: true });

test('authenticated responsive controls, Learn availability and guardian read-only messages', { timeout: 240000 }, async () => {
  assertLocalUrl(origin, 'APP_URL');
  const browser = await chromium.launch({ headless: true });
  const findings = [], topics = [];
  try {
    for (const mode of [
      { role: 'child', width: 1365, height: 900 },
      { role: 'child', width: 360, height: 800 },
      { role: 'parent', width: 1365, height: 900 },
    ]) {
      const account = accounts.find(row => row.role === mode.role && row.runtest_web);
      assert.ok(account, `Configured ${mode.role} account is required`);
      const context = await browser.newContext({ viewport: { width: mode.width, height: mode.height } });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      const errors = [];
      const apiOrigins = new Set();
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/gateway/')) apiOrigins.add(url.origin);
      });
      attachNetworkEvidence(page, (level, detail) => errors.push({ level, detail }));
      page.on('pageerror', error => errors.push({ level: 'pageerror', detail: error.name }));
      try {
        const deadline = Date.now() + 120000;
        const remaining = () => Math.max(1, deadline - Date.now());
        await page.goto(origin + '/auth/login', { waitUntil: 'commit', timeout: remaining() });
        const email = page.locator('input[type=email],input[name*=email i],input[autocomplete=username]').first();
        const password = page.locator('input[type=password],input[name*=password i],input[autocomplete=current-password]').first();
        await email.waitFor({ state: 'visible', timeout: remaining() });
        await email.fill(account.email, { timeout: remaining() });
        await password.fill(account.password_env ? process.env[account.password_env] : account.password, { timeout: remaining() });
        await page.getByRole('button', { name: /sign in/i }).click();
        await completeLogin(page, origin, remaining);
        await page.locator('main').first().waitFor();
        if (mode.role === 'child') {
          await page.goto(origin + '/child/profile', { waitUntil: 'domcontentloaded' });
          const form = page.getByRole('form', { name: 'My Profile' });
          await form.getByRole('button', { name: 'Save profile', exact: true }).waitFor();
          await form.locator('button[aria-pressed]').first().waitFor();
          const labels = await form.getByRole('button').allTextContents();
          const controls = labels.filter(label => /^[+✓] /.test(label.trim())).map(label => label.trim().replace(/^[+✓] /, '')).sort();
          assert.ok(controls.length > 0, 'Topic controls must load');
          topics.push(controls);
          const responses = ['projects', 'progress'].map(kind => page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/activity-providers/learn/' + kind)));
          await page.goto(origin + '/child/learn', { waitUntil: 'domcontentloaded' });
          const statuses = (await Promise.all(responses)).map(response => response.status());
          assert.deepEqual(statuses, [200, 200]);
          findings.push({ ...mode, topicCount: controls.length, learnStatuses: statuses });
        } else {
          await page.goto(origin + '/parent/messages', { waitUntil: 'domcontentloaded' });
          await page.getByText('You can read this chat but not reply', { exact: true }).first().waitFor();
          assert.equal(await page.locator('textarea').count(), 0);
          findings.push({ ...mode, readOnly: true });
        }
        assert.deepEqual(errors, [], 'No browser or HTTP failures are accepted');
        assert.deepEqual([...apiOrigins], [new URL(origin).origin], 'Browser API requests must use the same-origin gateway');
      } finally {
        findings.push({ ...mode, finalPath: new URL(page.url()).pathname, errors });
        const coverage = await page.coverage.stopJSCoverage();
        fs.writeFileSync(path.join(output, `${mode.role}-${mode.width}-coverage.json`), JSON.stringify(coverage.map(({ url, ranges }) => ({ url: url.split('?')[0], ranges }))));
        await context.close();
      }
    }
    assert.deepEqual(topics[0], topics[1], 'Identical topic functionality is required at both widths');
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(findings, null, 2));
  }
});
