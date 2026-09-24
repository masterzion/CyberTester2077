const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const defaults = YAML.parse(fs.readFileSync(path.join(__dirname, 'stage-prompts.yml'), 'utf8')).prompts;
function resolvePrompt(stage, configured = {}) {
  const value = configured?.[stage] ?? defaults[stage];
  if (typeof value !== 'string' || !value.trim()) throw new Error('prompts.' + stage + ' must be non-empty text');
  return value;
}
module.exports = { resolvePrompt };
