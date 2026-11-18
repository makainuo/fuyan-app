param(
  [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'),
  [string]$StartMenuDirectory = [Environment]::GetFolderPath('Programs')
)
$ErrorActionPreference='Stop'
$appRoot=Split-Path -Parent $PSScriptRoot
# Keep ASCII for Windows PowerShell 5 even when the checkout has no UTF-8 BOM.
$title=-join ([char[]]@(0x518D,0x635E,0x6211,0x4E00,0x4E0B))
$launcher=Join-Path $appRoot (([string][char]0x542F)+[char]0x52A8+$title+'.vbs')
$icon=Join-Path $appRoot 'assets\zai-lao-taskbar.ico'
if (-not (Test-Path -LiteralPath $launcher) -or -not (Test-Path -LiteralPath $icon)) {throw 'Keep this tool inside the complete app directory.'}
$shell=New-Object -ComObject WScript.Shell
$links=@()
foreach($directory in @($DesktopDirectory,$StartMenuDirectory)) {
  if(-not (Test-Path -LiteralPath $directory)) {New-Item -ItemType Directory -Path $directory -Force | Out-Null}
  $path=Join-Path $directory ($title+'.lnk')
  $link=$shell.CreateShortcut($path)
  $link.TargetPath=Join-Path $env:SystemRoot 'System32\wscript.exe'
  $link.Arguments='"'+$launcher+'"'
  $link.WorkingDirectory=$appRoot
  $link.IconLocation=$icon+',0'
  $link.Description=$title
  $link.Save()
  [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link)
  $links+=$path
}
[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
Add-Type -Path (Join-Path $PSScriptRoot 'ps\window-identity.cs')
foreach($path in $links) {[WindowIdentity]::ApplyShortcut($path)}
Write-Output 'Desktop and Start menu shortcuts created with ZaiLao.App identity.'
