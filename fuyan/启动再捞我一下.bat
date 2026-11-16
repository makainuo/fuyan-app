@echo off
rem Zai Lao Wo Yi Xia - console launcher, ASCII only.
setlocal
cd /d "%~dp0"
set "NODE_EXE=%~dp0runtime\node\node.exe"
if not exist "%NODE_EXE%" (
  set "NODE_EXE=node"
  where node >nul 2>nul
  if errorlevel 1 (
    if /i "%~1"=="/check" exit /b 3
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\ensure-node.ps1"
    if errorlevel 1 exit /b 3
    if exist "%~dp0runtime\node\node.exe" set "NODE_EXE=%~dp0runtime\node\node.exe"
  )
)
"%NODE_EXE%" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 18)"
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  pause
  exit /b 5
)
if /i "%~1"=="/check" exit /b 0
"%NODE_EXE%" "%~dp0server.js" %*
if errorlevel 1 (
  echo Application exited with an error. Copy the message above when reporting.
  pause
)
