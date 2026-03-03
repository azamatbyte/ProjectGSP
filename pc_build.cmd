@echo off
setlocal

title GSP Offline Installer Build

echo.
echo ====================================
echo  GSP offline installer build
echo ====================================
echo.

cd /d "%~dp0Backend\installer" || exit /b 1

powershell.exe -ExecutionPolicy Bypass -NoProfile -File ".\build-combined.ps1" -NodeZip ".\node-v22.18.0-win-x64.zip" -PgZip ".\postgresql-17.5-3-windows-x64-binaries.zip" -Clean %*
exit /b %ERRORLEVEL%
