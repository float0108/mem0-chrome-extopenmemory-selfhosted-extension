const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mem0-setup-test-'));
const extension = path.resolve(__dirname, '../dist');
const requests = []; let failNext = false;
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  requests.push({ url: req.url, method: req.method, body: body && JSON.parse(body) });
  const fail = failNext && req.method === 'POST'; if (fail) failNext = false;
  res.writeHead(fail ? 500 : 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(fail ? { detail: 'test failure' } : { results: [{ id: 'saved-test', memory: 'Test memory' }] }));
});
(async () => {
  let context;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.sync.get('setup_complete')).setup_complete !== undefined) return; await new Promise(r => setTimeout(r, 50)); } throw new Error('Installation did not finish'); });
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${new URL(worker.url()).host}/src/popup.html`);
    assert.equal(await popup.locator('#popupUserIdInput').inputValue(), '');
    assert.equal(await popup.locator('#popupApiKeyInput').inputValue(), '');
    assert.equal(await popup.locator('#popupServerUrlInput').inputValue(), 'http://127.0.0.1:8888');
    await popup.locator('#popupServerUrlInput').fill(baseUrl);
    await popup.locator('#popupApiKeyInput').fill('test-placeholder');
    await popup.locator('#popupUserIdInput').fill('   ');
    await popup.locator('#saveApiKeyBtn').click();
    await popup.getByText('Server URL and user ID are required.', { exact: true }).waitFor();
    assert.equal(requests.length, 0);
    await worker.evaluate(baseUrl => chrome.storage.sync.set({ baseUrl, apiKey: 'test-placeholder', user_id: 'test-user' }), baseUrl);
    const blocked = await popup.evaluate(baseUrl => chrome.runtime.sendMessage({ action: 'LOCAL_MEMORY_FETCH', url: baseUrl + '/memories?user_id=test-user', method: 'GET' }), baseUrl);
    assert.match(blocked.error, /Complete setup/); assert.equal(requests.length, 0);
    await popup.locator('#popupUserIdInput').fill('test-user');
    await popup.locator('#saveApiKeyBtn').click();
    await popup.locator('#connectedView').waitFor({ state: 'visible' });
    assert.ok(requests[0].url.includes('user_id=test-user'));
    console.log('PASS: fresh defaults, blank user validation, no API traffic before explicit setup, user-scoped verification');
    const answer = (id, text, labelled) => `<article id="${id}"><div class="ds-message"><div>Search summary must not be saved</div><div class="ds-markdown ds-assistant-message-main-content"><p>${text}<span data-citation-group="1">CITATION 1</span></p><p>Second paragraph.</p></div><div>Sources footer must not be saved</div></div><div class="actions"><button>Copy</button><button ${labelled ? 'aria-label="Share"' : ''} class="share"><svg width="16" height="16"><path d="M7.95889 1.52285L15 8L8 15Z"/></svg></button></div></article>`;
    await context.route('https://chat.deepseek.com/**', r => r.fulfill({ contentType: 'text/html', body: `<html><head><meta charset="utf-8"><style>body{font:14px Arial;background:#fff;color:#555;padding:32px}article{max-width:700px;margin-bottom:32px}.actions{display:flex;gap:10px;align-items:center}button{border:0;background:transparent;color:inherit}.ds-message{line-height:1.6}</style></head><body>${answer('one','First answer.',true)}${answer('two','Second answer.',false)}<form><textarea></textarea></form></body></html>` }));
    const page = await context.newPage(); await page.goto('https://chat.deepseek.com/');
    await page.locator('.openmemory-save-answer').last().waitFor();
    assert.equal(await page.locator('.openmemory-save-answer').count(), 2);
    assert.ok(await page.locator('#one .share').evaluate(e => e.nextElementSibling.classList.contains('openmemory-save-answer')));
    const first = page.locator('#one .openmemory-save-answer button');
    assert.equal(await first.textContent(), '');
    await first.click(); await first.and(page.locator('[data-save-state="saved"]')).waitFor();
    const writes = () => requests.filter(r => r.method === 'POST');
    assert.equal(writes().length, 1); assert.equal(writes()[0].url, '/api/memories');
    const payload = writes()[0].body;
    assert.equal(payload.user_id, 'test-user'); assert.equal(payload.infer, false);
    assert.equal(payload.messages[0].role, 'assistant');
    assert.equal(payload.messages[0].content, 'First answer.\nSecond paragraph.');
    assert.ok(await first.isDisabled());
    await first.evaluate(e => e.click()); assert.equal(writes().length, 1);
    failNext = true;
    const second = page.locator('#two .openmemory-save-answer button');
    await second.click(); await second.and(page.locator('[data-save-state="error"]')).waitFor();
    await second.click(); await second.and(page.locator('[data-save-state="saved"]')).waitFor();
    assert.equal(writes().length, 3);
    await page.locator('#one .actions').evaluate(e => e.replaceWith(e.cloneNode(true)));
    await page.waitForFunction(() => document.querySelector('#one .openmemory-save-answer')?.shadowRoot?.querySelector('button'));
    assert.equal(await page.locator('.openmemory-save-answer').count(), 2);
    await page.locator('#one .ds-assistant-message-main-content').evaluate(e => e.innerHTML = '<p>Regenerated answer.</p>');
    await page.waitForFunction(() => !document.querySelector('#one .openmemory-save-answer').shadowRoot.querySelector('button').disabled);
    await first.click(); await first.and(page.locator('[data-save-state="saved"]')).waitFor();
    assert.equal(writes().at(-1).body.messages[0].content, 'Regenerated answer.');
    await page.locator('#two .actions').screenshot({ path: path.resolve(__dirname, '../theme-answer-save-light.png') });
    await page.evaluate(() => { document.body.style.background = '#18181b'; document.body.style.color = '#b7b7bd'; });
    await page.locator('#two .actions').screenshot({ path: path.resolve(__dirname, '../theme-answer-save-dark.png') });
    console.log('PASS: save after Share; clean answer-only payload; no duplicate save; retry; regenerated answer; toolbar replacement');
  } finally {
    if (context) await context.close(); server.close();
    if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('mem0-setup-test-')) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
