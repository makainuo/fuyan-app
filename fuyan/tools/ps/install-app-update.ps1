param([Parameter(Mandatory = $true)][string]$PlanPath)

$ErrorActionPreference = 'Stop'
$plan = Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8 | ConvertFrom-Json
$root = [IO.Path]::GetFullPath($plan.root)
$work = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($PlanPath))
$next = Join-Path $work 'next'
$backup = Join-Path $work 'previous'
$failed = Join-Path $work 'failed'
$env:FUYAN_DATA = $plan.data
$encoding = [Text.UTF8Encoding]::new($false)

function Write-Result($Phase, $Version, $Message) {
  $json = @{ phase = $Phase; version = $Version; error = $Message } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($plan.result, $json, $encoding)
}

function Start-App {
  $node = Join-Path $root 'runtime\node\node.exe'
  Start-Process -FilePath $node -ArgumentList 'server.js', '--no-open', '--port', ([string]$plan.port) `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru
}

function Wait-ForApp($Process, $Version) {
  $until = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $until) {
    $Process.Refresh()
    if ($Process.HasExited) { break }
    try {
      $request = [Net.WebRequest]::Create("http://127.0.0.1:$($plan.port)/api/health")
      $request.Timeout = 750
      $request.Proxy = $null
      $reply = $request.GetResponse()
      try {
        $reader = [IO.StreamReader]::new($reply.GetResponseStream())
        try { $info = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
      } finally { $reply.Dispose() }
      if ($info.app -eq 'fuyan' -and $info.version -eq $Version -and $info.pid -eq $Process.Id `
          -and [IO.Path]::GetFullPath($info.dataDir) -eq [IO.Path]::GetFullPath($plan.data)) { return }
    } catch {}
    Start-Sleep -Milliseconds 180
  }
  throw "Version $Version did not start on port $($plan.port)."
}

$oldMoved = $false
$newMoved = $false
$app = $null
try {
  if ([IO.Path]::GetDirectoryName($work) -ne [IO.Path]::GetDirectoryName($root) `
      -or [IO.Path]::GetFileName($work) -notlike '.zailao-update-*' `
      -or -not (Test-Path -LiteralPath (Join-Path $next 'version.json'))) {
    throw 'Invalid update staging directory.'
  }
  $old = Get-Process -Id $plan.pid -ErrorAction SilentlyContinue
  [IO.File]::WriteAllText((Join-Path $work 'waiting'), '', $encoding)
  if ($old -and -not $old.WaitForExit(20000)) { throw 'The existing program did not exit.' }
  [IO.Directory]::Move($root, $backup)
  $oldMoved = $true
  [IO.Directory]::Move($next, $root)
  $newMoved = $true
  $app = Start-App
  Wait-ForApp $app $plan.version
  Write-Result 'installed' $plan.version ''
} catch {
  $problem = $_.Exception.Message
  if ($oldMoved) {
    try {
      if ($app) {
        $app.Refresh()
        if (-not $app.HasExited) { $app.Kill(); $app.WaitForExit() }
      }
      if ($newMoved) { [IO.Directory]::Move($root, $failed) }
      [IO.Directory]::Move($backup, $root)
      $oldApp = Start-App
      Wait-ForApp $oldApp $plan.oldVersion
      Write-Result 'rolled-back' $plan.version $problem
    } catch {
      Write-Result 'error' $plan.version ($problem + ' ' + $_.Exception.Message + ' Backup: ' + $backup)
    }
  } else {
    if (-not (Get-Process -Id $plan.pid -ErrorAction SilentlyContinue)) {
      try { Start-App | Out-Null } catch { $problem += ' ' + $_.Exception.Message }
    }
    Write-Result 'error' $plan.version $problem
  }
}
