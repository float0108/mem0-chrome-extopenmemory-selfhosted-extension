const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mem0-style-test-'));
(async()=>{
 let context;
 try {
  context=await chromium.launchPersistentContext(profile,{executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:[`--disable-extensions-except=${path.resolve(__dirname, '../dist')}`,`--load-extension=${path.resolve(__dirname, '../dist')}`]});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => { for (let i=0;i<100;i++) { if ((await chrome.storage.sync.get('setup_complete')).setup_complete !== undefined) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Installation did not finish'); });
  await worker.evaluate(()=>chrome.storage.sync.set({memory_enabled:true,setup_complete:true,user_id:'test-user',userId:'test-user',apiKey:'test-placeholder',baseUrl:'http://127.0.0.1:1/backend'}));
  await context.route('https://chat.deepseek.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<html><head><meta charset="utf-8"><style>body{font:16px Arial;margin:0;padding:24px} main{width:min(640px,100%);margin:0 auto}form{display:flex;flex-direction:column;border:1px solid #888;border-radius:16px;padding:12px}textarea{box-sizing:border-box;width:100%;height:100px;resize:vertical} .tools{display:flex;justify-content:space-between}#footer{margin:0;line-height:24px}</style></head><body><main><form id="composer"><textarea id="chat-input"></textarea><div class="tools"><button type="button">DeepThink</button><button type="button">Send</button></div></form><p id="footer">下方提示文字，不应与记忆图标重叠。</p></main></body></html>`}));
  const page=await context.newPage(); await page.goto('https://chat.deepseek.com/');
  // Let both legacy periodic checks fire before the first interaction.
  await page.waitForTimeout(7500);
  await page.locator('#chat-input').fill('检查重复图标');
  await page.waitForTimeout(500);
  const count=await page.locator('#mem0-icon-button').count(); console.log('Icon count after initial typing:',count);
  assert.equal(count,1,'Exactly one icon after delayed first focus');
  for(let i=0;i<8;i++){await page.locator('#chat-input').fill('连续输入 '+i);await page.locator('#footer').click();await page.locator('#chat-input').focus();}
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#mem0-icon-button').count(),1);
  const checkLayout=async()=>{
   const boxes=await page.evaluate(()=>{const b=document.querySelector('#mem0-icon-button').getBoundingClientRect(),e=document.querySelector('#chat-input').getBoundingClientRect(),f=document.querySelector('#footer').getBoundingClientRect();return {icon:{top:b.top,bottom:b.bottom,left:b.left,right:b.right},editor:{top:e.top,bottom:e.bottom},footer:{top:f.top,bottom:f.bottom},width:innerWidth};});
   assert.ok(boxes.icon.top>=boxes.editor.bottom,'Icon must be outside editor text');
   assert.ok(boxes.icon.bottom<=boxes.footer.top,'Icon must reserve room before footer');
   assert.ok(boxes.icon.left>=0 && boxes.icon.right<=boxes.width,'Icon stays in viewport');
  };
  await checkLayout();
  await page.setViewportSize({width:390,height:750}); await checkLayout();
  await page.locator('#chat-input').evaluate(e=>{e.style.height='220px'}); await checkLayout();
  await page.evaluate(()=>{const old=document.querySelector('#composer');old.replaceWith(old.cloneNode(true));});
  await page.locator('#chat-input').fill('重新渲染后输入');await page.waitForTimeout(500);
  assert.equal(await page.locator('#mem0-icon-button').count(),1);await checkLayout();
  await page.evaluate(()=>{const form=document.querySelector('#composer');const div=document.createElement('div');div.id='composer';div.style.cssText='display:flex;flex-direction:column;border:1px solid #888;padding:12px';div.append(...form.childNodes);form.replaceWith(div);});
  await page.waitForTimeout(500);assert.equal(await page.locator('#mem0-icon-button').count(),1);await checkLayout();
  await page.evaluate(()=>{const old=document.querySelector('#chat-input');const edit=document.createElement('div');edit.id='chat-input';edit.contentEditable='true';edit.style.cssText='height:140px;white-space:pre-wrap;border:1px solid #888';old.replaceWith(edit);});
  await page.locator('#chat-input').fill('多行内容\n第二行');await page.waitForTimeout(500);
  assert.equal(await page.locator('#mem0-icon-button').count(),1);await checkLayout();
  await worker.evaluate(()=>chrome.storage.sync.set({memory_enabled:false}));await page.waitForTimeout(500);
  assert.equal(await page.locator('#mem0-icon-button').count(),0);
  await worker.evaluate(()=>chrome.storage.sync.set({memory_enabled:true}));await page.waitForTimeout(500);
  assert.equal(await page.locator('#mem0-icon-button').count(),1);await checkLayout();
  await page.screenshot({path:path.resolve(__dirname, '../deepseek-style-test.png')});
  console.log('PASS: one icon; no text overlap at desktop/mobile widths, resize, editor replacement and enable/disable');
 } finally {if(context) await context.close();if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('mem0-style-test-'))fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e.message);process.exitCode=1});
