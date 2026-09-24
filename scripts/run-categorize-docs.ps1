param([switch]$Preview, [switch]$Apply, [string]$Settings = 'automation_tests/automation-settings.yml', [string]$SourceFile, [switch]$Stage3Only)
$ErrorActionPreference = 'Stop'
if ($Preview -and $Apply) { throw 'Use either -Preview or -Apply, not both.' }
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not (Test-Path -LiteralPath $Settings)) { $Settings = 'automation_tests/automation-settings.yml.example' }
$env:AUTOMATION_SETTINGS = (Resolve-Path -LiteralPath $Settings)
$categorizeArgs = @('temporary-categorize-main-docs.cjs')
if (-not $Preview) { $categorizeArgs += '--apply' }
if ($SourceFile) { $categorizeArgs += @('--source-file', $SourceFile) }
if ($Stage3Only) { $categorizeArgs += '--stage3-only' }
& node @categorizeArgs
