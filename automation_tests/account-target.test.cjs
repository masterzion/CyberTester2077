const test = require('node:test');
const assert = require('node:assert/strict');
const { accountTarget } = require('./account-target.cjs');

test('operator roles select ADM even when the global web override targets Viafactor', () => {
  const settings = { web: { app_url: 'https://dev.viafactor.com' } };
  for (const role of ['root', 'review', 'event_add']) {
    assert.deepEqual(accountTarget({ role }, settings, { APP_URL: 'https://dev.viafactor.com' }),
      { admin: true, appUrl: 'https://adm.viafactor.com' });
  }
  assert.equal(accountTarget({ role: 'parent' }, settings, {}).appUrl, 'https://dev.viafactor.com');
});

test('only the three operator types can select the configured admin environment', () => {
  const settings = { admin: { app_url: 'http://127.0.0.1:3040' }, web: { app_url: 'https://dev.viafactor.com' } };
  for (const role of ['child', 'parent', 'teacher', 'custom']) {
    assert.equal(accountTarget({ role, runtest_admin: true }, settings, {}).appUrl,
      'https://dev.viafactor.com');
  }
  assert.equal(accountTarget({ role: 'review' }, settings, {}).appUrl, 'http://127.0.0.1:3040');
  assert.equal(accountTarget({ role: 'root' }, settings, { ADM_APP_URL: 'https://admin.example.test' }).appUrl,
    'https://admin.example.test');
});
