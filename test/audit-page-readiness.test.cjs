const test = require('node:test');
const assert = require('node:assert/strict');
const {waitForPageReady} = require('../automation_tests/child-interface-audit.cjs');
const {TESTER_SYSTEM_PROMPT} = require('../automation_tests/tester-system-prompt.cjs');

test('loaded pages proceed without waiting for network idle or a fixed delay', async () => {
  const calls = [];
  await waitForPageReady({
    async waitForLoadState(state) { calls.push(state); },
    locator(selector) {
      assert.equal(selector, 'body');
      return {async waitFor(options) {
        assert.equal(options.state, 'visible');
        assert.ok(options.timeout > 0);
        calls.push('visible');
      }};
    }
  });
  assert.deepEqual(calls, ['load', 'visible']);
});

test('readiness failures propagate rather than interacting on an unloaded page', async () => {
  await assert.rejects(waitForPageReady({
    async waitForLoadState() { throw new Error('load timeout'); }
  }), /load timeout/);
});

test('system prompt excludes language changes', () => {
  assert.match(TESTER_SYSTEM_PROMPT, /current language and locale unchanged/);
  assert.match(TESTER_SYSTEM_PROMPT, /language-switching links/);
});
