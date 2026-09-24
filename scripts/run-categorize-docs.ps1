param([switch]$Apply, [string]$Settings = 'automation_tests/automation-settings.yml')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not (Test-Path -LiteralPath $Settings)) { $Settings = 'automation_tests/automation-settings.yml.example' }
$env:AUTOMATION_SETTINGS = (Resolve-Path -LiteralPath $Settings)
$args = @('temporary-categorize-main-docs.cjs')
if ($Apply) { $args += '--apply' }
& node @args
