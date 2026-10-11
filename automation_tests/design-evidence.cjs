'use strict';

// Only designated content participates: header polling and unrelated busy widgets
// must not prevent an otherwise usable public page from being inspected.
async function readDesignState(page) {
  return page.evaluate(() => {
    const roots = [...document.querySelectorAll('main, [role="main"]')];
    const scopes = roots.length ? roots : [document.body];
    const visible = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    const markers = scopes.flatMap(root => [root, ...root.querySelectorAll('[data-session-state]')]).filter(visible);
    if (markers.some(element => element.dataset.sessionState === 'unavailable')) return 'unavailable';
    if (markers.some(element => element.dataset.sessionState === 'restoring')) return 'restoring';
    // ARIA fallback applies to the content root itself, never every busy child.
    if (scopes.some(root => visible(root) && root.getAttribute('aria-busy') === 'true')) return 'restoring';
    return visible(document.body) ? 'ready' : 'restoring';
  });
}

const replacedContext = error => /Execution context was destroyed|Cannot find context with specified id|context.*destroyed/i.test(error.message);

async function contentIdentity(page) {
  return page.evaluate(() => {
    const roots = [...document.querySelectorAll('main, [role="main"]')];
    const scopes = roots.length ? roots : [document.body];
    const content = scopes.map(root => {
      const clone = root.cloneNode(true);
      // These are not the designated settled content. Preserve ordinary content
      // changes, but exclude hydration payloads and explicitly busy subwidgets.
      clone.querySelectorAll('script, style, [aria-busy="true"]:not([data-session-state])').forEach(node => node.remove());
      return clone.outerHTML;
    });
    return JSON.stringify([location.href, performance.timeOrigin, content]);
  });
}

async function bounded(operation, deadline) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {timer = setTimeout(() => reject(Object.assign(new Error('Design evidence budget exhausted'), {designDeadline:true})), Math.max(1,deadline-Date.now()));})
    ]);
  } finally {clearTimeout(timer);}
}

async function captureDesignEvidence(page, {timeoutMs, discover, screenshot}) {
  const deadline = Date.now() + timeoutMs;
  let reason = 'Content readiness budget exhausted';
  while (Date.now() < deadline) {
    try {
      const state = await bounded(() => readDesignState(page), deadline);
      if (state === 'unavailable') return {status: 'failed', reason: 'Design content session is unavailable'};
      if (state === 'ready') {
        const url = page.url();
        const before = await bounded(() => contentIdentity(page), deadline);
        const html = await bounded(() => page.content(), deadline);
        const text = await bounded(() => page.locator('body').innerText({timeout: Math.max(1, deadline - Date.now())}), deadline);
        const title = await bounded(() => page.title(), deadline);
        const controls = await bounded(() => discover(page, Math.max(1,deadline-Date.now())), deadline);
        const image = await bounded(() => screenshot(Math.max(1, deadline - Date.now())), deadline);
        const after = await bounded(() => readDesignState(page), deadline);
        if (after === 'unavailable') return {status: 'failed', reason: 'Design content session became unavailable during capture'};
        if (after === 'ready' && page.url() === url && await bounded(() => contentIdentity(page), deadline) === before && Date.now() < deadline) {
          if (!image) return {status: 'incomplete', reason: 'Design screenshot unavailable'};
          return {status: 'ready', evidence: {url, title, html, text, controls, screenshot: image}};
        }
        reason = 'Document changed during design evidence capture';
      }
    } catch (error) {
      if (error.designDeadline) return {status:'incomplete', reason:'Design evidence budget exhausted'};
      if (page.isClosed() || !replacedContext(error)) throw error;
      reason = 'Document context replaced during design evidence capture';
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) await page.waitForTimeout(Math.min(50, remaining));
  }
  return {status: 'incomplete', reason};
}

module.exports = {readDesignState, contentIdentity, captureDesignEvidence};
