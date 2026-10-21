const test = require('node:test');
const assert = require('node:assert/strict');
const { accountTarget } = require('./account-target.cjs');

test('operator roles select local ADM even when the global web override targets localhost', () => {
  const settings = { web: { app_url: 'http://localhost:3002' } };
  for (const role of ['root', 'review', 'event_add']) {
    assert.deepEqual(accountTarget({ role }, settings, { APP_URL: 'http://localhost:3002' }),
      { admin: true, appUrl: 'http://localhost:3040' });
  }
  assert.equal(accountTarget({ role: 'parent' }, settings, {}).appUrl, 'http://localhost:3002');
});

test('only the three operator types can select the configured admin environment', () => {
  const settings = { admin: { app_url: 'http://localhost:3040' }, web: { app_url: 'http://localhost:3002' } };
  for (const role of ['child', 'parent', 'teacher', 'custom']) {
    assert.equal(accountTarget({ role, runtest_admin: true }, settings, {}).appUrl,
      'http://localhost:3002');
  }
  assert.equal(accountTarget({ role: 'review' }, settings, {}).appUrl, 'http://localhost:3040');
  assert.equal(accountTarget({ role: 'root' }, settings, { ADM_APP_URL: 'http://localhost:3041' }).appUrl,
    'http://localhost:3041');
});
