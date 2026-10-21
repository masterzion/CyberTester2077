const OPERATOR_ROLES = new Set(['root', 'review', 'event_add']);

function accountTarget(account, settings, env = process.env) {
  const admin = OPERATOR_ROLES.has(account.role);
  const appUrl = admin
    ? env.ADM_APP_URL || settings.admin?.app_url || 'http://localhost:3040'
    : env.APP_URL || settings.web?.app_url || 'http://localhost:3002';
  return { admin, appUrl };
}

module.exports = { accountTarget };
