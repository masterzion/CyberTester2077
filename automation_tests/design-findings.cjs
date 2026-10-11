'use strict';
const categories=['broken design','design improvement'];
function designFindings(observations,relative) {
 const seen=new Map(), findings=[];
 for(const observation of observations) for(const item of (Array.isArray(observation.plan?.designFindings)?observation.plan.designFindings:[])) {
  if(!item || !categories.includes(item.category) || !['component','evidence','suggestion'].every(k=>typeof item[k]==='string' && item[k].trim())) continue;
  const key=JSON.stringify([item.category,item.component,item.evidence,item.suggestion]);
  const occurrence={url:observation.url||'',at:observation.at,screenshot:relative(observation.screenshot)};
  if(seen.has(key)) {
    const existing=seen.get(key);
    if(!existing.occurrences.some(entry=>entry.url===occurrence.url)) existing.occurrences.push(occurrence);
    continue;
  }
  const finding={category:item.category,component:item.component,evidence:item.evidence,suggestion:item.suggestion,...occurrence,occurrences:[occurrence],verification:'Model observation — review evidence'};
  seen.set(key,finding);
  findings.push(finding);
 }
 return findings.sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
}
module.exports={designFindings};
