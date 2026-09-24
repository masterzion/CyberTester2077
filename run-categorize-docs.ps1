param([switch]$Preview, [switch]$Apply, [string]$Settings = 'automation_tests/automation-settings.yml', [string]$SourceFile)
& "$PSScriptRoot/scripts/run-categorize-docs.ps1" @PSBoundParameters
exit $LASTEXITCODE
