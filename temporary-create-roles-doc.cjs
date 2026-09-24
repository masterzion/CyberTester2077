/* Temporary, opt-in role reconciliation. It appends to existing docs only. */
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const ACCOUNTS = path.join(__dirname, 'test-accounts.yml');
const APPLY = process.argv.includes('--apply');
const MODEL_URL = process.env.MODEL_URL || 'http://192.168.2.110:1234/api/v1/chat';
const MODEL = process.env.MODEL_NAME || 'ornith-1.5-35b-a3b';
const MARKER = '<!-- role-reconciliation:';
const compact = (value, max) => String(value || '').replace(/\s+/g, ' ').slice(0, max);

function docs(dir = DOCS) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(item => item.isDirectory() ? docs(path.join(dir, item.name)) : [path.join(dir, item.name)])
    .filter(file => file.endsWith('.md'))
    .map(file => ({ path: path.relative(ROOT, file).split(path.sep).join('/'), file, text: fs.readFileSync(file, 'utf8') }));
}
function extractText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') return '';
  return extractText(value.text || value.output_text || value.content || value.message || value.response || '');
}
function parseJson(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(text); } catch {}
  const hit = text.match(/\{[\s\S]*\}/);
  try { return hit ? JSON.parse(hit[0]) : null; } catch { return null; }
}
function safeTarget(targetPath, available) {
  const doc = available.find(item => item.path === targetPath);
  return doc && path.resolve(doc.file).startsWith(DOCS + path.sep) ? doc : null;
}
async function main() {
  const accounts = YAML.parse(fs.readFileSync(ACCOUNTS, 'utf8'))?.accounts;
  if (!Array.isArray(accounts)) throw new Error('test-accounts.yml must contain accounts:');
  const roles = [...new Set(accounts.map(account => account.role))];
  const available = docs();
  const sources = [...available].sort((left, right) => right.text.length - left.text.length).slice(0, 3);
  const prompt = 'You are a technical documentation maintainer. Reconcile role responsibilities using only the YAML role metadata and the three supplied largest documentation files. Preserve useful detail: the output may be long. Avoid duplicated information: place each role in exactly one best-fitting existing target file, and only when it adds information absent from that target. You may target any listed existing documentation file but never create files. For each update distinguish responsibilities, current implementation evidence, and remaining implementation or validation. Do not include credentials, personal account data, or invented behavior. Return exactly one JSON object with this schema: {"updates":[{"role":"parent","targetPath":"docs/existing.md","appendix":"Markdown, as detailed as needed","reason":"..."}],"skippedRoles":[{"role":"child","reason":"..."}]}. Roles: ' + JSON.stringify(roles) + '. Role metadata: ' + JSON.stringify(accounts.map(account => ({ role: account.role, description: account.description }))) + '. Existing targets: ' + JSON.stringify(available.map(doc => ({ path: doc.path, excerpt: compact(doc.text, 500) }))) + '. Source documents: ' + JSON.stringify(sources.map(doc => ({ path: doc.path, content: doc.text })));
  const strictRules = '\n\nFINAL OUTPUT RULES: Return only parseable JSON. Do not narrate your reasoning, do not say "let me look", and do not use Markdown fences. Each of these roles must occur at most once: ' + JSON.stringify(roles) + '. Every update.targetPath must exactly equal one of these paths: ' + JSON.stringify(available.map(doc => doc.path)) + '. Every update.role must exactly equal a listed role. If a role has no unique destination, put it in skippedRoles. Keep detailed implementation evidence and open validation work in appendix; do not shorten it merely to save tokens.';
  const response = await fetch(MODEL_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: prompt + strictRules, stream: false, temperature: 0, max_output_tokens: 8000 }) });
  if (!response.ok) throw new Error('model HTTP ' + response.status);
  const body = await response.json();
  const raw = extractText(body.choices?.[0]?.message?.content || body.output || body.response || body);
  const plan = parseJson(raw);
  if (!plan || !Array.isArray(plan.updates)) {
    console.log('Model response was not structured. Nothing was changed.\n\n' + raw);
    process.exitCode = 1;
    return;
  }
  const updatedRoles = new Set();
  const results = [];
  for (const update of plan.updates) {
    const target = safeTarget(update.targetPath, available);
    const role = String(update.role || '');
    const appendix = String(update.appendix || '').trim();
    if (!roles.includes(role) || updatedRoles.has(role) || !target || !appendix) { results.push({ role, status: 'SKIP', reason: 'invalid, duplicate, or unsafe model update' }); continue; }
    updatedRoles.add(role);
    const marker = MARKER + ' ' + role + ' -->';
    if (target.text.includes(marker)) { results.push({ role, status: 'SKIP', targetPath: target.path, reason: 'already reconciled' }); continue; }
    if (APPLY) fs.appendFileSync(target.file, '\n\n' + marker + '\n\n## Role reconciliation: ' + role + '\n\n' + appendix + '\n', 'utf8');
    results.push({ role, status: APPLY ? 'APPEND' : 'PREVIEW', targetPath: target.path, appendix, reason: update.reason || '' });
  }
  for (const role of roles.filter(role => !updatedRoles.has(role))) results.push({ role, status: 'SKIP', reason: plan.skippedRoles?.find(item => item.role === role)?.reason || 'model did not select a non-duplicating target' });
  console.log('Sources: ' + sources.map(source => source.path).join(', ') + '\n\n' + JSON.stringify(results, null, 2) + (results.some(result => result.reason === 'invalid, duplicate, or unsafe model update') ? '\n\nRaw model response:\n' + raw : ''));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
