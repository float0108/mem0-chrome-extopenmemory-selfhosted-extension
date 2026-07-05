#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$HOME/Developer/mem0-oss/server"

echo "== mem0 container (CORS) =="
cd "$SERVER" && docker compose up -d mem0
sleep 3

chmod +x "$ROOT/scripts/ensure-oss-key.sh" 2>/dev/null || true
echo "== API key =="
"$ROOT/scripts/ensure-oss-key.sh" || {
  echo "Could not mint key automatically."
  echo "Create one at http://127.0.0.1:3000 (API keys) and paste in the extension popup."
  echo "Or: cd $SERVER && make reset-admin-password EMAIL=admin@sethrose.dev PASSWORD='yourpass'"
  echo "     then save that password to $SERVER/.admin-password and re-run ensure-oss-key.sh"
}

echo "== extension build =="
cd "$ROOT" && npm install && npm run build

KEY_FILE="$ROOT/.local-api-key"
if [[ -f "$KEY_FILE" ]]; then
  pbcopy < "$KEY_FILE"
  echo "API key copied to clipboard (not printed)."
fi

echo ""
echo "Chrome: chrome://extensions → Developer mode → Load unpacked:"
echo "  $ROOT/dist"
echo "Popup: Server URL already http://127.0.0.1:8888 — paste API key → Save & Open"
echo "User ID: seth (sidebar Settings if needed)"