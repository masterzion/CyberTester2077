/*
 * Temporary fixed-taxonomy documentation reconciler.
 * Preview: node temporary-categorize-main-docs.cjs [--source-file relative.md]
 * Apply:   node temporary-categorize-main-docs.cjs --apply [--source-file relative.md]
 * Apply mode may create configured target files; preview never writes them.
 */
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { createReader, reviewDocument, renderReview, inside } = require('./code-review-docs.cjs');
const { duplicatePrompt, applyDuplicates } = require('./deduplicate-docs.cjs');
const { resolvePrompt } = require('./stage-prompts.cjs');

const ROOT = __dirname;
const SETTINGS_FILE = process.env.AUTOMATION_SETTINGS || (fs.existsSync(path.join(__dirname, 'automation_tests', 'automation-settings.yml')) ? path.join(__dirname, 'automation_tests', 'automation-settings.yml') : path.join(__dirname, 'automation_tests', 'automation-settings.yml.example'));
const settings = YAML.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
const CREDENTIALS_FILE = process.env.AUTOMATION_CREDENTIALS || path.join(__dirname, 'automation_tests', 'credentials.yml');
const credentials = fs.existsSync(CREDENTIALS_FILE) ? (YAML.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8')) || {}) : {};
const documentation = { ...(settings.documentation || {}), ...(credentials.documentation || {}) };
const DOCS = path.resolve(ROOT, documentation.destination_folder || './docs');
const SOURCE_FOLDER = path.resolve(ROOT, documentation.source_folder || './source-docs');
const APPLY = process.argv.includes('--apply');
const STAGE3_ONLY = process.argv.includes('--stage3-only');
const MODEL_URL = process.env.MODEL_URL || settings.llm?.endpoint || 'http://192.168.2.110:1234/api/v1/chat';
const MODEL = process.env.MODEL_NAME || settings.llm?.model || 'ornith-1.5-35b-a3b';
const STAGE_MODELS = Object.fromEntries([1,2,3].map(stage => [stage, process.env['MODEL_STAGE'+stage] || settings.llm?.['model_stage'+stage] || MODEL]));
const LLM_API_KEY = process.env[settings.llm?.api_key_env || 'LLM_API_KEY'];
const nativeFetch = global.fetch;
global.fetch = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...options.headers, ...(LLM_API_KEY ? { authorization: 'Bearer ' + LLM_API_KEY } : {}) } });
const DEFAULT_TARGETS = [{ id: 'api-architecture', file: 'api-architecture.md', purpose: 'API and architecture documentation' }, { id: 'implemented', file: 'implemented.md', purpose: 'implemented functionality' }, { id: 'operations', file: 'operations.md', purpose: 'operational procedures' }, { id: 'todo', file: 'todo.md', purpose: 'remaining implementation tasks' }, { id: 'plan', file: 'plan.md', purpose: 'implementation plan' }, { id: 'readme', file: 'readme.md', purpose: 'documentation overview' }, { id: 'recovery', file: 'recovery.md', purpose: 'recovery procedures' }, { id: 'safety-compliance', file: 'safety-compliance.md', purpose: 'safety and compliance' }, { id: 'security', file: 'security.md', purpose: 'security requirements' }, { id: 'role', file: 'role.md', purpose: 'role responsibilities' }];
const MARKER = '<!-- main-doc-reconciliation:';
const compact = (value, max) => String(value || '').replace(/\s+/g, ' ').slice(0, max);

