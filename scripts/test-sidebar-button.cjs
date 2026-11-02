const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mem0-button-test-'));
(async () => {
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true,
      args:[`--disable-extensions-except=${path.resolve(__dirname, '../dist')}`,`--load-extension=${path.resolve(__dirname, '../dist')}`],
    });
    const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => { for (let i=0;i<100;i++) { if ((await chrome.storage.sync.get('setup_complete')).setup_complete !== undefined) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Installation did not finish'); });
    const popup=await context.newPage();
    await popup.goto('chrome-extension://'+new URL(worker.url()).host+'/src/popup.html');
    await popup.evaluate(()=>chrome.storage.sync.set({setup_complete:true,user_id:'test-user',userId:'test-user',apiKey:'test-placeholder',baseUrl:'http://127.0.0.1:1/backend'}));
    await popup.reload();
    await popup.locator('#connectedView').waitFor({state:'visible'});
    assert.equal(await popup.locator('#openChatBtn').count(),0);
    const before=context.pages().length;
    await popup.locator('#openSidebarBtn').click();
    await popup.locator('#sidebarStatus').filter({hasText:'无法在当前页面打开侧栏'}).waitFor();
    assert.equal(context.pages().length,before);
    console.log('PASS: Open ChatGPT removed; unsupported page shows feedback without opening a tab');
    await context.route('https://example.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><h1>Sidebar test</h1></body></html>'}));
    const fixture=await context.newPage(); await fixture.goto('https://example.com/');
    await fixture.waitForTimeout(1000);
    await fixture.bringToFront();
    await popup.evaluate(()=>document.querySelector('#openSidebarBtn').click());
    await fixture.locator('#mem0-sidebar').waitFor({state:'visible'});
    await fixture.waitForFunction(()=>document.querySelector('#mem0-sidebar').style.right==='0px');
    console.log('PASS: popup button opens sidebar on the active page');
    const results=await worker.evaluate(async()=>{
      const tabs=await chrome.tabs.query({url:'https://example.com/*'});
      return [await chrome.tabs.sendMessage(tabs[0].id,{action:'openMemorySidebar'}),await chrome.tabs.sendMessage(tabs[0].id,{action:'openMemorySidebar'})];
    });
    assert.ok(results.every(r=>r.ok));
    assert.equal(await fixture.locator('#mem0-sidebar').evaluate(e=>e.style.right),'0px');
    assert.ok(context.pages().every(p=>!p.url().startsWith('https://chatgpt.com')));
    console.log('PASS: repeated open requests keep sidebar open; no ChatGPT tab created');
  } finally {
    if(context) await context.close();
    if(path.dirname(profile)===path.resolve(os.tmpdir()) && path.basename(profile).startsWith('mem0-button-test-')) fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
