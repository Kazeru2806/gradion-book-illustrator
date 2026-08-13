#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Backend tests"
(cd "$ROOT/server" && npm test)

echo ""
echo "==> Frontend tests"
(cd "$ROOT/client" && npm test)
