param(
  [Parameter(Mandatory = $true)][string]$Worker,
  [Parameter(Mandatory = $true)][string]$PlanPath
)

$ErrorActionPreference = 'Stop'
$shell = Join-Path $PSHOME 'powershell.exe'
$line = '"{0}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{1}" -PlanPath "{2}"' -f $shell, $Worker, $PlanPath
$startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
# Give the worker a Windows-owned process lifetime so it can wait for Node to close.
$child = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine = $line
  CurrentDirectory = [IO.Path]::GetDirectoryName($Worker)
  ProcessStartupInformation = $startup
}
if ($child.ReturnValue -ne 0) { throw "Windows could not start the update worker ($($child.ReturnValue))." }
