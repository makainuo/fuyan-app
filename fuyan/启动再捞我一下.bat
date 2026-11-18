@echo off
setlocal
cd /d "%~dp0"
if /i "%~1"=="/check" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch.ps1" -CheckOnly
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch.ps1" %*
if errorlevel 1 (
  echo Application could not start. Please check your connection and try again.
  pause
)
