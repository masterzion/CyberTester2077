/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const ROOT = __dirname, TEMPLATE = path.join(ROOT, 'report-template.html');
const settingsFile = process.env.AUTOMATION_SETTINGS || (fs.existsSync(path.join(ROOT, 'automation-settings.yml')) ? path.join(ROOT, 'automation-settings.yml') : path.join(ROOT, 'automation-settings.yml.example'));
const settings = YAML.parse(fs.readFileSync(settingsFile, 'utf8')) || {};
const modelUrl = process.env.MODEL_URL || settings.llm?.endpoint || 'http://192.168.2.110:1234/api/v1/chat';
const model = process.env.MODEL_NAME || settings.llm?.model || 'ornith-1.5-35b-a3b';
const apiKey = process.env[settings.llm?.api_key_env || 'LLM_API_KEY'];
const nativeFetch = global.fetch;
global.fetch = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...(options.headers || {}), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) } });
function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function esc(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' })[c]); }
function safeHtml(value) { return String(value || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/on\w+\s*=\s*(['"]).*?\1/gi, ''); }
function runDirs(dir = ROOT) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => { const file = path.join(dir, item.name); if (!item.isDirectory()) return []; if (fs.existsSync(path.join(file, 'live-progress.json'))) return [file]; return runDirs(file); }); }
async function getNarrative(progress, interactions, observations) {
  const prompt = 'You are a senior QA lead and product designer. Create a concise HTML fragment using only h3, p, ul, li, strong, and code. Do not include script, style, links, images, markdown, or unsupported claims. Follow this report design reference: executive summary, clear issue explanation, then a section named Design and usability recommendations. For every recommendation state: observed evidence, specific UI/design improvement, why it improves usability or child safety, and expected user outcome. Prioritize issues observed in the data. Evidence: ' + JSON.stringify({ results: progress.results || [], interactions: interactions.slice(-250), modelObservations: observations.slice(-10) });
  const response = await fetch(modelUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: prompt, stream: false, temperature: 0.2, max_output_tokens: 1800 }) });
  if (!response.ok) throw new Error('model HTTP ' + response.status);
  const body = await response.json(); const content = (body.output && body.output[0] && body.output[0].content) || body.output || body.response || (body.choices && body.choices[0] && body.choices[0].message.content) || '';
  return safeHtml(Array.isArray(content) ? content.map(x => x.text || x.content || '').join('\n') : content);
}
async function main() {
  const dirs = runDirs().sort((left, right) => fs.statSync(left).mtimeMs - fs.statSync(right).mtimeMs); if (!dirs.length) throw new Error('No timestamped scan folder exists. Run the audit first.');
  const dir = dirs[dirs.length - 1], id = path.relative(ROOT, dir).split(path.sep).join('/'), progress = read(path.join(dir, 'live-progress.json'), { results: [], interactions: [], pages: [] }), interactions = read(path.join(dir, 'interaction-results.json'), progress.interactions || []), observations = read(path.join(dir, 'model-observations.json'), []);
  const relative = file => file ? path.relative(dir, file).split(path.sep).join('/') : '';
  const rows = interactions.map(x => ({ status: x.result && x.result.status || 'INFO', component: x.control && (x.control.label || x.control.id) || 'Unknown component', detail: x.result && x.result.detail || '', screenshot: relative(x.screenshot) })).concat((progress.results || []).filter(x => !x.extra || !x.extra.screenshot).map(x => ({ status: x.status, component: x.name, detail: x.detail, screenshot: '' })));
  let modelHtml; try { console.log('[MODEL] Creating HTML QA/design narrative with ' + model); modelHtml = await getNarrative(progress, interactions, observations); } catch (error) { modelHtml = '<p><strong>Model narrative unavailable.</strong> ' + esc(error.message) + '</p>'; }
  const summary = { pages: (progress.pages || []).length, components: interactions.length, passed: rows.filter(x => x.status === 'PASS').length, failed: rows.filter(x => x.status === 'FAIL').length, warnings: rows.filter(x => x.status === 'WARN').length };
  const template = fs.readFileSync(TEMPLATE, 'utf8'); const html = template.replaceAll('{{RUN_ID}}', id).replace('{{GENERATED_AT}}', new Date().toLocaleString()).replace('{{MODEL_HTML}}', modelHtml).replace('{{SUMMARY_JSON}}', JSON.stringify(summary)).replace('{{ROWS_JSON}}', JSON.stringify(rows)).replace('{{MODELS_JSON}}', JSON.stringify(observations));
  const file = path.join(dir, 'interactive-report.html'); fs.writeFileSync(file, html); console.log('Interactive report: ' + file);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { modelUrl, model, settings };
