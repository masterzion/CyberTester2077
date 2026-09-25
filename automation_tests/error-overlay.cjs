'use strict';
const overlaySelector='nextjs-portal [data-nextjs-dialog]:visible, nextjs-portal [role=dialog]:visible, [data-nextjs-dialog]:visible';
async function inspectErrorOverlay(page) {
  const overlay=page.locator(overlaySelector).first();
  if (!await overlay.count()) return null;
  const text=await overlay.innerText();
  return {text:text.slice(0,8000),url:page.url(),at:new Date().toISOString()};
}
async function dismissErrorOverlay(page) {
  const overlay=page.locator(overlaySelector).first();
  if (!await overlay.count()) return true;
  const close=page.locator('nextjs-portal').getByRole('button',{name:/^(close|dismiss|hide)( error(s)?| overlay| issues)?$/i}).first();
  if(await close.isVisible().catch(()=>false)) await close.click({timeout:2000}).catch(()=>{});
  if(await overlay.isVisible().catch(()=>false)) await page.keyboard.press('Escape');
  try {await overlay.waitFor({state:'hidden',timeout:2000});return true;}
  catch(error){if(error.name!=='TimeoutError')throw error;return false;}
}
module.exports={inspectErrorOverlay,dismissErrorOverlay};
