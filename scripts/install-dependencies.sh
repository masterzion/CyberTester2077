#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v node >/dev/null || { echo "Node.js 18 or newer is required." >&2; exit 1; }
npm install
if [[ "${1:-}" != "--skip-browser" ]]; then npx playwright install chromium; fi
echo "CyberTester2077 dependencies are ready."
