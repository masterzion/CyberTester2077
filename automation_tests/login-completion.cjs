/** Complete the identity-provider redirect before exploring application controls. */
const { assertLocalUrl, localRequestGet } = require('./local-only.cjs');

async function completeLogin(page, appOrigin, remaining) {
  assertLocalUrl(appOrigin, 'application origin');
  if (new URL(page.url()).origin !== appOrigin) {
    const consent = page.getByRole('button', { name: 'Continue', exact: true });
    await consent.waitFor({ state: 'visible', timeout: remaining() });
    await Promise.all([
      page.waitForURL(url => url.origin === appOrigin, { timeout: remaining(), waitUntil: 'domcontentloaded' }),
      consent.click({ timeout: remaining() }),
    ]);
  }
  const url = new URL(page.url());
  if (url.origin !== appOrigin || /^\/auth(?:\/|$)/.test(url.pathname))
    throw new Error('Login did not reach an authenticated application page');
  const response = await localRequestGet(page.context(), appOrigin + '/api/session', { timeout: remaining() });
  if (response.status() === 404) return; // Other audited applications may not expose this optional contract.
  if (!response.ok()) throw new Error('Application session validation failed');
  const session = await response.json();
  if (session.authenticated === false || !(session.user?.id || session.user?.sub))
    throw new Error('Application session is not authenticated');
}
module.exports = { completeLogin };
