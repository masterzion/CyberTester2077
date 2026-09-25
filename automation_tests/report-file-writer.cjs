'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {setTimeout:delay} = require('node:timers/promises');
const pending = new Map();

async function replaceReport(file, html, io = fs, sleep = delay) {
  const temporary = file + '.' + process.pid + '.' + randomUUID() + '.tmp';
  try {
    await io.writeFile(temporary, html, {encoding:'utf8',flag:'wx'});
    for (let attempt=0;;attempt++) {
      try { await io.rename(temporary,file); break; }
      catch(error) {
        if (!['EPERM','EACCES','EBUSY'].includes(error.code) || attempt>=6) throw error;
        await sleep(Math.min(50 * 2 ** attempt, 500));
      }
    }
  } finally {
    // Never delete/truncate the existing report: readers retain the last good version.
    await io.unlink(temporary).catch(error => {if(error.code!=='ENOENT') throw error;});
  }
}

function writeReport(file, html) {
  const key=path.resolve(file);
  const task=(pending.get(key) || Promise.resolve()).catch(()=>{}).then(()=>replaceReport(key,html));
  pending.set(key,task);
  const cleanup=()=>{if(pending.get(key)===task) pending.delete(key);};
  task.then(cleanup,cleanup);
  return task;
}
module.exports={writeReport,replaceReport};
