const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

test('apply saves each source before the next request and preserves results across reruns', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'categorizer-persistence-'));
  const source = path.join(dir, 'source'), dest = path.join(dir, 'destination');
  fs.mkdirSync(source); fs.mkdirSync(dest);
  fs.writeFileSync(path.join(source, 'a.md'), 'First unique fact.');
  fs.writeFileSync(path.join(source, 'b.md'), 'Second unique fact.');
  const output = path.join(dest, 'done.md');
  fs.writeFileSync(output, '# Existing documentation\n\nKeep this original content.\n');
  const settings = path.join(dir, 'settings.json');
  fs.writeFileSync(settings, JSON.stringify({documentation: {source_folder: source, destination_folder: dest, destination_files: [{id:'done',file:'done.md',content:'Implemented facts'}]}}));
  let checkedBeforeSecond = 0;
  let reviewRequested = false;
  const models = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(body.reasoning, 'off');
    models.push(body.model);
    if (['classification-test','dedup-test','review-test'].includes(body.model)) assert.ok(body.input.includes('CUSTOM-'+body.model));
    const prompt = body.input;
    if (prompt.includes('STAGE 2:')) {
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({response:JSON.stringify({duplicates:[],recommendations:[]})}));
      return;
    }
    if (prompt.includes('Review documentation against actual code.')) {
      reviewRequested = true;
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({response:JSON.stringify({findings:[{status:'unverified',claim:'Runtime behavior',detail:'Requires runtime verification',evidence:[]}]})}));
      return;
    }
    const first = prompt.includes('Source filename: a.md');
    if (!first && fs.readFileSync(output, 'utf8').includes('First unique fact.')) checkedBeforeSecond++;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({response:JSON.stringify({updates:[{target:'done.md',appendix:first?'First unique fact.':'Second unique fact.'}]})}));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const run = (args=[]) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath,[path.resolve(__dirname,'../temporary-categorize-main-docs.cjs'),'--apply',...args],{env:{...process.env,AUTOMATION_SETTINGS:settings,AUTOMATION_CREDENTIALS:path.join(dir,'absent.yml'),MODEL_URL:`http://127.0.0.1:${server.address().port}`,MODEL_NAME:'mock-persistence-test'}});
    let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
    child.on('error',reject);child.on('close',code=>resolve({code,log}));
  });
  try {
    const first = await run(); assert.equal(first.code,0,first.log);
    assert.equal(checkedBeforeSecond,1,'first appendix must exist on disk before processing second source');
    const content = fs.readFileSync(output,'utf8');
    assert.match(content,/Keep this original content/);
    assert.match(content,/First unique fact/); assert.match(content,/Second unique fact/);
    const second = await run(); assert.equal(second.code,0,second.log);
    assert.equal(fs.readFileSync(output,'utf8'),content,'reruns must not duplicate existing appendices');
    assert.equal(fs.readFileSync(path.join(source,'a.md'),'utf8'),'First unique fact.');
    const config = JSON.parse(fs.readFileSync(settings,'utf8'));
    config.llm = {model_stage1:'classification-test',model_stage2:'dedup-test',model_stage3:'review-test'};
    const {resolvePrompt}=require('../stage-prompts.cjs');
    config.prompts={stage1:resolvePrompt('stage1')+'\nCUSTOM-classification-test',stage2:resolvePrompt('stage2')+'\nCUSTOM-dedup-test',stage3:resolvePrompt('stage3')+'\nCUSTOM-review-test'};
    config.code = {source_folder:[source],code_review:true,source_read_only:true};
    fs.writeFileSync(settings,JSON.stringify(config));
    const reviewed = await run(); assert.equal(reviewed.code,0,reviewed.log);
    assert.deepEqual(models.slice(-4),['classification-test','classification-test','dedup-test','review-test']);
    assert.equal(reviewRequested,true);
    const afterReview = fs.readFileSync(output,'utf8');
    assert.match(afterReview,/Code implementation review/);
    assert.match(afterReview,/UNVERIFIED: Runtime behavior/);
    assert.ok(afterReview.startsWith(content));
    reviewRequested = false;
    config.documentation.source_folder = path.join(dir,'missing-source-documents');
    fs.writeFileSync(settings,JSON.stringify(config));
    const only = await run(['--stage3-only']);
    assert.equal(only.code,0,only.log);
    assert.equal(reviewRequested,true);
    assert.doesNotMatch(only.log,/\[STAGE [12]\//);
    console.log('Verified: saved before next source; existing content preserved; rerun unchanged.');
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
