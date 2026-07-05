# Self-hosted Mem0 + OpenMemory Chrome extension (Seth)

Your stack: API **http://127.0.0.1:8888**, dashboard **http://127.0.0.1:3000**, Ollama on host **:11434** (compose already sets `OPENAI_BASE_URL=http://host.docker.internal:11434/v1`).

## Why the extension failed before

1. **CORS** — Browser calls from `https://chatgpt.com` etc. were blocked; OSS only allowed `DASHBOARD_URL`. Server now supports `CORS_ALLOW_ALL=true` (set in compose).
2. **Auth** — Extension needs **`X-API-Key`** (`m0sk_...`), not cloud Google login.
3. **user_id** — Extension default is `chrome-extension-user`. Hermes uses **`seth`**. Pick one namespace (or align both to `seth`).
4. **List API** — Extension sends `page_size`; server now accepts it as alias for `top_k` and adds `count` for the sidebar.

## One-time: API key

```bash
cd ~/Developer/mem0-oss/server
# If you never saved a key:
make bootstrap
# Or dashboard → API keys → create key
```

## Reload API after code changes

```bash
cd ~/Developer/mem0-oss/server
docker compose up -d --build mem0
# or if only main.py changed and reload is on:
docker compose restart mem0
```

## Load extension (unpacked)

```bash
cd ~/Developer/experiments/mem0-chrome-extension
npm install && npm run build
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → folder **`dist/`** (not repo root).

## Extension settings (sidebar → Settings)

| Field | Value |
|--------|--------|
| Server URL | `http://127.0.0.1:8888` |
| API key | your `m0sk_...` key |
| User ID | `seth` (match Hermes) or `chrome-extension-user` (extension default) |

Popup: same server URL + API key, then save.

**Do not** use “Sign in with Google” for OSS — that targets `app.mem0.ai`.

## Smoke test (terminal)

```bash
curl -s "http://127.0.0.1:8888/memories?user_id=seth&page_size=5" \
  -H "X-API-Key: YOUR_KEY"

curl -s -X POST "http://127.0.0.1:8888/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"query":"test","filters":{"user_id":"seth"},"top_k":5}'
```

## Align with Hermes

Host Hermes (`~/.hermes`) already uses mem0 OSS with `user_id=seth`, `agent_id=hermes`. For shared memories in ChatGPT + Max:

- Set extension **user_id** to **`seth`**, or
- Add a sidebar setting / storage key for custom user id (today: edit saved `user_id` in extension settings if exposed, or use `DEFAULT_USER_ID` in `src/types/api.ts` and rebuild).

## LLM for `infer: true` (auto-extract on save)

Extension POSTs with `infer: true`. Mem0 server must have a working LLM in **`/configure`** (dashboard Configuration). With Ollama, use a model name Ollama actually serves (e.g. whatever you configured in dashboard), not only OpenAI cloud.

If saves return 502/503, check `docker compose logs mem0` and dashboard LLM/embedder config.

## Security note

`CORS_ALLOW_ALL=true` is fine on localhost; do not expose 8888 to the public internet with that flag.