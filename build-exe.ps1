#Requires -Version 5.1
<#
.SYNOPSIS
    Build the КОМПЛЕКС desktop application (.exe installer).
.DESCRIPTION
    1. Builds the React frontend with relative API paths
    2. Prepares a production-ready backend copy (with node_modules & Prisma)
    3. Places the frontend build inside the backend copy
    4. Runs electron-builder to produce a Windows NSIS installer
.NOTES
    Prerequisites: Node.js >= 18, npm, PostgreSQL client tools (for prisma generate).
    Run:  .\build-exe.ps1
    Or:   build-exe.bat
#>

param(
    [int]    $Port       = 8080,
    [string] $DbUser     = "postgres",
    [string] $DbPassword = "postgres",
    [string] $DbHost     = "localhost",
    [int]    $DbPort     = 5432,
    [string] $DbName     = "mbdatabase"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ── Paths ────────────────────────────────────────────────────────────────
$ProjectRoot  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackendDir   = Join-Path $ProjectRoot "Backend"
$FrontendDir  = Join-Path $ProjectRoot "frontedn_v2"
$DistBackend  = Join-Path $FrontendDir "dist-backend"   # staging area for electron-builder
$DatabaseUrl  = "postgresql://${DbUser}:${DbPassword}@${DbHost}:${DbPort}/${DbName}"

# ── Helpers ──────────────────────────────────────────────────────────────
function Write-Step  { param([string]$msg) Write-Host "`n========================================" -ForegroundColor Cyan; Write-Host "  $msg" -ForegroundColor Cyan; Write-Host "========================================" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [OK] $msg"   -ForegroundColor Green }
function Write-Fail  { param([string]$msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red }

# ══════════════════════════════════════════════════════════════════════════
# STEP 1 — Pre-flight
# ══════════════════════════════════════════════════════════════════════════
Write-Step "1/6  Pre-flight checks"

$nodeVersion = (node -v) -replace '^v',''
$nodeMajor   = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 18) { Write-Fail "Node.js $nodeVersion — need 18+"; exit 1 }
Write-Ok "Node.js v$nodeVersion, npm $(npm -v)"

if (-not (Test-Path $BackendDir))  { Write-Fail "Backend dir not found: $BackendDir";   exit 1 }
if (-not (Test-Path $FrontendDir)) { Write-Fail "Frontend dir not found: $FrontendDir"; exit 1 }
Write-Ok "Project directories found."

# ══════════════════════════════════════════════════════════════════════════
# STEP 2 — Build React frontend (with relative API paths)
# ══════════════════════════════════════════════════════════════════════════
Write-Step "2/6  Building React frontend"

Push-Location $FrontendDir
try {
    # Install frontend deps
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Gray
    & npm install 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "npm install failed (frontend)" }

    # Build with empty REACT_APP_SITE_BACKEND so axios uses relative /api/v1/ paths
    $env:REACT_APP_SITE_BACKEND = ""
    Write-Host "  Building with REACT_APP_SITE_BACKEND='' (relative paths)..." -ForegroundColor Gray
    & npm run build 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "react-scripts build failed" }
    Remove-Item Env:\REACT_APP_SITE_BACKEND -ErrorAction SilentlyContinue
    Write-Ok "Frontend built to $FrontendDir\build"
} finally {
    Pop-Location
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 3 — Prepare production backend (dist-backend)
# ══════════════════════════════════════════════════════════════════════════
Write-Step "3/6  Preparing production backend"

# Clean staging area
if (Test-Path $DistBackend) {
    Remove-Item $DistBackend -Recurse -Force
}
New-Item -ItemType Directory -Path $DistBackend -Force | Out-Null

# Copy backend source files (exclude node_modules, build, docker files, .git)
$excludeDirs  = @("node_modules", "build", ".git", "docker-compose.yml", "Dockerfile")
Write-Host "  Copying backend source files..." -ForegroundColor Gray

# Copy individual items, skipping excluded ones
Get-ChildItem -Path $BackendDir | Where-Object {
    $excludeDirs -notcontains $_.Name
} | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $DistBackend $_.Name) -Recurse -Force
}
Write-Ok "Backend source copied."

# Copy frontend build into backend's build/ folder (backend serves it)
$backendBuildTarget = Join-Path $DistBackend "build"
Copy-Item (Join-Path $FrontendDir "build") $backendBuildTarget -Recurse -Force
Write-Ok "Frontend build placed in dist-backend/build/"

