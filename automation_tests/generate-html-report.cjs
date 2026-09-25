/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const ROOT = __dirname, TEMPLATE = path.join(ROOT, 'report-template.html');
const settingsFile = process.env.AUTOMATION_SETTINGS || (fs.existsSync(path.join(ROOT, 'automation-settings.yml')) ? path.join(ROOT, 'automation-settings.yml') : path.join(ROOT, 'automation-settings.yml.example'));
const settings = YAML.parse(fs.readFileSync(settingsFile, 'utf8')) || {};
const modelUrl = process.env.MODEL_URL || settings.llm?.endpoint || 'http://192.168.2.110:1234/api/v1/chat';
const model = process.env.MODEL_NAME || settings.llm?.playwright_model || 'ornith-1.5-35b-a3b';
const apiKey = process.env[settings.llm?.api_key_env || 'LLM_API_KEY'];
const nativeFetch = global.fetch;
global.fetch = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...(options.headers || {}), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) } });
if (require.main === module) console.log('[CONFIG] settings=' + settingsFile + ' model=' + model + ' endpoint=' + modelUrl);
function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function esc(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' })[c]); }
function groupSkippedRows(rows) {
  const skipped = rows.filter(row => row.status === 'SKIP');
  if (!skipped.length) return rows;
  const reasons = new Map();
  for (const row of skipped) reasons.set(row.detail || 'Unspecified', (reasons.get(row.detail || 'Unspecified') || 0) + 1);
  const grouped = {status:'SKIP', component:'Skipped controls ('+skipped.length+' events)', detail:[...reasons].map(([reason,count]) => count+' × '+reason).join('; '), screenshot:'', count:skipped.length};
  let added = false;
  grouped.at=skipped.map(row=>row.at).filter(Boolean).sort().at(-1) || null;
  return rows.flatMap(row => row.status !== 'SKIP' ? [row] : added ? [] : (added = true, [grouped]));
}
function safeHtml(value) { return String(value || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/on\w+\s*=\s*(['"]).*?\1/gi, ''); }
function runDirs(dir = ROOT) { if (dir === ROOT && process.env.REPORT_RUN_DIR) return [path.resolve(process.env.REPORT_RUN_DIR)]; return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => { const file = path.join(dir, item.name); if (!item.isDirectory()) return []; if (fs.existsSync(path.join(file, 'live-progress.json'))) return [file]; return runDirs(file); }); }
async function getNarrative(progress, interactions, observations) {
  const prompt = 'You are a senior QA lead and product designer. Create a concise HTML fragment using only h3, p, ul, li, strong, and code. Do not include script, style, links, images, markdown, or unsupported claims. Follow this report design reference: executive summary, clear issue explanation, then a section named Design and usability recommendations. For every recommendation state: observed evidence, specific UI/design improvement, why it improves usability or child safety, and expected user outcome. Prioritize issues observed in the data. Evidence: ' + JSON.stringify({ results: progress.results || [], interactions: interactions.slice(-250), modelObservations: observations.slice(-10) });
  const response = await fetch(modelUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: prompt, stream: false, temperature: 0.2, max_output_tokens: 1800 }) });
  if (!response.ok) throw new Error('model HTTP ' + response.status);
  const body = await response.json(); const content = (body.output && body.output[0] && body.output[0].content) || body.output || body.response || (body.choices && body.choices[0] && body.choices[0].message.content) || '';
  return safeHtml(Array.isArray(content) ? content.map(x => x.text || x.content || '').join('\n') : content);
}
async function main(options = {}) {
  const dirs = options.dir ? [options.dir] : runDirs().sort((left, right) => fs.statSync(left).mtimeMs - fs.statSync(right).mtimeMs); if (!dirs.length) throw new Error('No timestamped scan folder exists. Run the audit first.');
  const dir = dirs[dirs.length - 1], id = path.relative(ROOT, dir).split(path.sep).join('/'), progress = read(path.join(dir, 'live-progress.json'), { results: [], interactions: [], pages: [] }), interactions = read(path.join(dir, 'interaction-results.json'), progress.interactions || []), observations = read(path.join(dir, 'model-observations.json'), []);
  const relative = file => file ? path.relative(dir, file).split(path.sep).join('/') : '';
  const timing = read(path.join(dir, 'execution-timing.json'), null);
  const consoleEvents = read(path.join(dir, 'console-events.json'), progress.console || []);
  const rows = groupSkippedRows(require('./report-evidence.cjs').evidenceRows(interactions,progress.results || [],consoleEvents,relative));
  let modelHtml;
  if (options.offline || process.argv.includes('--offline')) {
    modelHtml = '<p>Generated from saved audit evidence. No new model analysis was requested. Review flagged outcomes and screenshots below.</p>';
  } else {
    try { console.log('[MODEL] Creating HTML QA/design narrative with ' + model); modelHtml = await getNarrative(progress, interactions, observations); } catch (error) { modelHtml = '<p><strong>Model narrative unavailable.</strong> ' + esc(error.message) + '</p>'; }
  }
  const summary = { pages: (progress.pages || []).length, components: interactions.length, passed: rows.filter(x => x.status === 'PASS').length, failed: rows.filter(x => x.status === 'FAIL').length, warnings: rows.filter(x => x.status === 'WARN').length };
  const account = observations.find(x => x.account) || progress.account || {};
  const metadata = { account: account.account || 'Account audit', role: account.role || 'Not recorded', platform: path.basename(dir), generated: new Date().toLocaleString(), run: id };
  metadata.timing = timing || progress.timing;
  metadata.firstEvent = (progress.results || []).find(x => x.at)?.at;
  metadata.lastEvent = (progress.results || []).filter(x => x.at).at(-1)?.at;
  metadata.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  metadata.errors = [
    ...(progress.results || []).filter(x => !x.extra?.consoleEvent && ['FAIL','WARN'].includes(x.status)).map(x => ({at:x.at, status:x.status, source:x.name, message:x.detail || x.extra?.error || '', url:x.extra?.url || (x.extra?.screenshot ? interactions.find(i => i.screenshot === x.extra.screenshot)?.pageUrl : '') || ''})),
    ...consoleEvents.filter(x => ['error','pageerror','warning','warn'].includes(x.level)).map(x => ({at:x.at, status:['error','pageerror'].includes(x.level)?'FAIL':'WARN', source:'Browser '+x.level, message:x.text || x.message || '', url:x.url || ''}))
  ].sort((a,b) => String(a.at || '').localeCompare(String(b.at || '')));
  const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const values = { RUN_ID: esc(id), GENERATED_AT: esc(metadata.generated), MODEL_HTML: esc(modelHtml), SUMMARY_JSON: json(summary), ROWS_JSON: json(rows), MODELS_JSON: json(observations), META_JSON: json(metadata) };
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const html = template.replace(/{{([A-Z_]+)}}/g, (_, key) => values[key] ?? '');
  const file = path.join(dir, 'interactive-report.html');
  await require('./report-file-writer.cjs').writeReport(file, html);
  if (!options.quiet) console.log('Interactive report: ' + file);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { modelUrl, model, settings, renderReport: main, groupSkippedRows };
