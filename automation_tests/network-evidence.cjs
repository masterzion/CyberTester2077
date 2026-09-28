'use strict';
// Never persist request payloads, headers, signed queries, or response bodies.
function attachNetworkEvidence(page, record) {
  page.on('response', response => {
    if(response.status()<400) return;
    const endpoint=new URL(response.url());
    record('error', `HTTP ${response.status()} ${response.request().method()} ${endpoint.origin}${endpoint.pathname}`, page.url());
  });
}
module.exports={attachNetworkEvidence};
