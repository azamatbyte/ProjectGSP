<#!
.SYNOPSIS
    Launch GSPApp - starts backend services and opens frontend.

.DESCRIPTION
    1. Ensures backend services (PostgreSQL + Node.js) are running
    2. Waits for API to be ready
    3. Launches the frontend Electron app

.PARAMETER AppRoot
    Path to installed GSPApp root
#>
[CmdletBinding()] Param(
    [string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
function Log($m){ Write-Host "[launch] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[launch] $m" -ForegroundColor Yellow }

$BackendRoot = Join-Path $AppRoot 'backend'
$FrontendRoot = Join-Path $AppRoot 'frontend'
$ProgramDataRoot = Join-Path $env:ProgramData 'GSPApp'
$EnvFile = Join-Path $ProgramDataRoot '.env'

# Load environment
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^([^#][^=]*)=(.*)$') {
            $name = $matches[1].Trim()
            $val = $matches[2].Trim()
            if ($name) { Set-Item -Path "Env:$name" -Value $val -ErrorAction SilentlyContinue }
        }
    }
}

$apiPort = if ($env:PORT) { $env:PORT } else { '8080' }
$apiHost = if ($env:HOST) { $env:HOST } else { '127.0.0.1' }

# Check if backend is already running
$apiUrl = "http://${apiHost}:${apiPort}/status"
$backendRunning = $false
try {
    $response = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        $backendRunning = $true
        Log "Backend already running at $apiUrl"
    }
} catch {
    Log "Backend not running, starting services..."
}

# Start backend if needed
if (-not $backendRunning) {
    $startScript = Join-Path $BackendRoot 'scripts\start_services.ps1'
    if (Test-Path $startScript) {
        Log "Starting backend services..."
        & powershell.exe -ExecutionPolicy Bypass -File $startScript -AppRoot $BackendRoot
        
        # Wait for API to be ready (first run needs PG init + prisma push + seed)
        $maxWait = 120
        $waited = 0
        while ($waited -lt $maxWait) {
            try {
                $response = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    Log "Backend is ready!"
                    break
                }
            } catch {
                Start-Sleep -Seconds 2
                $waited += 2
                Write-Host "." -NoNewline
            }
        }
        Write-Host ""
        
        if ($waited -ge $maxWait) {
            Warn "Backend may not be fully ready. Launching frontend anyway..."
        }
    } else {
        Warn "Backend start script not found: $startScript"
    }
}

# Find frontend executable
$frontendExe = Get-ChildItem -Path $FrontendRoot -Filter '*.exe' -File | 
               Where-Object { $_.Name -notmatch 'Uninstall|Update' } | 
               Select-Object -First 1

if ($frontendExe) {
    Log "Launching frontend: $($frontendExe.Name)"
    Start-Process -FilePath $frontendExe.FullName -WorkingDirectory $FrontendRoot
} else {
    Warn "Frontend executable not found in $FrontendRoot"
    # Try to open in browser as fallback
    $browserUrl = "http://${apiHost}:${apiPort}"
    Log "Opening web interface: $browserUrl"
    Start-Process $browserUrl
}
