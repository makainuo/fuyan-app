' Shared automatic bootstrap. ASCII for Windows Script Host.
Option Explicit
Dim sh, fso, root, command, arg, rc
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root
command = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & root & "\tools\launch.ps1" & Chr(34)
For Each arg In WScript.Arguments
  If LCase(arg) = "/check" Then
    command = command & " -CheckOnly"
  Else
    command = command & " " & Chr(34) & Replace(arg, Chr(34), "") & Chr(34)
  End If
Next
rc = sh.Run(command, 0, True)
WScript.Quit rc
