'use strict';
function completeAudit(results, target = process) {
  if (results.some(result => result.status === 'FAIL')) {
    target.exitCode = 1;
    return 'failed';
  }
  return 'completed';
}
module.exports = { completeAudit };
