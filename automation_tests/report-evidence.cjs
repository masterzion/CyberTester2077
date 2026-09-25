'use strict';
function evidenceRows(interactions,results,consoleEvents,relative) {
  const steps=interactions.map(x=>{
    const matched=results.find(r=>x.screenshot && r.extra?.screenshot===x.screenshot);
    const epoch=String(x.screenshot || '').match(/[\\/](\d{13})-/)?.[1];
    const at=x.at || matched?.at || (epoch ? new Date(Number(epoch)).toISOString() : null);
    const developer=/open issues overlay|copy error info|component stack|open.*editor|ignore-listed frame/i.test(x.control?.label || '');
    return {at,status:developer?'INFO':x.result?.status || 'INFO',component:x.control?.label || x.control?.id || 'Unknown component',detail:developer?'Historical developer-overlay interaction; not an application test. '+(x.result?.detail || ''):x.result?.detail || '',url:x.pageUrl || '',screenshot:relative(x.screenshot)};
  });
  const events=results.filter(x=>!x.extra?.screenshot && !x.extra?.consoleEvent).map(x=>({at:x.at,status:x.status,component:x.name,detail:x.detail,url:x.extra?.url || '',screenshot:''}));
  const errors=consoleEvents.filter(x=>['error','pageerror','warning','warn'].includes(x.level)).map(x=>({at:x.at,status:['error','pageerror'].includes(x.level)?'FAIL':'WARN',component:'Browser '+x.level,detail:x.text || x.message || '',url:x.url || '',screenshot:''}));
  return [...steps,...events,...errors];
}
module.exports={evidenceRows};
