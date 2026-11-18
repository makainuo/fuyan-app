param(
  [Parameter(Mandatory = $true)][string]$Zip,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $root) { throw 'Update staging directory already exists.' }
$prefix = $root + [IO.Path]::DirectorySeparatorChar
$blocked = @('data', 'user', 'archives', 'exports', 'tmp', 'node_modules', 'config.json', 'runtime.json', '.git')
$archive = [IO.Compression.ZipFile]::OpenRead($Zip)
try {
  $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $total = 0L
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.Replace('\', '/').TrimEnd('/')
    $parts = $name.Split('/')
    if ($blocked -contains $parts[0]) { throw 'Package contains user data or source control files.' }
    foreach ($part in $parts) {
      if ($part -match '^[.]\.?$|^$|[<>:"|?*\x00-\x1f]|[. ]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') {
        throw 'Unsafe update package path.'
      }
    }
    $file = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $name))
    if (-not $file.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or -not $paths.Add($file)) {
      throw 'Duplicate or unsafe update package path.'
    }
    $total += $entry.Length
    if ($total -gt 600MB -or $paths.Count -gt 10000) { throw 'Unpacked update exceeds the size limit.' }
  }
  [IO.Directory]::CreateDirectory($root) | Out-Null
  foreach ($entry in $archive.Entries) {
    $file = [IO.Path]::Combine($root, $entry.FullName.Replace('\', '/'))
    if ($entry.FullName -match '[/\\]$') { [IO.Directory]::CreateDirectory($file) | Out-Null; continue }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $file, $false)
  }
} finally {
  $archive.Dispose()
}
