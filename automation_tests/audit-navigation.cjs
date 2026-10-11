'use strict';

// DEV routes compile on first access; keep an explicit bounded traversal budget.
async function navigate(page, url, timeout = 60000, downloadTimeout = timeout) {
  let receive;
  const download = new Promise(resolve => { receive = resolve; });
  page.on('download', receive);
  let timer;
  try {
    try {
      const response = await page.goto(url, {waitUntil:'domcontentloaded', timeout});
      if (response && response.status() >= 400) throw new Error(`Navigation returned HTTP ${response.status()}`);
      return {kind:'page'};
    } catch (error) {
      if (!/Download is starting/.test(error.message)) throw error;
      const item = await Promise.race([download, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Download did not start within navigation timeout')), timeout);
      })]);
      clearTimeout(timer);
      let failure;
      try {
        failure = await Promise.race([item.failure(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Download completion timed out')), downloadTimeout);
        })]);
      } catch (error) {
        await item.cancel();
        throw error;
      }
      if (failure) throw new Error('Download failed: ' + failure);
      return {kind:'download', filename:item.suggestedFilename()};
    }
  } finally {
    clearTimeout(timer);
    page.off('download', receive);
  }
}
module.exports = {navigate};
