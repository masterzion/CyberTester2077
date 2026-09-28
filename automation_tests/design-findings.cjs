'use strict';
const categories=['broken design','design improvement'];
function designFindings(observations,relative) {
 const seen=new Set(), findings=[];
 for(const observation of observations) for(const item of (Array.isArray(observation.plan?.designFindings)?observation.plan.designFindings:[])) {
  if(!item || !categories.includes(item.category) || !['component','evidence','suggestion'].every(k=>typeof item[k]==='string' && item[k].trim())) continue;
  const key=JSON.stringify([observation.url,item.category,item.component,item.evidence]);
  if(seen.has(key)) continue; seen.add(key);
  findings.push({category:item.category,component:item.component,evidence:item.evidence,suggestion:item.suggestion,url:observation.url||'',at:observation.at,screenshot:relative(observation.screenshot),verification:'Model observation — review evidence'});
 }
 return findings.sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
}
module.exports={designFindings};
