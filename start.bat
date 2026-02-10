@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  ProjectGSP — Start Backend Server
REM ═══════════════════════════════════════════════════════════════════════
REM  Use this AFTER running install.bat to quickly start the server.
REM  Starts PostgreSQL service if needed, then launches the backend.
REM ═══════════════════════════════════════════════════════════════════════

title ProjectGSP Server

echo.
echo  Starting ProjectGSP...
echo.

REM Try to start PostgreSQL service (ignore errors if already running or not found)
net start postgresql-x64-17 >nul 2>&1
net start postgresql-x64-16 >nul 2>&1
net start postgresql-x64-15 >nul 2>&1
net start postgresql-x64-14 >nul 2>&1

REM Start the backend
cd /d "%~dp0Backend"
echo  Backend starting on port (see .env for PORT)...
echo  Press Ctrl+C to stop.
echo.
node ./index.js