# Install production dependencies only
Write-Host "  Installing backend production dependencies..." -ForegroundColor Gray
Push-Location $DistBackend
try {
    & npm install --production 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "npm install --production failed (backend)" }
    Write-Ok "Backend production dependencies installed."

    # Generate Prisma client (needs the schema and node_modules/@prisma)
    Write-Host "  Generating Prisma client..." -ForegroundColor Gray
    & npx prisma generate 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
    Write-Ok "Prisma client generated."
} finally {
    Pop-Location
}

# Write a production .env into dist-backend
$prodEnv = @"
PORT=$Port
HOST=0.0.0.0
NODE_ENV=production

DB_USER=$DbUser
DB_HOST=$DbHost
DB_PASSWORD=$DbPassword
DB_NAME=$DbName
DB_PORT=$DbPort

JWT_SECRET_KEY=2315465461319846574984631531
ADMIN_ID_KEY=6630b47f8ca26c59ba6ba200

SERVER_URL=http://localhost:$Port
DATABASE_URL="$DatabaseUrl"
"@
Set-Content -Path (Join-Path $DistBackend ".env") -Value $prodEnv -Encoding UTF8 -NoNewline
Write-Ok "Production .env written."

# ══════════════════════════════════════════════════════════════════════════
# STEP 4 — Install Electron dependencies
# ══════════════════════════════════════════════════════════════════════════
Write-Step "4/6  Installing Electron dependencies"

Push-Location $FrontendDir
try {
    # Ensure electron and electron-builder are installed (in devDependencies)
    & npm install 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "npm install failed (electron deps)" }
    Write-Ok "Electron dependencies ready."
} finally {
    Pop-Location
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 5 — Run electron-builder
# ══════════════════════════════════════════════════════════════════════════
Write-Step "5/6  Building Electron installer"

Push-Location $FrontendDir
try {
    Write-Host "  Running electron-builder..." -ForegroundColor Gray
    & npx electron-builder --win 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
    Write-Ok "Electron build completed."
} finally {
    Pop-Location
}

# ══════════════════════════════════════════════════════════════════════════
# STEP 6 — Summary
# ══════════════════════════════════════════════════════════════════════════
Write-Step "6/6  Build complete!"

$distDir = Join-Path $FrontendDir "dist"
Write-Host ""
Write-Host "  ┌────────────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "  │  Build successful!                                     │" -ForegroundColor Green
Write-Host "  │                                                        │" -ForegroundColor Green
Write-Host "  │  Installer location:                                   │" -ForegroundColor Green
Write-Host "  │    $distDir"                                                -ForegroundColor Green
Write-Host "  │                                                        │" -ForegroundColor Green
Write-Host "  │  The installer bundles:                                │" -ForegroundColor Green
Write-Host "  │    - Frontend (React build)                            │" -ForegroundColor Green
Write-Host "  │    - Backend (Express + Prisma + API)                  │" -ForegroundColor Green
Write-Host "  │    - Electron shell                                    │" -ForegroundColor Green
Write-Host "  │                                                        │" -ForegroundColor Green
Write-Host "  │  User still needs:                                     │" -ForegroundColor Green
Write-Host "  │    - PostgreSQL running on the target machine          │" -ForegroundColor Green
Write-Host "  │    - Database '$DbName' created                        │" -ForegroundColor Green
Write-Host "  │    - Tables + seed: run install.bat on target          │" -ForegroundColor Green
Write-Host "  │                                                        │" -ForegroundColor Green
Write-Host "  │  Config file (created on first run):                   │" -ForegroundColor Green
Write-Host "  │    C:\ProgramData\GSPApp\.env                          │" -ForegroundColor Green
Write-Host "  └────────────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""

# List installer files
if (Test-Path $distDir) {
    Write-Host "  Files in dist/:" -ForegroundColor Cyan
    Get-ChildItem $distDir -File | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 1)
        Write-Host "    $($_.Name)  ($sizeMB MB)" -ForegroundColor White
    }
}

# Clean up staging area
Write-Host ""
$cleanup = Read-Host "  Clean up staging directory (dist-backend)? [Y/n]"
if ($cleanup -ne 'n' -and $cleanup -ne 'N') {
    Remove-Item $DistBackend -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok "Staging directory cleaned."
}
