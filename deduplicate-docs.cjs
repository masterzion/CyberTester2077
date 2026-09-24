const { resolvePrompt } = require('./stage-prompts.cjs');
function duplicatePrompt(name, text, instructionsText) {
  const blocks = text.split(/\r?\n\s*\r?\n/);
  return [
    instructionsText || resolvePrompt('stage2'),
    'Filename: '+name,
    'Blocks: '+JSON.stringify(blocks.map((text,index)=>({index,text})))
  ].join('\n\n');
}
function applyDuplicates(text, plan) {
  if (!Array.isArray(plan?.duplicates)) throw new Error('Stage 2 model returned no duplicates array');
  const blocks=text.split(/\r?\n\s*\r?\n/), removed=new Set(), skipped=[];
  const normalize=s=>s.replace(/\s+/g,' ').trim();
  for(const item of plan.duplicates) {
    const {remove,keep}=item;
    if(!Number.isInteger(remove)||!Number.isInteger(keep)||keep<0||remove>=blocks.length||keep>=remove||removed.has(keep)||removed.has(remove)) { skipped.push(item); continue; }
    const block=blocks[remove];
    if(!block?.trim()||/^\s*(#|<!--)/.test(block)||/```|~~~/.test(text)||normalize(block)!==normalize(blocks[keep])) { skipped.push(item); continue; }
    removed.add(remove);
  }
  return {text:removed.size?blocks.filter((_,i)=>!removed.has(i)).join('\n\n'):text,removed:removed.size,skipped,recommendations:plan.recommendations||[]};
}
module.exports={duplicatePrompt,applyDuplicates};
