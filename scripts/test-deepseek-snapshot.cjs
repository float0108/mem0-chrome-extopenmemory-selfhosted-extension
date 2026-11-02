const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const snapshot=process.argv[2];
if(!snapshot) throw new Error('Pass the saved DeepSeek HTML path');
const assets=snapshot.replace(/\.html$/,'_files');
const html=fs.readFileSync(snapshot,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<meta\b[^>]*http-equiv=[^>]*>/gi,'');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mem0-snapshot-test-'));
(async()=>{
 let context;
 try {
  context=await chromium.launchPersistentContext(profile,{executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,viewport:{width:1440,height:1000},args:[`--disable-extensions-except=${path.resolve(__dirname, '../dist')}`,`--load-extension=${path.resolve(__dirname, '../dist')}`]});
  // No saved-page scripts or remote assets run; only local CSS is served.
  await context.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.protocol==='chrome-extension:') return r.continue();
   if(u.href==='https://chat.deepseek.com/')return r.fulfill({contentType:'text/html; charset=utf-8',body:html});
   const file=decodeURIComponent(u.pathname).split('/').pop();
   if(['main.cc59a63cb5.css','katex.effce08cb3.css'].includes(file))return r.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(assets,file))});
   return r.abort();
  });
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => { for (let i=0;i<100;i++) { if ((await chrome.storage.sync.get('setup_complete')).setup_complete !== undefined) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Installation did not finish'); });
  await worker.evaluate(()=>chrome.storage.sync.set({setup_complete:true,user_id:'test-user',apiKey:'test-placeholder',baseUrl:'http://127.0.0.1:8888',memory_enabled:false}));
  const page=await context.newPage();await page.goto('https://chat.deepseek.com/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.querySelectorAll('#mem0-icon-button,#mem0-sidebar').forEach(e=>e.remove()));
  const composer=page.locator('._77cefa5').last();await composer.scrollIntoViewIfNeeded();
  const baseline=await composer.boundingBox();
  await worker.evaluate(()=>chrome.storage.sync.set({memory_enabled:true}));
  await page.locator('#mem0-icon-button[data-placement="toolbar"]').waitFor({timeout:12000});
  const assertLayout=async()=>{
   assert.equal(await page.locator('#mem0-icon-button').count(),1);
   const metrics=await page.evaluate(()=>{
    const host=document.querySelector('#mem0-icon-button');const paperclip=host.nextElementSibling;
    const file=paperclip.nextElementSibling;const h=host.getBoundingClientRect(),a=paperclip.getBoundingClientRect(),editor=document.querySelector('textarea').getBoundingClientRect();
    return {correct:file.matches('input[type="file"]'),height:h.height,gap:a.left-h.right,aligned:Math.abs((a.top+a.height/2)-(h.top+h.height/2)),below:h.top>=editor.bottom-1,viewport:h.left>=0&&a.right<=innerWidth,toolbarHeight:host.parentElement.getBoundingClientRect().height};
   });
   assert.ok(metrics.correct);assert.ok(metrics.gap>=0&&metrics.gap<=12);assert.ok(metrics.aligned<1);assert.ok(metrics.below);assert.ok(metrics.viewport);assert.equal(metrics.height,34);
  };
  await assertLayout();
  await page.waitForFunction(() => document.querySelector('.openmemory-save-answer'));
  const answerButtons = await page.evaluate(() => [...document.querySelectorAll('.openmemory-save-answer')].map(host => ({
    afterShare: !!host.previousElementSibling?.querySelector('path[d^="M7.95889 1.52285"]'),
    single: host.parentElement.querySelectorAll('.openmemory-save-answer').length === 1,
  })));
  assert.ok(answerButtons.length > 0 && answerButtons.every(b => b.afterShare && b.single));
  console.log('PASS: saved DeepSeek page mounts one save action immediately after each recognized Share button');
  assert.ok(Math.abs((await composer.boundingBox()).height-baseline.height)<1,'No extra composer row/height');
  await composer.screenshot({path:path.resolve(__dirname, '../deepseek-toolbar-light.png')});
  await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
  await composer.screenshot({path:path.resolve(__dirname, '../deepseek-toolbar-dark.png')});
  for(let i=0;i<6;i++){await page.locator('textarea').fill('test '+i);await page.locator('textarea').blur();await page.locator('textarea').focus();}
  await assertLayout();
  await page.setViewportSize({width:390,height:850});await assertLayout();
  await composer.screenshot({path:path.resolve(__dirname, '../deepseek-toolbar-mobile.png')});
  await page.evaluate(()=>{const toolbar=document.querySelector('#mem0-icon-button').parentElement;toolbar.replaceWith(toolbar.cloneNode(true));});
  await page.waitForTimeout(300);await assertLayout();
  console.log('PASS: saved DeepSeek DOM/CSS; single button left of paperclip, 34px, aligned, no added height, narrow viewport and toolbar replacement');
 }finally{if(context)await context.close();if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('mem0-snapshot-test-'))fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e.message);process.exitCode=1});
