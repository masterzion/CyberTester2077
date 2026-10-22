const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function assertLocalUrl(value, label = 'test target', allowedProtocols = ['http:', 'https:']) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`[LOCAL-ONLY ERROR] Invalid ${label}`);
  }
  if (url.username || url.password) {
    throw new Error(`[LOCAL-ONLY ERROR] Credentials are not allowed in ${label}`);
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!allowedProtocols.includes(url.protocol) || !LOCAL_HOSTS.has(hostname)) {
    throw new Error(`[LOCAL-ONLY ERROR] Refusing ${label} outside localhost: ${url.origin}${url.pathname}`);
  }
  return url;
}

async function guardLocalContext(context, onViolation) {
  let violation;
  const closeContext = context.close.bind(context);
  const recordViolation = error => {
    if (!violation) {
      violation = error;
      console.error(error.message);
    }
    void closeContext().catch(() => {});
    onViolation?.(violation);
  };
  await context.route('**/*', async route => {
    const url = route.request().url();
    try {
      assertLocalUrl(url, 'browser request');
    } catch (error) {
      recordViolation(error);
      await route.abort('blockedbyclient').catch(() => {});
      return;
    }
    await route.continue();
  });
  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', async route => {
      try {
        assertLocalUrl(route.url(), 'WebSocket request', ['ws:', 'wss:']);
        route.connectToServer();
      } catch (error) {
        recordViolation(error);
        await route.close({ code: 1008, reason: 'local-only test guard' });
      }
    });
  }
  context.close = (...args) => closeContext(...args);
  return { getViolation: () => violation };
}

function installLocalBrowserGuard(chromium) {
  if (chromium.__localOnlyGuardInstalled) return;
  Object.defineProperty(chromium, '__localOnlyGuardInstalled', { value: true });
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (...args) => {
    const browser = await launch(...args);
    const guards = [];
    const closeBrowser = browser.close.bind(browser);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (options = {}) => {
      const context = await newContext({ ...options, serviceWorkers: 'block' });
      guards.push(await guardLocalContext(context, () => { void closeBrowser().catch(() => {}); }));
      return context;
    };
    browser.newPage = async options => {
      const context = await browser.newContext(options || {});
      const page = await context.newPage();
      const closePage = page.close.bind(page);
      page.close = async (...closeArgs) => {
        await closePage(...closeArgs);
        await context.close();
      };
      return page;
    };
    browser.close = async (...closeArgs) => {
      await closeBrowser(...closeArgs);
      const violation = guards.map(guard => guard.getViolation()).find(Boolean);
      if (violation) throw violation;
    };
    return browser;
  };
}

async function localRequestGet(context, value, options = {}) {
  const url = assertLocalUrl(value, 'API request');
  const response = await context.request.get(url.href, { ...options, maxRedirects: 0 });
  assertLocalUrl(response.url(), 'API response');
  const location = response.headers().location;
  if (location) assertLocalUrl(new URL(location, response.url()).href, 'API redirect');
  return response;
}

module.exports = { assertLocalUrl, guardLocalContext, installLocalBrowserGuard, localRequestGet };
