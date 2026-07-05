#!/bin/bash
# Mint OpenMemory API key + verify OSS mem0 for Seth (no secrets printed to stdout).
set -euo pipefail
API_URL="${API_URL:-http://127.0.0.1:8888}"
LABEL="${LABEL:-openmemory-chrome}"
OUT_DIR="${OUT_DIR:-$HOME/Developer/experiments/mem0-chrome-extension}"
OUT_FILE="$OUT_DIR/.local-api-key"
EMAIL="${EMAIL:-admin@sethrose.dev}"
PASS_FILE="${PASS_FILE:-$HOME/Developer/mem0-oss/server/.admin-password}"

if [[ -f "$OUT_FILE" ]] && [[ -s "$OUT_FILE" ]]; then
  KEY=$(head -1 "$OUT_FILE")
  if curl -sf -m 5 "$API_URL/memories?user_id=seth&page_size=1" -H "X-API-Key: $KEY" >/dev/null; then
    echo "ok:existing_key"
    exit 0
  fi
fi

TOKEN=""
if [[ -f "$PASS_FILE" ]]; then
  PASS=$(cat "$PASS_FILE")
  LOGIN=$(curl -sf -m 15 -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,os; print(json.dumps({\"email\":os.environ[\"EMAIL\"],\"password\":open(os.environ[\"PASS_FILE\"]).read().strip()}))' EMAIL="$EMAIL" PASS_FILE="$PASS_FILE")") || true
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
fi

if [[ -z "$TOKEN" ]]; then
  # Try ADMIN_API_KEY from server .env
  ENV_FILE="$HOME/Developer/mem0-oss/server/.env"
  if [[ -f "$ENV_FILE" ]]; then
    ADMIN=$(grep -E '^ADMIN_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
    if [[ -n "$ADMIN" ]] && curl -sf -m 5 "$API_URL/memories?user_id=seth&page_size=1" -H "X-API-Key: $ADMIN" >/dev/null; then
      printf '%s\n' "$ADMIN" > "$OUT_FILE"
      chmod 600 "$OUT_FILE"
      echo "ok:admin_key"
      exit 0
    fi
  fi
  echo "fail:login — set $PASS_FILE or run: cd ~/Developer/mem0-oss/server && OUTPUT=json make seed"
  exit 1
fi

KEY_RESP=$(curl -sf -m 15 -X POST "$API_URL/api-keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$(python3 -c "import json,os; print(json.dumps({'label':os.environ['LABEL']}))" LABEL="$LABEL")")

KEY=$(echo "$KEY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('key',''))")
if [[ -z "$KEY" ]]; then
  echo "fail:create_key"
  exit 1
fi

mkdir -p "$OUT_DIR"
printf '%s\n' "$KEY" > "$OUT_FILE"
chmod 600 "$OUT_FILE"
echo "ok:new_key"