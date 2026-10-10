const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const modulePath = path.resolve(__dirname, '../automation_tests/audit-outcome.cjs');

for (const [statuses, exitCode, status] of [
  [['PASS', 'FAIL', 'WARN'], 1, 'failed'],
  [['PASS', 'WARN', 'SKIP'], 0, 'completed'],
  [['FAIL', 'PASS'], 1, 'failed'],
]) {
  test(`audit process outcome retains recorded results: ${statuses.join(', ')}`, () => {
    const results = statuses.map(status => ({ status }));
    const child = spawnSync(process.execPath, ['--experimental-test-coverage', '-e',
      'const results=JSON.parse(process.env.AUDIT_TEST_RESULTS); console.log(require(process.env.AUDIT_OUTCOME_MODULE).completeAudit(results)); console.log(JSON.stringify(results));',
    ], { encoding: 'utf8', env: { ...process.env, AUDIT_OUTCOME_MODULE: modulePath, AUDIT_TEST_RESULTS: JSON.stringify(results) } });
    assert.equal(child.status, exitCode);
    assert.equal(child.stdout.split(/\r?\n/)[0], status);
    assert.deepEqual(JSON.parse(child.stdout.split(/\r?\n/)[1]), results);
  });
}
