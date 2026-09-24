param([switch]$SkipBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 18 or newer is required.' }
npm install
if (-not $SkipBrowser) { npx playwright install chromium }
Write-Host 'CyberTester2077 dependencies are ready.'
