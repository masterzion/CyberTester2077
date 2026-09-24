const test = require('node:test');
const assert = require('node:assert/strict');
const { classificationPrompt } = require('../temporary-categorize-main-docs.cjs');
const { parseJson } = require('../temporary-categorize-main-docs.cjs');
test('extracts final structured updates despite repeated JSON and commentary', () => {
  const final = { updates: [{ target: 'DONE.md', appendix: 'Content with {braces} and "quotes".' }] };
  const raw = 'Example: {"updates":[]}\n```json\n' + JSON.stringify(final) + '\n```\nFinal:\n' + JSON.stringify(final);
  assert.deepEqual(parseJson(raw), final);
});

test('model context includes custom filenames, full purposes, and permission for missing files', () => {
  const prompt = classificationPrompt('source.md', 'A documented fact.', [
    { name: 'CUSTOM.md', purpose: 'Unique destination scope for recovery drills.', exists: false, text: '' },
    { name: 'EXISTING.md', purpose: 'Existing API contracts.', exists: true, text: 'Existing evidence.' }
  ]);
  assert.match(prompt, /"filename":"CUSTOM.md"/);
  assert.match(prompt, /Unique destination scope for recovery drills/);
  assert.match(prompt, /"exists":false,"creationAllowed":true/);
  assert.match(prompt, /Existing evidence/);
  assert.match(prompt, /A documented fact/);
  assert.doesNotMatch(prompt, /do not create files/i);
});
