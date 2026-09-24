param([switch]$Preview, [switch]$Apply, [string]$Settings = 'automation_tests/automation-settings.yml', [string]$SourceFile, [switch]$Stage3Only, [switch]$Stage2Only)
& "$PSScriptRoot/scripts/run-categorize-docs.ps1" @PSBoundParameters
exit $LASTEXITCODE
