'use strict';
// Never persist request payloads, headers, signed queries, or response bodies.
function attachNetworkEvidence(page, record) {
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText || '';
    // Aborted navigation is expected when links initiate downloads or supersede pages.
    if (failure === 'net::ERR_ABORTED') return;
    const code = failure.match(/^net::ERR_[A-Z_]+$/)?.[0] || 'NETWORK_REQUEST_FAILED';
    const endpoint = new URL(request.url());
    record('error', `${code} ${request.method()} ${endpoint.origin}${endpoint.pathname}`, page.url());
  });
  page.on('response', response => {
    if(response.status()<400) return;
    const endpoint=new URL(response.url());
    record('error', `HTTP ${response.status()} ${response.request().method()} ${endpoint.origin}${endpoint.pathname}`, page.url());
  });
}
module.exports={attachNetworkEvidence};
