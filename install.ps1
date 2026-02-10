#Requires -Version 5.1
<#
.SYNOPSIS
    ProjectGSP Installation & Launch Script
.DESCRIPTION
    Installs dependencies, builds the frontend, configures the database,
    seeds initial data, and starts the backend server.
.NOTES
    Run from PowerShell:  .\install.ps1
    Or via the batch file: install.bat
#>

param(
    # ── Configurable parameters ──────────────────────────────────────────
    [int]    $Port          = 8080,
    [string] $DbUser        = "postgres",
    [string] $DbPassword    = "postgres",
    [string] $DbHost        = "localhost",
    [int]    $DbPort        = 5432,
    [string] $DbName        = "mbdatabase",
    [switch] $SkipSeed,
    [switch] $SkipBuild,
    [switch] $InstallOnly   # Setup everything but don't start the server
)

# ── Strict mode ──────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ── Paths ────────────────────────────────────────────────────────────────
$ProjectRoot  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackendDir   = Join-Path $ProjectRoot "Backend"
$FrontendDir  = Join-Path $ProjectRoot "frontedn_v2"
$BackendEnv   = Join-Path $BackendDir  ".env"
$FrontendEnv  = Join-Path $FrontendDir ".env"

# ── Derived values ───────────────────────────────────────────────────────
$DatabaseUrl  = "postgresql://${DbUser}:${DbPassword}@${DbHost}:${DbPort}/${DbName}"
$ServerUrl    = "http://localhost:${Port}"

# ── Helpers ──────────────────────────────────────────────────────────────
function Write-Step  { param([string]$msg) Write-Host "`n========================================" -ForegroundColor Cyan; Write-Host "  $msg" -ForegroundColor Cyan; Write-Host "========================================" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red }

