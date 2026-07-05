# OpenMemory Chrome extension (self-hosted fork)

Active fork of the archived [mem0ai/mem0-chrome-extension](https://github.com/mem0ai/mem0-chrome-extension). Built for **local Mem0 OSS** (no Mem0 cloud sign-in): API on your machine, your API key, your `user_id`.

Maintained by [TheSethRose](https://github.com/TheSethRose) for use with a self-hosted stack (e.g. Hermes + mem0 on `127.0.0.1`).

## What changed vs upstream

- **Local-first auth** — `X-API-Key` (`m0sk_…`) and server URL in the popup; Google / MemAI cloud login removed for OSS.
- **Defaults** — `http://127.0.0.1:8888`, user id `seth` (override in popup / sidebar settings).
- **Popup** — verifies the key against your API before saving; connected view with shortcuts to ChatGPT, dashboard, sidebar.
- **Sidebar** — lists memories from OSS (`top_k`), system fonts (ChatGPT CSP-safe), clearer errors on 401.
- **Setup docs** — see [SETH-OSS-SETUP.md](./SETH-OSS-SETUP.md) and [scripts/setup-mac.sh](./scripts/setup-mac.sh).

Upstream is archived; this repo is the place for OSS-focused fixes.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- Running **Mem0 OSS** API (default `http://127.0.0.1:8888`) and dashboard (`http://127.0.0.1:3000`)
- An API key from your mem0 dashboard or `scripts/ensure-oss-key.sh`

## Install (unpacked)

```bash
git clone https://github.com/TheSethRose/mem0-chrome-extension.git
cd mem0-chrome-extension
npm install
npm run build
```

Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → select the **`dist/`** folder.

## Configure

1. Click the extension icon.
2. **Server URL:** `http://127.0.0.1:8888`
3. **API key:** your `m0sk_…` key (must show **Saved and verified.**)
4. On ChatGPT / Claude / etc., open the sidebar (**Ctrl+M** / **⌃+M**) to browse memories.

Align **user id** with your agent (e.g. `seth` for Hermes) so ChatGPT and your main assistant share the same memory namespace.

## Supported sites

ChatGPT, Claude, Perplexity, Gemini, Grok, DeepSeek, Replit, and others (see `manifest.json` content scripts).

## Development

```bash
npm run build    # production bundle → dist/
npm run dev      # if configured in package.json
```

Do not commit `.local-api-key` (gitignored). Use `scripts/ensure-oss-key.sh` locally to refresh a dev key.

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Sidebar **0 memories** / **401 Invalid API key** | Re-save key in popup; confirm `curl` with same key works against `:8888/memories?user_id=seth` |
| **CORS** errors from chat sites | Mem0 server needs `CORS_ALLOW_ALL=true` for local dev (see SETH-OSS-SETUP.md) |
| Console **storage not allowed** | Often harmless iframe noise; reload extension after updates |

Full OSS stack notes: [SETH-OSS-SETUP.md](./SETH-OSS-SETUP.md).

## License

MIT — same as upstream mem0-chrome-extension.

## Credits

Original extension and Mem0 by [mem0ai](https://github.com/mem0ai). This fork keeps the MIT license and targets self-hosted deployments.