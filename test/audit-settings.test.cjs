const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('browser audit resolves its effective values from automation settings', () => {
  const keys = ['APP_URL', 'MODEL_URL', 'MODEL_NAME', 'HEADLESS', 'AUDIT_MAX_PAGES', 'AUDIT_MAX_ACTIONS_PER_PAGE', 'AUDIT_ACTION_TIMEOUT_MS', 'AUDIT_MAX_DOCUMENTS'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  const auditPath = path.resolve(__dirname, '..', 'automation_tests', 'child-interface-audit.cjs');
  delete require.cache[auditPath];
  const { cfg, settings, DOCS_ROOT } = require(auditPath);
  for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value;

  assert.equal(cfg.appUrl, settings.web.app_url);
  assert.equal(cfg.modelUrl, settings.llm.endpoint);
  assert.equal(cfg.model, settings.llm.model);
  assert.equal(cfg.headless, settings.web.headless);
  assert.equal(cfg.maxPages, settings.web.max_pages);
  assert.equal(cfg.maxActions, settings.web.max_actions_per_page);
  assert.equal(cfg.actionTimeoutMs, settings.web.action_timeout_ms);
  assert.equal(cfg.maxDocumentationDocs, settings.documentation.max_documents_per_page);
  assert.equal(DOCS_ROOT, path.resolve(path.dirname(__dirname), settings.documentation.destination_folder));
});

test('HTML reporter uses the configured LLM endpoint and model', () => {
  const savedModel = process.env.MODEL_NAME;
  const savedUrl = process.env.MODEL_URL;
  delete process.env.MODEL_NAME;
  delete process.env.MODEL_URL;
  const reporterPath = path.resolve(__dirname, '..', 'automation_tests', 'generate-html-report.cjs');
  delete require.cache[reporterPath];
  const reporter = require(reporterPath);
  savedModel === undefined ? delete process.env.MODEL_NAME : process.env.MODEL_NAME = savedModel;
  savedUrl === undefined ? delete process.env.MODEL_URL : process.env.MODEL_URL = savedUrl;

  assert.equal(reporter.model, reporter.settings.llm.model);
  assert.equal(reporter.modelUrl, reporter.settings.llm.endpoint);
});
