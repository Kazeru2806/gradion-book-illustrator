#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -f "$ROOT/server/.env" ]]; then
  echo "Missing server/.env — copy .env.example and add your GEMINI_API_KEY"
  exit 1
fi

echo "Starting API on :3001 and client on :5173"
echo "Open http://localhost:5173"

(cd "$ROOT/server" && npm run dev) &
SERVER_PID=$!

(cd "$ROOT/client" && npm run dev) &
CLIENT_PID=$!

cleanup() {
  kill "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
