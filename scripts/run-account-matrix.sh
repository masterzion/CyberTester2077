#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node automation_tests/run-account-matrix.cjs "$@"
