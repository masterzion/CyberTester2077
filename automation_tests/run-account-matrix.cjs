/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..');
const settingsFile = process.env.AUTOMATION_SETTINGS || (fs.existsSync(path.join(__dirname, 'automation-settings.yml')) ? path.join(__dirname, 'automation-settings.yml') : path.join(__dirname, 'automation-settings.yml.example'));
const credentialsFile = process.env.AUTOMATION_CREDENTIALS || path.join(__dirname, 'credentials.yml');
const settings = YAML.parse(fs.readFileSync(settingsFile, 'utf8')) || {};
const safePathPart = value => String(value || 'unknown').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const requested = new Set(process.argv.slice(2));
const includeWeb = !requested.size || requested.has('--web');
const includeMobile = !requested.size || requested.has('--mobile');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}
function invoke(script, env) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit' });
  return result.status === 0;
}
function runAudit(account, platform, profile) {
  const password = account.password_env ? process.env[account.password_env] : account.password;
  if (!password) {
    console.error('[SKIP] ' + account.name + ' (' + platform + '): missing secret ' + (account.password_env || 'password'));
    return { status: 'SKIP', output: null };
  }
  const env = {
    AUDIT_RUN_ID: runId,
    AUDIT_PLATFORM: platform,
    AUDIT_SCREEN_PROFILE: profile?.name || '',
    AUDIT_SCREEN_WIDTH: profile?.width ? String(profile.width) : '',
    AUDIT_SCREEN_HEIGHT: profile?.height ? String(profile.height) : '',
    CHILD_EMAIL: account.email,
    CHILD_PASSWORD: password,
    AUDIT_ACCOUNT_NAME: account.name,
    AUDIT_ACCOUNT_ROLE: account.role,
    AUDIT_ACCOUNT_DESCRIPTION: account.description || ''
  };
  console.log('\n[START] ' + platform + (profile ? ' / ' + profile.name : '') + ' — ' + account.name + ' (' + account.role + ')');
  const passed = invoke('child-interface-audit.cjs', env);
  const output = path.join(__dirname, runId + '-' + safePathPart(account.role), safePathPart(account.email), platform + (profile ? '-' + safePathPart(profile.name) : ''));
  if (fs.existsSync(output)) invoke('generate-html-report.cjs', { REPORT_RUN_DIR: output });
  return { status: passed ? 'PASS' : 'FAIL', output };
}

function main() {
  if (!fs.existsSync(credentialsFile)) throw new Error('Credentials file not found: ' + credentialsFile + '. Copy credentials.yml.example to credentials.yml and set its password_env values in .env.');
  loadDotEnv();
  const accounts = (YAML.parse(fs.readFileSync(credentialsFile, 'utf8')) || {}).accounts;
  if (!Array.isArray(accounts)) throw new Error('credentials.yml must contain an accounts list.');
  const profiles = Array.isArray(settings.mobile?.screen_profiles) ? settings.mobile.screen_profiles : [];
  console.log('[CONFIG] settings=' + settingsFile + ' credentials=' + credentialsFile + ' app_url=' + (settings.web?.app_url || '') + ' model=' + (settings.llm?.model || '') + ' mobile_enabled=' + (settings.mobile?.enabled === true) + ' mobile_profiles=' + profiles.map(profile => profile.name + ':' + profile.width + 'x' + profile.height).join(','));
  const results = [];
  for (const account of accounts) {
    if (!account.name || !account.role || !account.email) { console.error('[SKIP] invalid account entry'); continue; }
    if (includeWeb && account.runtest_web === true) results.push({ account: account.name, platform: 'web', ...runAudit(account, 'web') });
    if (includeMobile && account.runtest_mobile === true) {
      if (settings.mobile?.enabled !== true) { console.warn('[SKIP] mobile disabled in automation settings: ' + account.name); continue; }
      if (!profiles.length) { console.warn('[SKIP] no mobile screen profiles configured: ' + account.name); continue; }
      for (const profile of profiles) results.push({ account: account.name, platform: 'mobile/' + profile.name, ...runAudit(account, 'mobile', profile) });
    }
  }
  const failed = results.filter(item => item.status === 'FAIL').length;
  const skipped = results.filter(item => item.status === 'SKIP').length;
  const manifest = path.join(__dirname, runId + '-account-matrix.json');
  fs.writeFileSync(manifest, JSON.stringify({ runId, settingsFile, credentialsFile, results }, null, 2));
  console.log('\nAccount matrix: ' + manifest + '\nPassed: ' + results.filter(item => item.status === 'PASS').length + ', failed: ' + failed + ', skipped: ' + skipped);
  if (failed || skipped) process.exitCode = 1;
}
main();
