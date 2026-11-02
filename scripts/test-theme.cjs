const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mem0-theme-test-'));
const extension = path.resolve(__dirname, '../dist');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ results: [{ id: 'theme-test', memory: 'Prefer concise answers and a calm, readable interface.', created_at: new Date().toISOString() }] }));
});
(async () => {
  let context;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      headless: true, viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => { for (let i=0;i<100;i++) { if ((await chrome.storage.sync.get('setup_complete')).setup_complete !== undefined) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Installation did not finish'); });
    await worker.evaluate(baseUrl => chrome.storage.sync.set({ setup_complete: true, user_id: 'test-user', userId: 'test-user', apiKey: 'test-placeholder', baseUrl, memory_enabled: true }), `http://127.0.0.1:${server.address().port}`);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/src/popup.html`);
    await popup.locator('#connectedView').waitFor({ state: 'visible' });
    await context.route('https://chat.deepseek.com/**', r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>
      body{margin:0;font:16px Arial;background:#eeeeee;color:#123456}.section{display:block;margin:10px;padding:3px}
      main{width:640px;margin:500px auto 0}form{padding:12px;border-radius:16px;background:white}textarea{width:100%;height:90px;box-sizing:border-box}.toolbar{display:flex;justify-content:flex-end;align-items:center;height:34px}button{font:inherit}
      </style></head><body><div class="section" id="host-sentinel">Host page styles stay unchanged</div><main><form><textarea placeholder="Message DeepSeek"></textarea><div class="toolbar"><button type="button" aria-label="Attach">＋</button><input type="file" hidden><button type="button">Send</button></div></form></main></body></html>` }));
    const page = await context.newPage(); await page.goto('https://chat.deepseek.com/');
    const hostStyle = () => page.locator('#host-sentinel').evaluate(e => {
      const s = getComputedStyle(e); return [s.display, s.padding, s.color, s.fontSize];
    });
    const baseline = await hostStyle();
    await page.locator('textarea').fill('How do I prefer responses?');
    await page.locator('#mem0-icon-button button').click();
    await page.getByText('Prefer concise answers and a calm, readable interface.', { exact: true }).waitFor();
    const modal = page.locator('body > [data-om-theme]');
    const text = page.getByText('Prefer concise answers and a calm, readable interface.', { exact: true });
    const openSidebar = () => worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'https://chat.deepseek.com/*' });
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'openMemorySidebar' });
    });
    for (const theme of ['light', 'dark']) {
      await popup.locator(`[data-theme-value="${theme}"]`).click();
      await page.waitForFunction(t => document.querySelector('body > [data-om-theme]')?.dataset.omTheme === t, theme);
      await page.waitForFunction(expected => [...document.querySelectorAll('div')].some(e => e.textContent === 'Prefer concise answers and a calm, readable interface.' && getComputedStyle(e).color === expected), theme === 'light' ? 'rgb(24, 24, 27)' : 'rgb(244, 244, 245)');
      const fg = await text.evaluate(e => getComputedStyle(e).color);
      assert.equal(fg, theme === 'light' ? 'rgb(24, 24, 27)' : 'rgb(244, 244, 245)');
      assert.equal(await text.evaluate(e => getComputedStyle(e).fontSize), '12px');
      const action = page.getByRole('button', { name: 'Add to Prompt', exact: true });
      assert.equal(await action.evaluate(e => getComputedStyle(e).color), theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(24, 24, 27)');
      await action.hover();
      await popup.locator('body').screenshot({ path: path.resolve(__dirname, `../theme-popup-${theme}.png`) });
      await modal.locator(':scope > div').first().screenshot({ path: path.resolve(__dirname, `../theme-dialog-${theme}.png`) });
    }
    await page.getByRole('button', { name: 'Add to Prompt', exact: true }).click();
    await openSidebar();
    const sidebar = page.locator('#mem0-sidebar'); await sidebar.waitFor({ state: 'visible' });
    for (const theme of ['light', 'dark']) {
      await sidebar.locator(`[data-theme-value="${theme}"]`).click();
      await popup.waitForFunction(t => document.body.dataset.omTheme === t, theme);
      assert.equal(await sidebar.evaluate(e => getComputedStyle(e).backgroundColor), theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(24, 24, 27)');
      await sidebar.screenshot({ path: path.resolve(__dirname, `../theme-sidebar-${theme}.png`) });
      assert.deepEqual(await hostStyle(), baseline, 'Sidebar must not alter host styles');
    }
    await sidebar.locator('[data-theme-value="light"]').click();
    await popup.reload();
    await popup.waitForFunction(() => document.body.dataset.omTheme === 'light');
    await sidebar.locator('#closeBtn').click();
    await page.locator('textarea').fill('How do I prefer responses?');
    await page.locator('#mem0-icon-button button').click();
    await page.waitForFunction(() => [...document.querySelectorAll('body > [data-om-theme]')].filter(e => e.id !== 'mem0-sidebar').some(e => e.dataset.omTheme === 'light'));
    console.log('PASS: light/dark popup, sidebar and DeepSeek dialog; live sync, reload/reopen persistence, readable actions, compact text, host CSS isolation');
  } finally {
    if (context) await context.close(); server.close();
    if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('mem0-theme-test-')) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
