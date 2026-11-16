' Zai Lao Wo Yi Xia - silent launcher. Keep ASCII for Windows Script Host.
Option Explicit
Dim sh, fso, appDir, nodeExe, probe, rc, arg, checkOnly, serverArgs
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = appDir
checkOnly = False
serverArgs = ""
For Each arg In WScript.Arguments
  If LCase(arg) = "/check" Then
    checkOnly = True
  Else
    serverArgs = serverArgs & " " & Chr(34) & Replace(arg, Chr(34), "") & Chr(34)
  End If
Next
If Not fso.FileExists(appDir & "\server.js") Then
  If Not checkOnly Then MsgBox "server.js is missing from the application folder.", 16, "Zai Lao Wo Yi Xia"
  WScript.Quit 2
End If
nodeExe = appDir & "\runtime\node\node.exe"
If Not fso.FileExists(nodeExe) Then
  If sh.Run("cmd /c where node >nul 2>nul", 0, True) <> 0 Then
    If checkOnly Then WScript.Quit 3
    rc = sh.Run("powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & appDir & "\tools\ensure-node.ps1" & Chr(34), 0, True)
    If rc <> 0 Then WScript.Quit rc
    If Not fso.FileExists(nodeExe) Then nodeExe = "node"
  End If
  If Not fso.FileExists(nodeExe) Then nodeExe = "node"
End If
probe = Chr(34) & nodeExe & Chr(34) & " -e " & Chr(34) & "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 18)" & Chr(34)
On Error Resume Next
rc = sh.Run(probe, 0, True)
If Err.Number <> 0 Then
  On Error GoTo 0
  If Not checkOnly Then MsgBox "The Node.js runtime could not be started.", 16, "Zai Lao Wo Yi Xia"
  WScript.Quit 4
End If
On Error GoTo 0
If rc <> 0 Then
  If Not checkOnly Then MsgBox "Node.js 18 or newer is required.", 16, "Zai Lao Wo Yi Xia"
  WScript.Quit 5
End If
If checkOnly Then WScript.Quit 0
sh.Run Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & appDir & "\server.js" & Chr(34) & serverArgs, 0, False
