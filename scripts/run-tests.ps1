param([switch]$Audit)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
npm test
if ($Audit) {
  if (-not $env:CHILD_EMAIL -or -not $env:CHILD_PASSWORD) { throw 'Set CHILD_EMAIL and CHILD_PASSWORD before using -Audit.' }
  npm run audit:ui:report
}
