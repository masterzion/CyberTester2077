const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { dedupeExactParagraphs, discoverMarkdownFiles, extractText, normalize, parseJson } = require('../temporary-categorize-main-docs.cjs');

test('parses fenced and prose-wrapped model JSON', () => {
  assert.deepEqual(parseJson('```json\n{"updates":[]}\n```'), { updates: [] });
  assert.deepEqual(parseJson('Model result: {"updates":[]} done.'), { updates: [] });
});

test('extracts text from common OpenAI-compatible response shapes', () => {
  assert.equal(extractText([{ text: 'first' }, { content: 'second' }]), 'first\nsecond');
  assert.equal(extractText({ output_text: 'report' }), 'report');
});

test('removes only repeated substantial paragraphs', () => {
  const paragraph = 'This is a sufficiently long repeated paragraph that represents durable documentation content and should appear only once after exact de-duplication.';
  const result = dedupeExactParagraphs('# Heading\n\n' + paragraph + '\n\n' + paragraph + '\n\nShort note.');
  assert.equal(result.match(/sufficiently long repeated paragraph/g).length, 1);
  assert.match(result, /Short note\./);
});

test('discovers only Markdown files from the configured source tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cybertester-docs-'));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'README.md'), '# Readme');
  fs.writeFileSync(path.join(root, 'nested', 'security.md'), '# Security');
  fs.writeFileSync(path.join(root, 'ignore.txt'), 'ignore');
  assert.deepEqual(discoverMarkdownFiles(root).sort(), ['README.md', 'nested/security.md']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('normalization ignores whitespace and capitalization', () => {
  assert.equal(normalize('  A  Document\n'), normalize('a document'));
});
