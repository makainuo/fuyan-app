# 再捞我一下 · 运行环境检查 / 便携版 Node 下载
#
# 逻辑：便携环境 → FUYAN_NODE / PATH → 自动下载兼容环境
# 退出码：0 = 可用；2 = 没找到（CheckOnly）；1 = 出错
#
# 便携版只解压到 <程序目录>\runtime\node，不写注册表、不需要管理员权限。

param(
  [switch]$Auto,        # 兼容旧调用；默认自动准备
  [switch]$Quiet,       # 命令行打包时不显示进度窗口
  [switch]$CheckOnly,   # 只检查，不下载
  [switch]$IgnorePath,  # 忽略 PATH 里的 node（模拟“没装”）
  [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$VERSION = '22.11.0'
$SHA256 = '905373a059aecaf7f48c1ce10ffbd5334457ca00f678747f19db5ea7d256c236'
$MIRRORS = @(
  "https://npmmirror.com/mirrors/node/v$VERSION/node-v$VERSION-win-x64.zip",
  "https://nodejs.org/dist/v$VERSION/node-v$VERSION-win-x64.zip"
)

if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$runtimeDir = Join-Path $Root 'runtime'
$nodeDir = Join-Path $runtimeDir 'node'
$nodeExe = Join-Path $nodeDir 'node.exe'

function Test-NodeExe([string]$path) {
  if (-not $path) { return $false }
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  try {
    $v = & $path -v 2>$null
    if ($v -match '^v(\d+)\.') { return ([int]$Matches[1] -ge 18) }
  } catch { }
  return $false
}

function Find-Node {
  if (Test-NodeExe $nodeExe) { return $nodeExe }
  if (-not $IgnorePath) {
    if (Test-NodeExe $env:FUYAN_NODE) { return $env:FUYAN_NODE }
    $cmd = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
    if ($cmd -and (Test-NodeExe $cmd.Source)) { return $cmd.Source }
  }
  return ''
}

function Download-Node([string]$url, [string]$dst) {
  if ($Quiet) {
    Invoke-WebRequest -Uri $url -OutFile $dst -UseBasicParsing -TimeoutSec 240
    return
  }
  Add-Type -AssemblyName System.Windows.Forms
  $form = New-Object System.Windows.Forms.Form
  $form.Text = '再捞我一下 · 正在准备运行环境'
  $form.Width = 470
  $form.Height = 140
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.TopMost = $true

  $label = New-Object System.Windows.Forms.Label
  $label.Text = "首次启动正在自动准备所需文件（约 30 MB）…`n下载完成后会自动解压，请稍候。"
  $label.AutoSize = $false
  $label.Width = 420
  $label.Height = 42
  $label.Location = New-Object System.Drawing.Point(18, 16)

  $bar = New-Object System.Windows.Forms.ProgressBar
  $bar.Style = 'Marquee'
  $bar.MarqueeAnimationSpeed = 30
  $bar.Location = New-Object System.Drawing.Point(18, 68)
  $bar.Width = 420
  $bar.Height = 18

  $form.Controls.AddRange(@($label, $bar))
  $form.Show()
  [System.Windows.Forms.Application]::DoEvents()

  $job = Start-Job -ScriptBlock {
    param($u, $d)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ErrorActionPreference = 'Stop'
    Invoke-WebRequest -Uri $u -OutFile $d -UseBasicParsing -TimeoutSec 240
    return $true
  } -ArgumentList $url, $dst

  while ($job.State -eq 'Running' -or $job.State -eq 'NotStarted') {
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 120
  }
  $form.Close()

  if ($job.State -ne 'Completed') {
    $err = ''
    try { $err = ($job.ChildJobs[0].Error | Select-Object -First 1) } catch { }
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    throw "下载失败：$err"
  }
  Remove-Job $job -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- 主流程
$found = Find-Node
if ($found) {
  Write-Output $found
  exit 0
}

if ($CheckOnly) {
  Write-Output 'missing'
  exit 2
}

$ok = $false
$lastErr = ''
foreach ($url in $MIRRORS) {
  $tmpZip = Join-Path $env:TEMP ('fuyan-node-' + [guid]::NewGuid().ToString('N') + '.zip')
  try {
    Download-Node $url $tmpZip
    $hash = (Get-FileHash -LiteralPath $tmpZip -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne $SHA256) { throw "校验不通过（$hash）" }

    $tmpDir = Join-Path $env:TEMP ('fuyan-node-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
    Expand-Archive -LiteralPath $tmpZip -DestinationPath $tmpDir -Force
    $inner = Get-ChildItem -LiteralPath $tmpDir -Directory | Select-Object -First 1
    if (-not $inner) { throw '解压后没有找到目录' }
    if (-not (Test-NodeExe (Join-Path $inner.FullName 'node.exe'))) { throw '下载的运行环境无法运行' }
    if ([IO.Path]::GetFullPath($nodeDir) -ne [IO.Path]::GetFullPath((Join-Path $Root 'runtime\node'))) { throw 'Invalid runtime path' }

    if (Test-Path -LiteralPath $nodeDir) { Remove-Item -LiteralPath $nodeDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    Move-Item -LiteralPath $inner.FullName -Destination $nodeDir -Force
    Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue

    if (-not (Test-NodeExe $nodeExe)) { throw '解压完成但 node.exe 无法运行' }
    $ok = $true
    break
  } catch {
    $lastErr = $_.Exception.Message
    Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue
  }
}

if (-not $ok) {
  if ($Quiet) { Write-Error $lastErr; exit 1 }
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    "没能自动装好运行环境。`n`n$lastErr`n`n请检查网络后重试，或下载包含运行环境的完整软件包，解压后直接使用。",
    '再捞我一下 · 准备失败', 'OK', 'Error') | Out-Null
  exit 1
}

Write-Output $nodeExe
exit 0
