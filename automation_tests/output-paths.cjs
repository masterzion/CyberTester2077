const path = require('node:path');
const safePathPart = value => String(value || 'unknown').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
function newRunId(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().replace(/Z$/, '').replace(/[:.]/g, '-');
}
function accountFolder(name, email) {
  const value = name || String(email || '').split('@')[0].replace(/[.-]\d{10,}$/, '');
  return safePathPart(value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
}
function outputDirectory(root, run, role, name, email, platform = 'web', profile = '') {
  return path.join(root, safePathPart(run), safePathPart(role), accountFolder(name,email), safePathPart(platform) + (profile ? '-'+safePathPart(profile) : ''));
}
module.exports = {newRunId, outputDirectory};
