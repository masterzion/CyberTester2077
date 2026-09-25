'use strict';
const path = require('node:path');
const {selectImages} = require('./upload-images.cjs');

const forbidden = /\b(language|locale|translate|translation|logout|log out|sign out|signoff|switch account|delete|remove|destroy|purchase|buy|pay|subscribe|unsubscribe|reset password|revoke|dev tools)\b/i;
const submitWords = /\b(save|send|post|publish|share|submit|create|add|apply|confirm)\b/i;
function exclusion(c) {
  if (c.tag === 'select' && /child|family|recipient|account|supervised feed/i.test([c.label,c.ariaLabel,c.name,...(c.options || []).map(o=>o.text)].join(' '))) return 'keep current account, family and recipient scope';
  if (c.languageControl || forbidden.test([c.label,c.ariaLabel,c.name,c.href].join(' '))) return 'protected language/session/destructive control';
  if (['password','hidden'].includes(c.type)) return 'protected input';
  return '';
}
function isSubmit(c) { return c.type === 'submit' || (c.tag === 'button' && submitWords.test(c.label || c.ariaLabel || '')); }
function isInput(c) { return c.editable || c.tag === 'textarea' || c.tag === 'select' || (c.tag === 'input' && !['button','submit','hidden','password','reset'].includes(c.type)); }
function priority(c) { return exclusion(c) ? 100 : isInput(c) ? 0 : isSubmit(c) ? 1 : 2; }
function inputValue(c, proposed, marker) {
  if (typeof proposed === 'string') return proposed;
  const today = new Date().toISOString().slice(0,10);
  if (c.type === 'email') return 'qa@example.test';
  if (c.type === 'url') return 'https://example.test';
  if (['number','range'].includes(c.type)) return String(c.min || (Number(c.max) < 1 && c.max ? c.max : '1'));
  if (c.type === 'date') return c.min || today;
  if (c.type === 'datetime-local') return (c.min || today+'T12:00');
  if (c.type === 'time') return c.min || '12:00';
  if (c.type === 'month') return today.slice(0,7);
  if (c.type === 'week') return today.slice(0,4)+'-W01';
  if (c.type === 'color') return '#336699';
  if (c.type === 'tel') return '2025550100';
  return marker.slice(0, c.maxLength > 0 ? c.maxLength : undefined);
}
async function discoverControls(page) {
  return page.locator('a,button,input,textarea,select,[role=button],[role=link],[role=checkbox],[role=radio],[contenteditable=true]').evaluateAll(nodes => nodes.map((node,index) => {
    const get = key => node.getAttribute(key) || '';
    const box = node.getBoundingClientRect();
    node.setAttribute('data-child-audit-id',String(index));
    const languageRegion = node.closest('[role=menu],[role=listbox]');
    return {id:'control-'+index,selector:'[data-child-audit-id="'+index+'"]',tag:node.tagName.toLowerCase(),type:get('type'),
      label:(get('aria-label') || node.labels?.[0]?.innerText || get('placeholder') || node.innerText || '').trim().replace(/\s+/g,' ').slice(0,220),
      ariaLabel:get('aria-label'),name:get('name'),href:get('href'),editable:node.isContentEditable,role:get('role'),
      languageControl:!!languageRegion && /language|locale/i.test(languageRegion.getAttribute('aria-label') || ''),
      visible:!!(box.width && box.height && getComputedStyle(node).visibility!=='hidden' && getComputedStyle(node).display!=='none'),
      disabled:!!node.disabled || get('aria-disabled')==='true',min:get('min'),max:get('max'),maxLength:node.maxLength,accept:get('accept'),
      options:node.tagName==='SELECT'?Array.from(node.options).map(o=>({value:o.value,text:o.text,selected:o.selected,disabled:o.disabled})):[]};
  }));
}
async function closeBlockingMenus(page, target) {
  const menus = page.locator('[role=menu]:visible,[role=listbox]:visible');
  if (!await menus.count()) return;
  const inside = await target.evaluate(node => !!node.closest('[role=menu],[role=listbox]')).catch(()=>false);
  if (inside) return;
  await page.keyboard.press('Escape');
  // Do not force a click if the overlay did not close.
  await menus.first().waitFor({state:'hidden'});
}
async function probeEmptySubmission(page, c, timeout) {
  const el=page.locator(c.selector).first();
  const state=await el.evaluate(button=>{
    let scope=button.form || button.parentElement;
    const fields='textarea,input:not([type=hidden]):not([type=submit]):not([type=button]),[contenteditable=true],select';
    while(scope && !scope.querySelector(fields) && scope.tagName!=='BODY') scope=scope.parentElement;
    if(!scope || scope.tagName==='BODY') return null;
    const inputs=Array.from(scope.querySelectorAll(fields));
    // Never erase existing drafts, attachments, defaults, or account selections.
    const text=inputs.filter(n=>n.matches('textarea,[contenteditable=true],input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color])'));
    if(!text.length || text.some(n=>(n.isContentEditable?n.textContent:n.value).trim())) return null;
    if(inputs.some(n=>n.type==='file' && n.files.length)) return null;
    const scopeId=button.getAttribute('data-child-audit-id');
    scope.setAttribute('data-audit-empty-scope',scopeId);
    return {nativeValidation:!!button.form && !button.form.noValidate && !button.formNoValidate,scopeSelector:'[data-audit-empty-scope="'+scopeId+'"]',required:inputs.filter(n=>n.required || n.getAttribute('aria-required')==='true').map(n=>n.getAttribute('aria-label') || n.name || n.getAttribute('placeholder') || n.tagName),
      invalid:inputs.filter(n=>n.validity && !n.validity.valid).length};
  });
  if(!state) return null;
  if(c.disabled) return {status:'PASS',detail:'Empty-input check: submit is disabled while fields are empty; individual required-field rules are not yet confirmed',scenario:'empty',requiredFields:state.required};
  await closeBlockingMenus(page,el);
  await el.scrollIntoViewIfNeeded({timeout});
  const before=await page.locator('body').innerText();
  await el.click({timeout});
  const browserErrors=await page.locator(state.scopeSelector).locator(':invalid').evaluateAll(nodes=>nodes.map(n=>({field:n.name || n.getAttribute('placeholder') || n.tagName,message:n.validationMessage})).filter(n=>n.message));
  if(state.nativeValidation && browserErrors.length) return {status:'PASS',detail:'Empty-input check: browser blocked submission with validation: '+JSON.stringify(browserErrors),scenario:'empty',requiredFields:state.required};
  try {
    await page.waitForFunction(previous=>Array.from(document.querySelectorAll('[role=alert],[role=status],[aria-invalid=true],[data-sonner-toast]')).some(n=>n.getClientRects().length && (n.getAttribute('aria-invalid')==='true' || (n.textContent.trim() && !previous.includes(n.textContent.trim())))),before,{timeout});
  } catch(error) {if(error.name!=='TimeoutError')throw error;}
  const messages=(await page.locator('[role=alert],[role=status],[data-sonner-toast]').allTextContents()).map(s=>s.trim()).filter(s=>s && !before.includes(s)).join(' | ');
  if(/required|empty|enter|provide|cannot be blank/i.test(messages) || await page.locator('[aria-invalid=true]:visible').count()) return {status:'PASS',detail:'Empty-input check: application displayed validation. '+messages,scenario:'empty',requiredFields:state.required};
  if(/saved|sent|posted|published|created|success/i.test(messages)) return {status:state.required.length?'FAIL':'WARN',detail:'Empty-input check: application accepted the submission. '+(state.required.length?'Declared required fields were empty. ':'Confirm whether empty content is allowed. ')+messages,scenario:'empty',requiredFields:state.required};
  return {status:'WARN',detail:'Empty-input check attempted; required-field validation could not be confirmed. '+messages,scenario:'empty',requiredFields:state.required};
}
async function performInteraction(page, c, guided, timeout, marker, uploadSettings) {
  const blocked = exclusion(c);
  if (blocked) return {status:'SKIP',detail:blocked};
  if (guided?.action === 'observe') return {status:'SKIP',detail:'model requested observation: '+(guided.reason || '')};
  const el = page.locator(c.selector).first();
  await closeBlockingMenus(page,el);
  if (c.type !== 'file') await el.scrollIntoViewIfNeeded({timeout});
  if (c.type === 'file') {
    const attributes=await el.evaluate(node=>({accept:node.accept,multiple:node.multiple}));
    const selection=selectImages(uploadSettings,attributes.accept,attributes.multiple);
    if (!selection.files.length) return {status:'WARN',detail:'No compatible images found in configured upload_images.folder; no files attached'};
    await el.setInputFiles(selection.files,{timeout});
    const names=selection.files.map(file=>path.basename(file));
    const limited=names.length<selection.requested;
    return {status:limited?'WARN':'PASS',detail:'Attached '+names.length+'/'+selection.requested+' random image(s): '+names.join(', ')+(limited?(selection.singleFile?'; input accepts only one file':'; not enough compatible images'):'')+'; submission is a separate step',uploadedFiles:names};
  }
  if (c.tag === 'select') {
    const option=c.options.find(o=>!o.disabled && o.value && (guided?.value ? o.value===guided.value : !o.selected));
    if (!option) return {status:'SKIP',detail:'no eligible alternate option'};
    await el.selectOption(option.value);
  } else if (['checkbox','radio'].includes(c.type) || ['checkbox','radio'].includes(c.role)) {
    await el.setChecked(guided?.checked ?? true);
  } else if (isInput(c)) {
    const value=inputValue(c,guided?.value,marker);
    if (c.type === 'range') {
      await el.focus();
      await el.press('Home');
      await el.press('ArrowRight');
    } else if (c.type === 'color') {
      return {status:'SKIP',detail:'native color picker is not supported by this executor'};
    } else await el.fill(value);
  } else if (isSubmit(c)) {
    const before = await page.locator('body').innerText();
    const form = el.locator('xpath=ancestor::form[1]');
    const invalidBefore = await form.locator(':invalid').count().catch(()=>0);
    await el.click({timeout});
    const invalid = invalidBefore && await form.locator(':invalid').count().catch(()=>0);
    if (invalid) return {status:'WARN',detail:'Submission blocked by browser validation ('+invalid+' invalid field(s)); not saved/sent'};
    // Only explicit new feedback counts as confirmation, not merely a successful click.
    const feedback=page.locator('[role=alert],[role=status],[data-sonner-toast],[data-state=open][role=dialog]');
    try {
      await page.waitForFunction(previous => Array.from(document.querySelectorAll('[role=alert],[role=status],[data-sonner-toast]')).some(n=>n.getClientRects().length && n.textContent.trim() && !previous.includes(n.textContent.trim())), before, {timeout});
    } catch(error) { if(error.name!=='TimeoutError') throw error; }
    const messages=(await feedback.allTextContents()).map(s=>s.trim()).filter(s=>s && !before.includes(s)).join(' | ');
    if (/error|failed|invalid|required|denied|not allowed/i.test(messages)) return {status:'FAIL',detail:'Submission rejected: '+messages};
    if (/saved|sent|posted|published|created|success|uploaded/i.test(messages)) return {status:'PASS',detail:'Submission confirmed by UI: '+messages};
    return {status:'WARN',detail:'Save/send attempted once; no explicit success confirmation observed. '+messages};
  } else {
    await el.click({timeout});
  }
  return {status:'PASS',detail:isInput(c)?'Test input applied; submission is a separate step':'Control interacted with; business outcome not verified'};
}
module.exports={exclusion,isInput,isSubmit,priority,inputValue,discoverControls,performInteraction,probeEmptySubmission};
