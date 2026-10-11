const OPERATOR_ROLES = new Set(['root', 'review', 'event_add']);

function accountTarget(account, settings, env = process.env) {
  const admin = OPERATOR_ROLES.has(account.role);
  const appUrl = admin
    ? env.ADM_APP_URL || settings.admin?.app_url || 'https://adm.viafactor.com'
    : env.APP_URL || settings.web?.app_url || 'http://127.0.0.1:3000';
  return { admin, appUrl };
}

module.exports = { accountTarget };
