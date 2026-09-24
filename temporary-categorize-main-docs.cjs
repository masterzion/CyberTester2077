/*
 * Temporary fixed-taxonomy documentation reconciler.
 * Preview: node automation_tests/temporary-categorize-main-docs.cjs
 * Apply:   node automation_tests/temporary-categorize-main-docs.cjs --apply
 * It never creates a target file and only removes exact duplicate paragraphs.
 */
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const ROOT = __dirname;
const SETTINGS_FILE = process.env.AUTOMATION_SETTINGS || (fs.existsSync(path.join(__dirname, 'automation_tests', 'automation-settings.yml')) ? path.join(__dirname, 'automation_tests', 'automation-settings.yml') : path.join(__dirname, 'automation_tests', 'automation-settings.yml.example'));
const settings = YAML.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
const documentation = settings.documentation || {};
const DOCS = path.resolve(ROOT, documentation.destination_folder || './docs');
const SOURCE_FOLDER = path.resolve(ROOT, documentation.source_folder || './source-docs');
const APPLY = process.argv.includes('--apply');
const MODEL_URL = process.env.MODEL_URL || settings.llm?.endpoint || 'http://192.168.2.110:1234/api/v1/chat';
const MODEL = process.env.MODEL_NAME || settings.llm?.model || 'ornith-1.5-35b-a3b';
const LLM_API_KEY = process.env[settings.llm?.api_key_env || 'LLM_API_KEY'];
const nativeFetch = global.fetch;
global.fetch = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...options.headers, ...(LLM_API_KEY ? { authorization: 'Bearer ' + LLM_API_KEY } : {}) } });
const TARGETS = ['API-ARCHITECTURE.md', 'IMPLEMENTED.md', 'OPERATIONS.md', 'TODO.md', 'PLAN.md', 'README.md', 'RECOVERY.md', 'SAFETY-COMPLIANCE.md', 'SECURITY.md', 'ROLE.md'];
const MARKER = '<!-- main-doc-reconciliation:';
const compact = (value, max) => String(value || '').replace(/\s+/g, ' ').slice(0, max);

function discoverMarkdownFiles(root) { const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]); return walk(root).filter(file => file.endsWith('.md')).map(file => path.relative(root, file).split(path.sep).join('/')); }
function sourceFiles() { return discoverMarkdownFiles(SOURCE_FOLDER); }
function sourceText(sourcePath) { const file = path.resolve(SOURCE_FOLDER, sourcePath); if (!file.startsWith(SOURCE_FOLDER + path.sep)) throw new Error('Source path is outside the configured read-only source folder'); return fs.readFileSync(file, 'utf8'); }

function parseJson(value) { const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''); try { return JSON.parse(text); } catch {} const hit = text.match(/\{[\s\S]*\}/); try { return hit ? JSON.parse(hit[0]) : null; } catch { return null; } }
function extractText(value) { if (typeof value === 'string') return value; if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n'); if (!value || typeof value !== 'object') return ''; return extractText(value.text || value.output_text || value.content || value.message || value.response || ''); }
function findTargets() { const entries = fs.readdirSync(DOCS, { withFileTypes: true }).filter(item => item.isFile()).map(item => ({ name: item.name, file: path.join(DOCS, item.name) })); return TARGETS.map(name => { const entry = entries.find(item => item.name.toLowerCase() === name.toLowerCase()); return { name, file: entry?.file || null, text: entry ? fs.readFileSync(entry.file, 'utf8') : null }; }); }
function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function dedupeExactParagraphs(text) { const seen = new Set(); return String(text).split(/\r?\n\s*\r?\n/).filter(block => { const key = normalize(block); if (key.length < 80 || key.startsWith('<!--')) return true; if (seen.has(key)) return false; seen.add(key); return true; }).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'; }
async function classify(sourcePath, mainText, targets) { const prompt = 'You are a careful technical documentation maintainer. Read one documentation file from the configured read-only source folder and classify missing durable information into only the existing target documents in the configured destination folder. Preserve useful detail; appendices may be long. Do not repeat information already in a target, do not invent facts, do not include credentials, and do not create files. State what is implemented, planned, operational, recovery-related, safety/compliance-related, security-related, API/architecture-related, or role-related as appropriate. Return exactly JSON: {"updates":[{"target":"IMPLEMENTED.md","appendix":"Markdown to append","reason":"..."}],"skipReason":"..."}. Source path: ' + sourcePath + '. Source content: ' + mainText + '. Current destination targets: ' + JSON.stringify(targets.filter(target => target.file).map(target => ({ target: target.name, currentContent: compact(target.text, 12000) })));
  const strictRules = '\n\nFINAL OUTPUT RULES: Return only one parseable JSON object; no commentary, reasoning, or Markdown fences. Every updates.target must exactly equal one of the currently existing target filenames: ' + JSON.stringify(targets.filter(target => target.file).map(target => target.name)) + '. Put detailed source-backed information in appendix and preserve implementation status, operational consequences, security/safety constraints, and remaining work. Use skipReason when there is no non-duplicative addition.';
  const response = await fetch(MODEL_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: prompt + strictRules, stream: false, temperature: 0, max_output_tokens: 8000 }) });
  if (!response.ok) throw new Error('model HTTP ' + response.status);
  const body = await response.json();
  return { plan: parseJson(extractText(body.choices?.[0]?.message?.content || body.output || body.response || body)), raw: extractText(body.choices?.[0]?.message?.content || body.output || body.response || body) };
}
async function main() {
  const missing = findTargets().filter(target => !target.file).map(target => target.name);
  const state = new Map(findTargets().filter(target => target.file).map(target => [target.name, { ...target }]));
  const sourceDocuments = sourceFiles();
  const report = { mode: APPLY ? 'apply' : 'preview', model: MODEL, settingsFile: SETTINGS_FILE, sourceFolder: SOURCE_FOLDER, destinationFolder: DOCS, sources: sourceDocuments.length, missingTargets: missing, updates: [], skipped: [], errors: [] };
  for (const sourcePath of sourceDocuments) {
    const mainText = sourceText(sourcePath);
    try {
      const targets = [...state.values()];
      const { plan, raw } = await classify(sourcePath, mainText, targets);
      if (!Array.isArray(plan?.updates)) { report.skipped.push({ sourcePath, reason: 'model returned no structured update', raw }); continue; }
      for (const update of plan.updates) {
        const target = state.get(update.target);
        const appendix = String(update.appendix || '').trim();
        if (!target || !appendix || target.text.includes(MARKER + ' ' + sourcePath + ' -->')) { report.skipped.push({ sourcePath, target: update.target, reason: 'invalid, empty, or already appended' }); continue; }
        const candidate = target.text + '\n\n' + MARKER + ' ' + sourcePath + ' -->\n\n' + appendix + '\n';
        if (normalize(target.text).includes(normalize(appendix))) { report.skipped.push({ sourcePath, target: target.name, reason: 'appendix already represented in target' }); continue; }
        target.text = candidate;
        report.updates.push({ sourcePath, target: target.name, reason: update.reason || '', appendix });
      }
    } catch (error) { report.errors.push({ sourcePath, error: error.message }); }
  }
  for (const target of state.values()) {
    const deduped = dedupeExactParagraphs(target.text);
    if (APPLY && deduped !== fs.readFileSync(target.file, 'utf8')) fs.writeFileSync(target.file, deduped, 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { dedupeExactParagraphs, discoverMarkdownFiles, extractText, normalize, parseJson, sourceText };