function Test-Command {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 1 — Pre-flight checks
# ══════════════════════════════════════════════════════════════════════════
Write-Step "1/9  Pre-flight checks"

# Node.js
if (-not (Test-Command "node")) {
    Write-Fail "Node.js is not installed or not in PATH."
    Write-Host "       Please install Node.js >= 18 from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
$nodeVersion = (node -v) -replace '^v',''
$nodeMajor   = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 18) {
    Write-Fail "Node.js $nodeVersion found — version 18+ is required."
    exit 1
}
Write-Ok "Node.js v$nodeVersion"

# npm
if (-not (Test-Command "npm")) {
    Write-Fail "npm is not found in PATH."
    exit 1
}
Write-Ok "npm $(npm -v)"

# PostgreSQL — try to find psql or the Windows service
$psqlFound = Test-Command "psql"

# Try to start the PostgreSQL Windows service if it exists
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService) {
    if ($pgService.Status -ne 'Running') {
        Write-Warn "PostgreSQL service '$($pgService.Name)' is not running. Attempting to start..."
        try {
            Start-Service $pgService.Name -ErrorAction Stop
            Start-Sleep -Seconds 3
            Write-Ok "PostgreSQL service started."
        } catch {
            Write-Fail "Could not start PostgreSQL service. Please start it manually."
            Write-Host "       Run: net start $($pgService.Name)" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Ok "PostgreSQL service '$($pgService.Name)' is running."
    }
} else {
    Write-Warn "No PostgreSQL Windows service found. Make sure PostgreSQL is running on ${DbHost}:${DbPort}."
}

# Test database connectivity
if ($psqlFound) {
    $env:PGPASSWORD = $DbPassword
    $connTest = & psql -h $DbHost -p $DbPort -U $DbUser -c "SELECT 1;" -t 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Cannot connect to PostgreSQL at ${DbHost}:${DbPort} as '${DbUser}'."
        Write-Host "       Error: $connTest" -ForegroundColor Yellow
        Write-Host "       Please verify PostgreSQL is running and credentials are correct." -ForegroundColor Yellow
        exit 1
    }
    Write-Ok "Connected to PostgreSQL at ${DbHost}:${DbPort}"

    # Create database if it doesn't exist
    $dbExists = & psql -h $DbHost -p $DbPort -U $DbUser -tc "SELECT 1 FROM pg_database WHERE datname='$DbName';" 2>&1
    if ($dbExists -notmatch '1') {
        Write-Warn "Database '$DbName' does not exist. Creating..."
        & createdb -h $DbHost -p $DbPort -U $DbUser $DbName 2>&1
        if ($LASTEXITCODE -ne 0) {
            & psql -h $DbHost -p $DbPort -U $DbUser -c "CREATE DATABASE `"$DbName`";" 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "Could not create database '$DbName'. Please create it manually."
                exit 1
            }
        }
        Write-Ok "Database '$DbName' created."
    } else {
        Write-Ok "Database '$DbName' exists."
    }
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
} else {
    Write-Warn "psql not found in PATH — skipping database connectivity check."
    Write-Warn "Make sure PostgreSQL is running and database '$DbName' exists."
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 2 — Configure backend .env
# ══════════════════════════════════════════════════════════════════════════
Write-Step "2/9  Configuring backend .env"

# Backup existing .env
if (Test-Path $BackendEnv) {
    Copy-Item $BackendEnv "$BackendEnv.bak" -Force
    Write-Ok "Backed up existing .env to .env.bak"
}

# Read existing .env and preserve non-overridden keys
$envContent = @"
PORT=$Port
HOST=0.0.0.0
NODE_ENV=production
USERNAME=
PASSWORD=
EMAILCOMPANY=

DB_USER=$DbUser
DB_HOST=$DbHost
DB_PASSWORD=$DbPassword
DB_NAME=$DbName
DB_PORT=$DbPort

JWT_SECRET_KEY=2315465461319846574984631531
ADMIN_ID_KEY=6630b47f8ca26c59ba6ba200

SERVER_URL=$ServerUrl
DATABASE_URL="$DatabaseUrl"
"@

# Preserve JWT_SECRET_KEY from existing .env if it exists
if (Test-Path "$BackendEnv.bak") {
    $existingEnv = Get-Content "$BackendEnv.bak" -Raw
    $jwtMatch = [regex]::Match($existingEnv, 'JWT_SECRET_KEY=(.+)')
    if ($jwtMatch.Success) {
        $existingJwt = $jwtMatch.Groups[1].Value.Trim()
        $envContent = $envContent -replace 'JWT_SECRET_KEY=.+', "JWT_SECRET_KEY=$existingJwt"
    }
    $adminMatch = [regex]::Match($existingEnv, 'ADMIN_ID_KEY=(.+)')
    if ($adminMatch.Success) {
        $existingAdmin = $adminMatch.Groups[1].Value.Trim()
        $envContent = $envContent -replace 'ADMIN_ID_KEY=.+', "ADMIN_ID_KEY=$existingAdmin"
    }
}

Set-Content -Path $BackendEnv -Value $envContent -Encoding UTF8 -NoNewline
Write-Ok "Backend .env configured (PORT=$Port, DB=$DbName)"

# ══════════════════════════════════════════════════════════════════════════
# STEP 3 — Install backend dependencies
# ══════════════════════════════════════════════════════════════════════════
Write-Step "3/9  Installing backend dependencies"

Push-Location $BackendDir
try {
    & npm install 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "npm install failed in backend" }
    Write-Ok "Backend dependencies installed."
} finally {
    Pop-Location
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 4 — Prisma: generate client & push schema to database
# ══════════════════════════════════════════════════════════════════════════
Write-Step "4/9  Setting up database schema (Prisma)"

Push-Location $BackendDir
try {
    Write-Host "  Running prisma generate..." -ForegroundColor Gray
    & npx prisma generate 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
    Write-Ok "Prisma client generated."

    Write-Host "  Running prisma db push..." -ForegroundColor Gray
    & npx prisma db push --accept-data-loss 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "prisma db push failed" }
    Write-Ok "Database schema synced."
} finally {
    Pop-Location
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 5 — Seed the database
# ══════════════════════════════════════════════════════════════════════════
if (-not $SkipSeed) {
    Write-Step "5/9  Seeding database (admin credentials & default data)"

    Push-Location $BackendDir
    try {
        & npm run seed 2>&1 | ForEach-Object { Write-Host "  $_" }
        if ($LASTEXITCODE -ne 0) { throw "npm run seed failed" }
        Write-Ok "Database seeded successfully."
        Write-Host "  Default credentials:" -ForegroundColor Gray
        Write-Host "    superadmin / (pre-set password)" -ForegroundColor Gray
        Write-Host "    admin01    / (pre-set password)" -ForegroundColor Gray
        Write-Host "    admin02    / (pre-set password)" -ForegroundColor Gray
    } finally {
        Pop-Location
    }
} else {
    Write-Step "5/9  Seeding database — SKIPPED"
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 6 — Backend health check
# ══════════════════════════════════════════════════════════════════════════
Write-Step "6/9  Backend health check"

Push-Location $BackendDir
try {
    Write-Host "  Starting backend for health check on port $Port..." -ForegroundColor Gray
    $backendProc = Start-Process -FilePath "node" -ArgumentList "./index.js" -WorkingDirectory $BackendDir -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $ProjectRoot "healthcheck_stdout.log") -RedirectStandardError (Join-Path $ProjectRoot "healthcheck_stderr.log")
    Start-Sleep -Seconds 5

    # Check /status endpoint
    $healthOk = $false
    for ($i = 0; $i -lt 3; $i++) {
        try {
            $response = Invoke-RestMethod -Uri "${ServerUrl}/status" -Method GET -TimeoutSec 5 -ErrorAction Stop
            if ($response.Hello -eq "World!") {
                $healthOk = $true
                break
            }
        } catch {
            Write-Host "  Attempt $($i+1)/3 - waiting..." -ForegroundColor Gray
            Start-Sleep -Seconds 3
        }
    }

    # Stop health-check process
    if (-not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
    Remove-Item (Join-Path $ProjectRoot "healthcheck_stdout.log") -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $ProjectRoot "healthcheck_stderr.log") -ErrorAction SilentlyContinue

    if ($healthOk) {
        Write-Ok "Backend health check PASSED (GET /status returned OK)."
    } else {
        Write-Fail "Backend health check FAILED — the server did not respond correctly."
        $errLog = Join-Path $ProjectRoot "healthcheck_stderr.log"
        if (Test-Path $errLog) {
            Write-Host "  Error log:" -ForegroundColor Yellow
            Get-Content $errLog | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
        }
        Write-Fail "Installation aborted. Fix the issues above and re-run."
        exit 1
    }
} finally {
    Pop-Location
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 7 — Configure frontend .env & install dependencies
# ══════════════════════════════════════════════════════════════════════════
if (-not $SkipBuild) {
    Write-Step "7/9  Installing frontend dependencies"

    # Backup and configure frontend .env for production build
    if (Test-Path $FrontendEnv) {
        Copy-Item $FrontendEnv "$FrontendEnv.bak" -Force
    }

    # For production: REACT_APP_SITE_BACKEND is set to empty string so that
    # the axios baseURL becomes "/api/v1/" (relative path). This way the
    # frontend works on any host/port served by the backend.
    $frontendEnvContent = @"
# /// path to backend (empty = relative URL for production build)
REACT_APP_SITE_BACKEND=

# frontend running port (only used in dev mode)
PORT=3000
AUTO_OPEN_BROWSER=false
"@
    Set-Content -Path $FrontendEnv -Value $frontendEnvContent -Encoding UTF8 -NoNewline
    Write-Ok "Frontend .env configured for production build (relative API paths)."

    Push-Location $FrontendDir
    try {
        & npm install 2>&1 | ForEach-Object { Write-Host "  $_" }
        if ($LASTEXITCODE -ne 0) { throw "npm install failed in frontend" }
        Write-Ok "Frontend dependencies installed."
    } finally {
        Pop-Location
    }

    # ══════════════════════════════════════════════════════════════════════
    # STEP 8 — Build frontend & copy to backend
    # ══════════════════════════════════════════════════════════════════════
    Write-Step "8/9  Building frontend"

    Push-Location $FrontendDir
    try {
        # Set environment variable for the build (overrides .env)
        $env:REACT_APP_SITE_BACKEND = ""
        & npm run build 2>&1 | ForEach-Object { Write-Host "  $_" }
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
        Remove-Item Env:\REACT_APP_SITE_BACKEND -ErrorAction SilentlyContinue
        Write-Ok "Frontend built successfully."
    } finally {
        Pop-Location
    }

    # Copy build output to backend
    $frontendBuild = Join-Path $FrontendDir "build"
    $backendBuild  = Join-Path $BackendDir  "build"

    if (-not (Test-Path $frontendBuild)) {
        Write-Fail "Frontend build folder not found at $frontendBuild"
        exit 1
    }

    if (Test-Path $backendBuild) {
        Remove-Item $backendBuild -Recurse -Force
    }

    Copy-Item $frontendBuild $backendBuild -Recurse -Force
    Write-Ok "Frontend build copied to Backend/build/"

    # Restore frontend .env for dev mode
    $devFrontendEnv = @"
# /// path to backend
REACT_APP_SITE_BACKEND=http://localhost:$Port

# frontend running port
PORT=3000
AUTO_OPEN_BROWSER=false
"@
    Set-Content -Path $FrontendEnv -Value $devFrontendEnv -Encoding UTF8 -NoNewline
    Write-Ok "Frontend .env restored for development (REACT_APP_SITE_BACKEND=http://localhost:$Port)"
} else {
    Write-Step "7/9  Frontend install — SKIPPED"
    Write-Step "8/9  Frontend build — SKIPPED"
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 9 — Launch the backend
# ══════════════════════════════════════════════════════════════════════════
Write-Step "9/9  Launching backend server"

Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "  │  Installation complete!                         │" -ForegroundColor Green
Write-Host "  │                                                 │" -ForegroundColor Green
Write-Host "  │  Backend URL:  http://localhost:$Port             │" -ForegroundColor Green
Write-Host "  │  API Docs:     http://localhost:$Port/api/v1/api-docs│" -ForegroundColor Green
Write-Host "  │  Health:       http://localhost:$Port/status      │" -ForegroundColor Green
Write-Host "  │                                                 │" -ForegroundColor Green
Write-Host "  │  Press Ctrl+C to stop the server.               │" -ForegroundColor Green
Write-Host "  └─────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""

if (-not $InstallOnly) {
    Push-Location $BackendDir
    try {
        & node ./index.js
    } finally {
        Pop-Location
    }
} else {
    Write-Host "  Server not started (InstallOnly mode)." -ForegroundColor Yellow
    Write-Host "  To start later, run:" -ForegroundColor Yellow
    Write-Host "    cd Backend && npm start" -ForegroundColor White
}
