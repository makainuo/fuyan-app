param([Parameter(Mandatory=$true)][string]$Title, [string]$Report = '', [switch]$InspectOnly)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script:iconPath = Join-Path $appRoot 'assets\zai-lao-taskbar.ico'
$script:launcherPath = Join-Path $appRoot (([string][char]0x542F) + [char]0x52A8 + $Title + '.vbs')
Add-Type -Path (Join-Path $PSScriptRoot 'window-identity.cs')
if (-not $InspectOnly) {
    foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
        try { [WindowIdentity]::ApplyShortcut((Join-Path $folder ($Title + '.lnk'))) }
        catch { Write-Warning ('Shortcut identity was not updated: ' + $_.Exception.Message) }
    }
}

# Chromium can ignore --start-maximized when a browser process already exists.
# Apply SW_MAXIMIZE only to visible app windows bearing our exact brand title.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AppWindowMaximizer {
    public delegate bool EnumProc(IntPtr window, IntPtr data);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr window);
}
'@

$script:desiredTitle = $Title
$script:seen = New-Object 'System.Collections.Generic.HashSet[long]'
$script:identities = @{}
$callback = [AppWindowMaximizer+EnumProc] {
    param([IntPtr]$window, [IntPtr]$data)
    if (-not [AppWindowMaximizer]::IsWindowVisible($window)) { return $true }
    $caption = New-Object System.Text.StringBuilder 512
    [void][AppWindowMaximizer]::GetWindowText($window, $caption, 512)
    $text = $caption.ToString()
    if ($text -ne $script:desiredTitle -and -not $text.EndsWith(' ' + [char]0x00B7 + ' ' + $script:desiredTitle)) { return $true }
    [uint32]$windowPid = 0
    [void][AppWindowMaximizer]::GetWindowThreadProcessId($window, [ref]$windowPid)
    try { $processName = (Get-Process -Id $windowPid -ErrorAction Stop).ProcessName } catch { return $true }
    if ($processName -notin @('msedge', 'chrome')) { return $true }
    if (-not $InspectOnly -and -not [AppWindowMaximizer]::IsZoomed($window)) {
        [void][AppWindowMaximizer]::ShowWindowAsync($window, 3)
    }
    if (-not $InspectOnly) {
        [WindowIdentity]::Apply($window, $script:iconPath, $script:launcherPath, $script:desiredTitle)
    }
    $script:identities[$window.ToInt64().ToString()] = [WindowIdentity]::Inspect($window)
    [void]$script:seen.Add($window.ToInt64())
    return $true
}
# Watch briefly so a pre-existing app window does not hide a newly opening one.
for ($attempt=0; $attempt -lt $(if ($InspectOnly) { 1 } else { 35 }); $attempt++) {
    [void][AppWindowMaximizer]::EnumWindows($callback, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 100
}
if ($Report) {
    @{ matchedWindows=$script:seen.Count; checkedAt=(Get-Date).ToString('s'); identities=$script:identities; inspectOnly=[bool]$InspectOnly } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Report -Encoding UTF8
}
if ($script:seen.Count -eq 0) { exit 1 }
