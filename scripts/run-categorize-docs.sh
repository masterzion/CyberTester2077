#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SETTINGS="${AUTOMATION_SETTINGS:-automation_tests/automation-settings.yml}"
[[ -f "$SETTINGS" ]] || SETTINGS="automation_tests/automation-settings.yml.example"
export AUTOMATION_SETTINGS="$SETTINGS"
node temporary-categorize-main-docs.cjs "$@"
