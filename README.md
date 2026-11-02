# OpenMemory Self-hosted Extension

Chrome / Edge extension for AI chat memories using your own Mem0 server. Based on [TheSethRose/mem0-chrome-extension](https://github.com/TheSethRose/mem0-chrome-extension), originally [mem0ai/mem0-chrome-extension](https://github.com/mem0ai/mem0-chrome-extension). Original MIT license and attribution are retained.

## Install

Extract the extension ZIP. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the directory containing `manifest.json`.

Build from source with Node.js 22+ and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm run type-check
pnpm run build
```

Load `dist/`. After updating, reload the extension and refresh chat tabs. Version **1.3.18** is one patch above the fork base (1.3.17).

## First-time setup

Open the extension popup and fill all three fields:

| Field | Initial value | Meaning |
| --- | --- | --- |
| Server URL | `http://127.0.0.1:8888` | API address, including any reverse-proxy prefix such as `/backend`. |
| User ID | Empty | Your memory namespace; match other clients to share memories. |
| API key | Empty | Key issued by your self-hosted server. |

Choose **Save**. The extension verifies the connection using the selected user ID before enabling memory access. Blank fields are rejected; incomplete setup cannot read or write memories. Existing installations without the new setup flag also need to save setup once. No personal user ID, private port, or API key is bundled.

Port 8888 is the host port in the [official Mem0 Docker Compose configuration](https://github.com/mem0ai/mem0/blob/main/server/docker-compose.yaml). Other deployment ports can be entered manually. The extension expects the self-hosted `/memories` and `/search` endpoints, not the cloud `/v1/` API.

If the server returns HTML rather than JSON, check that Server URL points to the API rather than the dashboard. URLs are not silently rewritten to a deployment-specific path.

## Use

- **Retrieve:** On DeepSeek, the memory chip icon sits immediately left of the attachment icon. Find relevant memories and choose **Add to Prompt** to insert them into the composer.
- **Save a DeepSeek answer:** Click the **memory chip icon** immediately after the answer's Share action. Only the answer body is saved; search summaries and citation markers are excluded. The answer is stored verbatim (`infer: false`, assistant role), rather than inferred as personal facts. The icon changes to a spinner, checkmark, or retry symbol; hover for details. Repeated clicks on an unchanged saved answer are disabled for that rendered row.
- **Save selected text:** Select text, right-click, then choose **Save to OpenMemory**. The server can extract memories using its normal inference behavior.
- **Browse / configure:** Choose **Open memory sidebar** in the popup on a webpage. Browser-internal pages cannot host the sidebar.
- **Appearance:** Sun selects white daytime mode; moon selects dark nighttime mode. Popup, sidebar, and memory dialogs share the saved choice, with compact typography and spacing.

Adapters for ChatGPT, Claude, Gemini, Grok, Perplexity, and Replit are retained. Some also save prompts when sending messages. Website changes can affect those automatic hooks; explicit save actions are easier to verify. The DeepSeek Share fallback recognizes the current SVG icon when accessible labels are absent, and may need updating if the site changes it.

## Data and permissions

Connection settings and theme use extension sync storage; browser profile sync can synchronize them. Memory requests go to the configured server. Content-script requests are relayed through the background worker, restricted to that server's memory-list, memory-create, and search endpoints. Cross-origin redirects are rejected. Upstream analytics calls are disabled.

Broad website access supports the cross-site sidebar, context menu, and configurable API host. Search/address tracking is opt-in. Do not commit credentials, private snapshots, or browser profiles.

## Tests

Build first. Browser tests use Playwright and isolated temporary profiles. Install Playwright separately or set `PLAYWRIGHT_PATH` to an existing installation. Set `BROWSER_PATH` to Chrome/Edge; the default is the standard Windows Edge location.

```sh
node scripts/test-setup-save.cjs
node scripts/test-theme.cjs
node scripts/test-sidebar-button.cjs
node scripts/test-deepseek-style.cjs
```

These tests use synthetic pages and a local mock API. Optional saved-page geometry test (requires the adjacent saved CSS folder; blocks remote resources and does not upload conversations):

```sh
node scripts/test-deepseek-snapshot.cjs /path/to/saved-deepseek.html
```

Optional real-server integration test uses `MEM0_TEST_URL` and `MEM0_TEST_KEY` environment variables:

```sh
node scripts/test-local.cjs
```

It creates a temporary test user and memories, then attempts to delete those memories during cleanup. It requires working creation, search, extraction, and deletion endpoints. Test scripts contain no credentials.

## License

[MIT](LICENSE). Independent self-hosted fork; not an official Mem0 browser release.
