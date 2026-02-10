@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  Build КОМПЛЕКС desktop application (.exe installer)
REM ═══════════════════════════════════════════════════════════════════════
REM  Usage:
REM    build-exe.bat                        — Build with defaults (port 8080)
REM    build-exe.bat -Port 9090             — Custom backend port
REM    build-exe.bat -DbPassword secret123  — Custom DB password
REM ═══════════════════════════════════════════════════════════════════════

title КОМПЛЕКС - Building Installer

echo.
echo  ====================================
echo   Building КОМПЛЕКС installer...
echo  ====================================
echo.

powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0build-exe.ps1" %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [FAIL] Build failed. See output above.
    echo.
    pause
    exit /b %ERRORLEVEL%
)

pause
