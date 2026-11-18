# Shared automatic Windows launcher.
param(
  [switch]$CheckOnly,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ServerArgs
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $root 'server.js'))) { throw 'Application files are incomplete. Extract the full package again.' }
  $prepareArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'ensure-node.ps1'))
  if ($CheckOnly) { $prepareArgs += '-CheckOnly' }
  $result = @(& "$PSHOME\powershell.exe" @prepareArgs)
  $code = $LASTEXITCODE
  if ($code -ne 0) { exit $code }
  $nodeExe = [string]($result | Select-Object -Last 1)
  if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Runtime preparation failed.' }
  if ($CheckOnly) { exit 0 }
  & $nodeExe (Join-Path $root 'server.js') @ServerArgs
  exit $LASTEXITCODE
} catch {
  if (-not $CheckOnly) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'ZaiLao - Startup failed', 'OK', 'Error') | Out-Null
  }
  exit 1
}
