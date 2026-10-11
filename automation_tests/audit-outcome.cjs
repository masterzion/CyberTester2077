'use strict';
function completeAudit(results, target = process) {
  if (results.some(result => result.status === 'FAIL')) {
    target.exitCode = 1;
    return 'failed';
  }
  if (results.some(result => result.outcomeVerified === false || result.extra?.outcomeVerified === false)) {
    target.exitCode = 1;
    return 'incomplete';
  }
  return 'completed';
}
module.exports = { completeAudit };
