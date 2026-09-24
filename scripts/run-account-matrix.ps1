param([switch]$Web, [switch]$Mobile)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$matrixArgs = @()
if ($Web) { $matrixArgs += '--web' }
if ($Mobile) { $matrixArgs += '--mobile' }
node automation_tests/run-account-matrix.cjs @matrixArgs
