const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mem0-extension-test-'));
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = (process.env.MEM0_TEST_URL || 'http://127.0.0.1:8888').replace(/\/+$/, '');
const key = process.env.MEM0_TEST_KEY;
if (!key) throw new Error('Set MEM0_TEST_KEY for this process');
const user = `extension-smoke-${Date.now()}`;
const headers = { 'Content-Type': 'application/json', 'X-API-Key': key };
const ids = new Set();
let context;
async function direct(path, init={}) {
  const r = await fetch(base + path, { ...init, headers, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`API ${path}: HTTP ${r.status}`);
  return r.json();
}
async function main() {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
    args: [`--disable-extensions-except=${path.resolve(__dirname, '../dist')}`, `--load-extension=${path.resolve(__dirname, '../dist')}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => { for (let i=0;i<100;i++) { if ((await chrome.storage.sync.get('setup_complete')).setup_complete !== undefined) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Installation did not finish'); });
  const origin = 'chrome-extension://' + new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(origin + '/src/popup.html');
  await page.evaluate(() => chrome.storage.sync.clear());
  await page.reload();
  await page.locator('#popupServerUrlInput').fill(base + '/');
  await page.locator('#popupUserIdInput').fill(user);
  await page.locator('#popupApiKeyInput').fill(key);
  await page.locator('#saveApiKeyBtn').click();
  await page.locator('#connectedView').waitFor({state:'visible'});
  const config = await page.evaluate(() => chrome.storage.sync.get(['baseUrl','user_id','userId']));
  assert.equal(config.baseUrl, base); assert.equal(config.user_id, config.userId);
  console.log('PASS: Edge loads extension; popup verifies key and normalizes trailing slash');
  await page.evaluate(u => chrome.storage.sync.set({ user_id:u, userId:u }), user);
  await page.locator('#editSettingsBtn').click(); await page.locator('#saveApiKeyBtn').click();
  await page.locator('#connectedView').waitFor({state:'visible'});
  assert.equal(await page.evaluate(() => chrome.storage.sync.get('user_id').then(x=>x.user_id)), user);
  console.log('PASS: saving credentials preserves selected user');
  const relay = (path, method='GET', body) => page.evaluate(async ({url,method,body}) => {
    return chrome.runtime.sendMessage({action:'LOCAL_MEMORY_FETCH',url,method,body:body && JSON.stringify(body)});
  }, {url:base+path,method,body});
  const result = await relay('/memories', 'POST', { messages:[{role:'user',content:'For this isolated extension test, my favorite observatory is Aurora 742.'}], user_id:user, infer:false, metadata:{test:true} });
  assert.equal(result.status,200, result.body);
  for(const item of JSON.parse(result.body).results || []) if(item.id) ids.add(item.id);
  const listed=await direct('/memories?user_id='+user);
  const rows=listed.results || listed;
  for(const item of rows) ids.add(item.id);
  assert.ok(rows.length>0);
  console.log('PASS: memory written through actual extension background to local server');
  const found=await relay('/search','POST',{query:'Aurora 742 favorite observatory',filters:{user_id:user},top_k:5,threshold:0});
  assert.equal(found.status,200,found.body);
  assert.ok((JSON.parse(found.body).results || []).some(x=>ids.has(x.id)));
  console.log('PASS: semantic search recalls the test memory');
  const extracted = await relay('/memories', 'POST', {
    messages:[{role:'user',content:'Remember that I always prefer jasmine tea during code reviews.'}],
    user_id:user, infer:true, metadata:{test:true},
  });
  assert.equal(extracted.status,200,extracted.body);
  assert.ok(JSON.parse(extracted.body).results?.length > 0);
  console.log('PASS: configured LLM extracts a memory from conversation text');
  const blocked=await page.evaluate(() => chrome.runtime.sendMessage({action:'LOCAL_MEMORY_FETCH',url:'https://api.mem0.ai/memories',method:'GET'}));
  assert.ok(blocked.error);
  const reset=await relay('/reset','POST',{}); assert.ok(reset.error);
  console.log('PASS: relay rejects other hosts and administrative paths');
  await context.route('https://chatgpt.com/**', route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main><form><div id="prompt-textarea" contenteditable="true"></div><button id="composer-submit-button" type="button">Send</button></form></main></body></html>'}));
  const fixture=await context.newPage(); await fixture.goto('https://chatgpt.com/');
  await fixture.waitForTimeout(1500);
  await fixture.locator('#prompt-textarea').fill('What is my favorite observatory?');
  await fixture.locator('#mem0-icon-button').waitFor({timeout:20000});
  console.log('PASS: ChatGPT content script mounts in controlled browser fixture');
  await fixture.locator('#prompt-textarea').fill('What is my favorite observatory?');
  await fixture.locator('#mem0-icon-button button').first().click();
  await fixture.getByText(/Aurora 742/).first().waitFor({timeout:60000});
  console.log('PASS: ChatGPT fixture retrieves memory across origins via extension relay');
  await fixture.getByRole('button', {name:'Add to Prompt'}).click();
  assert.match(await fixture.locator('#prompt-textarea').innerText(), /Aurora 742/);
  console.log('PASS: selected memory is inserted into the prompt (no message sent)');
  await page.evaluate(async () => {
    const tabs = await chrome.tabs.query({url:'https://chatgpt.com/*'});
    await chrome.tabs.sendMessage(tabs[0].id, {action:'toggleSidebar'});
  });
  await fixture.locator('#mem0-sidebar .memory-count').filter({hasText:/[1-9].*Memories/}).waitFor({timeout:15000}).catch(async error => {
    console.log('Sidebar diagnostic:', await fixture.locator('#mem0-sidebar').innerText().catch(()=> 'not mounted'));
    throw error;
  });
  await fixture.locator('#mem0-sidebar .memory-cards').getByText(/Aurora 742/).first().waitFor();
  assert.equal(await page.evaluate(()=>chrome.storage.sync.get('baseUrl').then(x=>x.baseUrl)),base);
  console.log('PASS: sidebar shows memory count and recent memories');

  await context.route('https://chat.deepseek.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body><article><div class="ds-message"><div class="ds-assistant-message-main-content"><p>Isolated answer-save test: Aurora 742 is a fictional observatory.</p></div></div><div><button aria-label="Share">Share</button></div></article><textarea></textarea></body></html>' }));
  const deepseek = await context.newPage(); await deepseek.goto('https://chat.deepseek.com/');
  await deepseek.locator('.openmemory-save-answer button').click();
  await deepseek.locator('.openmemory-save-answer').getByText('已保存', { exact: true }).waitFor({ timeout: 60000 });
  const savedAnswers = await direct('/memories?user_id=' + user);
  const savedRows = savedAnswers.results || savedAnswers;
  for (const row of savedRows) ids.add(row.id);
  assert.ok(savedRows.some(row => (row.memory || row.text || '').includes('Isolated answer-save test:')));
  console.log('PASS: DeepSeek answer button saves verbatim assistant text to the real server');

}
main().catch(e=>{console.error(e.message); process.exitCode=1}).finally(async()=>{
  try {
    const listed=await direct('/memories?user_id='+user);
    for(const row of listed.results || listed) ids.add(row.id);
    for(const id of ids) await direct('/memories/'+encodeURIComponent(id), {method:'DELETE'});
    const remaining=await direct('/memories?user_id='+user);
    assert.equal((remaining.results || remaining).length,0);
    console.log('PASS: all isolated test memories removed');
  } catch(e) { console.error('Cleanup failed: '+e.message); process.exitCode=1; }
  if(context) { for(const p of context.pages()) { try { if(p.url().startsWith('chrome-extension:')) await p.evaluate(()=>chrome.storage.sync.clear()); } catch {} } await context.close(); }
  if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('mem0-extension-test-')) fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
});