function discoverMarkdownFiles(root) { const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]); return walk(root).filter(file => file.endsWith('.md')).map(file => path.relative(root, file).split(path.sep).join('/')); }
function sourceFiles() {
  const index = process.argv.indexOf('--source-file');
  if (index < 0) return discoverMarkdownFiles(SOURCE_FOLDER);
  const selected = process.argv[index + 1];
  if (!selected || selected.startsWith('--')) throw new Error('--source-file requires a Markdown path relative to source_folder');
  const root = fs.realpathSync(SOURCE_FOLDER);
  const file = fs.realpathSync(path.resolve(SOURCE_FOLDER, selected));
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !/\.md$/i.test(file) || !fs.statSync(file).isFile()) throw new Error('Selected file must be Markdown inside source_folder');
  return [relative.split(path.sep).join('/')];
}
function sourceText(sourcePath) { const file = path.resolve(SOURCE_FOLDER, sourcePath); if (!file.startsWith(SOURCE_FOLDER + path.sep)) throw new Error('Source path is outside the configured read-only source folder'); return fs.readFileSync(file, 'utf8'); }

function parseJson(value) {
  const text = String(value || '').trim();
  try { return JSON.parse(text); } catch {}
  const candidates = [];
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0, quoted = false, escaped = false;
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
      if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try { candidates.push(JSON.parse(text.slice(start, end + 1))); } catch {}
        break;
      }
    }
  }
  return candidates.reverse().find(candidate => Array.isArray(candidate.updates) || Array.isArray(candidate.findings) || Array.isArray(candidate.requests) || Array.isArray(candidate.duplicates)) || candidates[0] || null;
}
function extractText(value) { if (typeof value === 'string') return value; if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n'); if (!value || typeof value !== 'object') return ''; return extractText(value.text || value.output_text || value.content || value.message || value.response || ''); }
function configuredTargets() { const configured = Array.isArray(documentation.destination_files) && documentation.destination_files.length ? documentation.destination_files : DEFAULT_TARGETS; return configured.map((item, index) => { const value = typeof item === 'string' ? { file: item } : item || {}; const name = String(value.file || value.name || '').trim(); if (!name || path.basename(name) !== name || path.extname(name).toLowerCase() !== '.md') throw new Error('Invalid documentation destination file at index ' + index); return { id: String(value.id || path.basename(name, '.md')).trim(), name, purpose: String(value.content || value.purpose || '').trim() }; }); }
function findTargets() { return configuredTargets().map(target => { const file = path.resolve(DOCS, target.name); if (!file.startsWith(DOCS + path.sep)) throw new Error('Documentation destination is outside the configured destination folder: ' + target.name); const exists = fs.existsSync(file); const text = exists ? fs.readFileSync(file, 'utf8') : '# ' + target.id + '\n\n' + (target.purpose ? target.purpose + '\n' : ''); return { ...target, file, exists, text }; }); }
function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function dedupeExactParagraphs(text) { const seen = new Set(); return String(text).split(/\r?\n\s*\r?\n/).filter(block => { const key = normalize(block); if (key.length < 80 || key.startsWith('<!--')) return true; if (seen.has(key)) return false; seen.add(key); return true; }).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'; }
function progress(stage, current, total, label) { const width = 28; const ratio = total ? current / total : 1; const filled = Math.round(width * ratio); const bar = '#'.repeat(filled) + '-'.repeat(width - filled); process.stdout.write('\r[' + bar + '] ' + Math.round(ratio * 100) + '% ' + stage + ' ' + current + '/' + total + ' ' + compact(label, 56) + '                    '); }
function classificationPrompt(sourcePath, mainText, targets) {
  return [
    resolvePrompt('stage1', settings.prompts),
    'Configured destination context: ' + JSON.stringify(targets.map(target => ({
      filename: target.name, content: target.purpose, exists: target.exists,
      creationAllowed: true, currentContent: target.text
    }))),
    'Source filename: ' + sourcePath,
    'Source content:\n' + mainText
  ].join('\n\n');
}
async function classify(sourcePath, mainText, targets) {
  const prompt = classificationPrompt(sourcePath, mainText, targets);
  return askModel(prompt, 1);
}
async function askModel(prompt, stage) {
  const model = STAGE_MODELS[stage];
  if (!model) throw new Error('Unknown model stage: '+stage);
  console.log('\n[MODEL] stage='+stage+' model='+model+' endpoint='+MODEL_URL);
  const response = await fetch(MODEL_URL, { method: 'POST', signal: AbortSignal.timeout(300000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: prompt, reasoning: 'off', stream: false, temperature: 0, max_output_tokens: 8000 }) });
  if (!response.ok) throw new Error('model HTTP ' + response.status);
  const body = await response.json();
  return { plan: parseJson(extractText(body.choices?.[0]?.message?.content || body.output || body.response || body)), raw: extractText(body.choices?.[0]?.message?.content || body.output || body.response || body) };
}
async function main() {
  if (STAGE3_ONLY && process.argv.includes('--source-file')) throw new Error('--stage3-only cannot be combined with --source-file');
  const sourceReal = fs.existsSync(SOURCE_FOLDER) ? fs.realpathSync(SOURCE_FOLDER) : SOURCE_FOLDER;
  const destinationResolved = fs.existsSync(DOCS) ? fs.realpathSync(DOCS) : DOCS;
  const relativeDestination = path.relative(sourceReal, destinationResolved);
  if (!relativeDestination || (!relativeDestination.startsWith('..' + path.sep) && relativeDestination !== '..' && !path.isAbsolute(relativeDestination))) {
    throw new Error('Destination must be outside the read-only source folder.');
  }
  if (APPLY && documentation.destination_read_write === false) throw new Error('Destination writes are disabled in configuration.');
  const code = settings.code || {};
  let reader = null;
  if (code.code_review === true) {
    if (code.source_read_only === false) throw new Error('Code review supports read-only source access only');
    if (!Array.isArray(code.source_folder) || !code.source_folder.length) throw new Error('code.source_folder must be a nonempty list of folders');
    reader = createReader(code.source_folder.map(folder=>path.resolve(ROOT,folder)));
    for (const root of reader.roots) if (inside(root,destinationResolved)) throw new Error('Documentation destination must be outside code source folders');
  }
  const stages = reader ? 3 : 2;
  if (STAGE3_ONLY && !reader) throw new Error('--stage3-only requires code.code_review: true');
  const missing = findTargets().filter(target => !target.exists).map(target => target.name);
  const state = new Map(findTargets().filter(target => target.file).map(target => [target.name, { ...target, pending: [] }]));
  const sourceDocuments = STAGE3_ONLY ? [] : sourceFiles();
  const report = { mode: APPLY ? 'apply' : 'preview', model: MODEL, stageModels: STAGE_MODELS, settingsFile: SETTINGS_FILE, sourceFolder: SOURCE_FOLDER, destinationFolder: DOCS, sources: sourceDocuments.length, missingTargets: missing, updates: [], skipped: [], errors: [] };
  if (!STAGE3_ONLY) console.log('[STAGE 1/'+stages+'] Reading and classifying source documentation');
  for (const [sourceIndex, sourcePath] of sourceDocuments.entries()) {
    progress('sources', sourceIndex + 1, sourceDocuments.length, sourcePath);
    const mainText = sourceText(sourcePath);
    try {
      const targets = [...state.values()];
      const { plan, raw } = await classify(sourcePath, mainText, targets);
      if (!Array.isArray(plan?.updates)) { report.errors.push({ sourcePath, reason: 'model returned no structured update', raw }); continue; }
      for (const update of plan.updates) {
        const target = state.get(update.target);
        const appendix = String(update.appendix || '').trim();
        if (!target || !appendix || target.text.includes(MARKER + ' ' + sourcePath + ' -->')) { report.skipped.push({ sourcePath, target: update.target, reason: 'invalid, empty, or already appended' }); continue; }
        const block = '\n\n' + MARKER + ' ' + sourcePath + ' -->\n\n' + appendix + '\n';
        const candidate = target.text + block;
        if (normalize(target.text).includes(normalize(appendix))) { report.skipped.push({ sourcePath, target: target.name, reason: 'appendix already represented in target' }); continue; }
        target.text = candidate;
        target.pending.push({ sourcePath, appendix, block });
        report.updates.push({ sourcePath, target: target.name, reason: update.reason || '', appendix });
      }
    } catch (error) { report.errors.push({ sourcePath, error: error.message }); }
    let savedTargets = 0;
    for (const target of state.values()) {
      if (!target.pending.length) continue;
      let merged = APPLY && target.exists ? fs.readFileSync(target.file, 'utf8') : target.text;
      for (const pending of target.pending) {
        if (!merged.includes(MARKER + ' ' + pending.sourcePath + ' -->')) merged += pending.block;
      }
      if (APPLY) { fs.mkdirSync(DOCS, { recursive: true }); fs.writeFileSync(target.file, merged, 'utf8'); }
      target.text = merged;
      if (APPLY) target.exists = true;
      target.pending = [];
      savedTargets++;
    }
    process.stdout.write('\n['+(APPLY?'SAVED':'PREVIEW')+'] ' + sourcePath + ' — ' + savedTargets + ' destination file(s) updated\n');
  }
  const destinations = [...state.values()];
  if (!STAGE3_ONLY) {
  console.log('[STAGE 2/'+stages+'] Reading, deduplicating, and writing destination documentation');
  for (const [destinationIndex, target] of destinations.entries()) {
    progress('destinations', destinationIndex + 1, destinations.length, target.name);
    let merged = APPLY && target.exists ? fs.readFileSync(target.file, 'utf8') : target.text;
    for (const pending of target.pending) {
      if (merged.includes(MARKER + ' ' + pending.sourcePath + ' -->') || normalize(merged).includes(normalize(pending.appendix))) continue;
      merged += pending.block;
    }
    target.text = merged;
    if (!target.exists && !report.updates.some(update=>update.target===target.name)) continue;
    try {
      console.log('\n[DEDUP REVIEW] '+target.name);
      const {plan} = await askModel(duplicatePrompt(target.name,merged,resolvePrompt('stage2', settings.prompts)), 2);
      const result = applyDuplicates(merged,plan);
      (report.deduplication ||= []).push({target:target.name,removed:result.removed,skipped:result.skipped,recommendations:result.recommendations});
      target.text = result.text;
      if (APPLY && result.text !== merged) fs.writeFileSync(target.file,result.text,'utf8');
      console.log('[DEDUP '+(APPLY?'SAVED':'PREVIEW')+'] '+target.name+' — '+result.removed+' duplicate blocks removed');
    } catch(error) { report.errors.push({stage:2,target:target.name,error:error.message}); console.error('\n[DEDUP ERROR] '+target.name+': '+error.message); }
  }
  }
  if (reader) {
    console.log('\n[STAGE 3/3] Comparing documentation with read-only code sources');
    report.codeReviews = [];
    for (const [index,target] of destinations.entries()) {
      progress('code review',index+1,destinations.length,target.name);
      if (!target.exists && !report.updates.some(update=>update.target===target.name)) continue;
      try {
        const findings = await reviewDocument(target,reader,prompt=>askModel(prompt, 3),resolvePrompt('stage3', settings.prompts));
        report.codeReviews.push({target:target.name,findings});
        if (findings.length) {
          target.text += renderReview(findings,reader.roots);
          if (APPLY) { fs.mkdirSync(DOCS,{recursive:true}); fs.writeFileSync(target.file,target.text,'utf8'); }
        }
        console.log('\n['+(APPLY?'REVIEW SAVED':'REVIEW PREVIEW')+'] '+target.name+' — '+findings.length+' findings');
      } catch(error) { report.errors.push({stage:3,target:target.name,error:error.message}); console.error('\n[REVIEW ERROR] '+target.name+': '+error.message); }
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { classificationPrompt, configuredTargets, dedupeExactParagraphs, discoverMarkdownFiles, extractText, normalize, parseJson, sourceText };
