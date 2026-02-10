@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  ProjectGSP — Installation & Launch Script
REM ═══════════════════════════════════════════════════════════════════════
REM  Usage:
REM    install.bat                     — Install with default settings (port 8080)
REM    install.bat -Port 9090          — Use custom port
REM    install.bat -SkipSeed           — Skip database seeding
REM    install.bat -SkipBuild          — Skip frontend build
REM    install.bat -InstallOnly        — Setup only, don't start server
REM
REM    install.bat -DbUser myuser -DbPassword mypass -DbName mydb
REM ═══════════════════════════════════════════════════════════════════════

title ProjectGSP Installer

echo.
echo  ====================================
echo   ProjectGSP Installation
echo  ====================================
echo.

REM Launch the PowerShell script, passing all arguments through
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0install.ps1" %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [FAIL] Installation encountered errors. See output above.
    echo.
    pause
    exit /b %ERRORLEVEL%
)
