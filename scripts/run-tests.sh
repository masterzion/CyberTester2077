#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
npm test
if [[ "${1:-}" == "--audit" ]]; then
  : "${CHILD_EMAIL:?Set CHILD_EMAIL before using --audit}"
  : "${CHILD_PASSWORD:?Set CHILD_PASSWORD before using --audit}"
  npm run audit:ui:report
fi
