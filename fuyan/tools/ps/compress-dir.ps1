param(
  [Parameter(Mandatory=$true)][string]$Src,
  [Parameter(Mandatory=$true)][string]$Zip
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Src)) { throw "source missing: $Src" }
$parent = Split-Path -Parent $Zip
if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
$entries = [System.IO.Directory]::GetFileSystemEntries($Src)
$files = @()
foreach ($p in $entries) {
  $name = [System.IO.Path]::GetFileName($p)
  if ($name -like '*.bak*' -or $name -eq 'desktop.ini') { continue }
  $files += $p
}
if ($files.Count -eq 0) { throw "empty dir: $Src" }
Compress-Archive -LiteralPath $files -DestinationPath $Zip -Force
