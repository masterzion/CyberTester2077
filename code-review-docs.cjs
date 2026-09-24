const { resolvePrompt } = require('./stage-prompts.cjs');
const fs = require('node:fs');
const path = require('node:path');
const extensions = new Set('.js .cjs .mjs .ts .tsx .jsx .py .go .rs .java .cs .sql .prisma .json .yaml .yml .toml .sh .ps1 .md'.split(' '));
const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'vendor', '__pycache__']);
function inside(root, file) { const rel = path.relative(root, file); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)); }
function createReader(folders) {
  const roots = folders.map(folder => fs.realpathSync(folder));
  const files = new Map();
  roots.forEach((root, index) => {
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
        if (entry.isSymbolicLink() || ignored.has(entry.name) || /^(\.env|credentials|secrets?)(\.|$)/i.test(entry.name)) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile() && extensions.has(path.extname(file).toLowerCase())) files.set(index + '/' + path.relative(root,file).split(path.sep).join('/'), file);
      }
    }
    walk(root);
  });
  function lines(id) {
    if (!files.has(id)) throw new Error('Unknown code file id');
    const file = fs.realpathSync(files.get(id));
    if (!inside(roots[Number(id.split('/')[0])],file)) throw new Error('Code path escaped configured root');
    if (fs.statSync(file).size > 1024 * 1024) throw new Error('File exceeds 1 MiB read limit');
    return fs.readFileSync(file,'utf8').split(/\r?\n/);
  }
  function execute(request) {
    const query = String(request.query || '').toLowerCase();
    if (request.op === 'find') {
      const matches = [...files.keys()].filter(id=>id.toLowerCase().includes(query));
      const offset = Math.max(0,Number(request.offset)||0);
      return {matches:matches.slice(offset,offset+100),total:matches.length,offset};
    }
    if (request.op === 'read') {
      const content = lines(request.file), start = Math.max(1, Math.trunc(Number(request.start)||1));
      const end = Math.min(content.length,start+119,Math.max(start,Math.trunc(Number(request.end)||start+119)));
      const excerpt = content.slice(start-1,end).map((text,i)=>({file:request.file,line:start+i,text:text.slice(0,1500)}));
      return {lines:excerpt,totalLines:content.length,truncated:excerpt.some((line,i)=>content[start+i-1].length>1500)};
    }
    if (request.op === 'grep') {
      if (!query) throw new Error('grep requires a literal query');
      const matches = [], skipped = [];
      for (const id of files.keys()) {
        if (request.file && id !== request.file) continue;
        try { for (const [i,text] of lines(id).entries()) if (text.toLowerCase().includes(query)) { matches.push({file:id,line:i+1,text:text.slice(0,1500)}); if(matches.length===80) return {lines:matches,truncated:true,skipped}; } }
        catch(error) { skipped.push({file:id,error:error.message}); }
      }
      return {lines:matches,truncated:false,skipped};
    }
    throw new Error('Only find, grep and read operations are available');
  }
  return {roots,files,execute};
}
async function reviewDocument(target, reader, ask, instructionsText) {
  const evidence = new Set(), history = [];
  const instructions = [
    instructionsText || resolvePrompt('stage3'),
    'Roots: '+JSON.stringify(reader.roots.map((folder,index)=>({id:index,folder}))),
    'Document: '+target.name+'\nPurpose: '+target.purpose+'\n'+target.text
  ].join('\n\n');
  for (let round=0;round<=12;round++) {
    console.log('\n[CODE REVIEW] '+target.name+' — model round '+round+'/12');
    const result = await ask(instructions+'\nRound '+round+'/12\nTool history: '+JSON.stringify(history));
    const plan = result.plan;
    if (Array.isArray(plan?.findings)) {
      return plan.findings.map(f => {
        const citations = Array.isArray(f.evidence) ? f.evidence.filter(e=>evidence.has(e.file+':'+e.line)) : [];
        let status = ['implemented','partial','todo','recommended','divergent','unverified'].includes(f.status) ? f.status : 'unverified';
        if (!citations.length && status !== 'recommended') status='unverified';
        return {status,claim:String(f.claim||''),detail:String(f.detail||''),evidence:citations};
      });
    }
    if (round===12 || !Array.isArray(plan?.requests) || !plan.requests.length) throw new Error('Code review returned no valid findings or read requests');
    for (const request of plan.requests.slice(0,4)) {
      console.log('[READ ONLY] '+JSON.stringify(request));
      let result;
      try { result=reader.execute(request); for(const line of result.lines||[]) evidence.add(line.file+':'+line.line); }
      catch(error) { result={error:error.message}; }
      history.push({request,result});
    }
  }
}
function renderReview(findings, roots) {
  return '\n\n## Code implementation review — '+new Date().toISOString()+'\n\nStatic review of: '+roots.join(', ')+'. Runtime behavior was not executed.\n\n'+findings.map(f=>'### '+f.status.toUpperCase()+': '+f.claim+'\n\n'+f.detail+'\n\nEvidence: '+(f.evidence.map(e=>'`'+e.file+':'+e.line+'`').join(', ')||'No code citation; requires verification.')+'\n').join('\n');
}
module.exports={createReader,reviewDocument,renderReview,inside};
