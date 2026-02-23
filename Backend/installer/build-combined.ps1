<#!
.SYNOPSIS
    Build combined Windows installer for GSPApp (Backend + Frontend).

.DESCRIPTION
    1. Builds Backend: npm ci, prisma generate, prune dev deps
    2. Builds Frontend: npm run build (React) + electron-builder pack
    3. Assembles combined build/ directory
    4. Compiles installer with Inno Setup

.PARAMETER NodeZip
    Path to Node.js portable ZIP (e.g. node-v22.x.x-win-x64.zip)

.PARAMETER PgZip
    Path to PostgreSQL binaries ZIP

.PARAMETER FrontendDir
    Path to frontend directory (default: ../../frontedn_v2)

.PARAMETER OutputDir
    Directory for final installer (default: dist)

.PARAMETER Clean
    Remove existing build directory before assembling

.PARAMETER SkipFrontend
    Skip frontend build (use existing build)

.PARAMETER SkipBackend
    Skip backend build (use existing build)

.PARAMETER IsccPath
    Custom path to ISCC.exe

.EXAMPLE
    ./build-combined.ps1 -NodeZip ".\node-v22.18.0-win-x64.zip" -PgZip ".\postgresql-17.5-3-windows-x64-binaries.zip" -Clean

.NOTES
    Run with: Set-ExecutionPolicy -Scope Process Bypass
#>
[CmdletBinding()] Param(
    [Parameter(Mandatory=$true)][string]$NodeZip,
    [Parameter(Mandatory=$true)][string]$PgZip,
    [string]$FrontendDir = '',
    [string]$OutputDir = 'dist',
    [switch]$Clean,
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [string]$IsccPath = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
)

$ErrorActionPreference = 'Stop'
function Step($m){ Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Warn($m){ Write-Warning $m }
function Fail($m){ Write-Error $m; exit 1 }
function Stop-ProcessIfExists([int]$Pid) {
    try {
        Stop-Process -Id $Pid -Force -ErrorAction Stop
        Write-Host "Stopped PID=$Pid"
        return $true
    } catch {
        return $false
    }
}
function Stop-ProcessesUsingPath([string[]]$Paths) {
    if (-not $Paths -or $Paths.Count -eq 0) { return 0 }
    $PathRegexes = $Paths | Where-Object { $_ } | ForEach-Object { [regex]::Escape($_) }
    if (-not $PathRegexes -or $PathRegexes.Count -eq 0) { return 0 }

    $matches = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $cmd = $_.CommandLine
        $exe = $_.ExecutablePath
        ($cmd -and ($PathRegexes | Where-Object { $cmd -match $_ } | Select-Object -First 1)) -or
        ($exe -and ($PathRegexes | Where-Object { $exe -match $_ } | Select-Object -First 1))
    }
    $stopped = 0
    foreach ($proc in $matches) {
        if (Stop-ProcessIfExists -Pid $proc.ProcessId) { $stopped++ }
    }
    return $stopped
}
function Remove-DirectoryWithRetry([string]$Path, [int]$MaxAttempts = 5, [int]$DelaySeconds = 2) {
    if (-not (Test-Path $Path)) { return }
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            Remove-Item $Path -Recurse -Force -ErrorAction Stop
            return
        } catch {
            $msg = $_.Exception.Message
            Warn "Failed to remove '$Path' (attempt $attempt/$MaxAttempts): $msg"
            [void](Stop-ProcessesUsingPath -Paths @($Path))
            if ($attempt -lt $MaxAttempts) {
                Start-Sleep -Seconds $DelaySeconds
            } else {
                Fail "Could not remove '$Path'. Close apps using files in this folder and retry."
            }
        }
    }
}

# Resolve script root (handles -File invocation where $PSScriptRoot may be empty)
$ScriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
if (-not $ScriptRoot) { $ScriptRoot = (Get-Location).Path }

# Resolve FrontendDir if not provided
if (-not $FrontendDir) {
    $FrontendDir = Join-Path (Split-Path $ScriptRoot -Parent) '..\frontedn_v2'
    if (Test-Path $FrontendDir) { $FrontendDir = (Resolve-Path $FrontendDir).Path }
}

# Validate paths
try { $NodeZip = (Resolve-Path $NodeZip -ErrorAction Stop).Path } catch { Fail "NodeZip not found: $NodeZip" }
try { $PgZip = (Resolve-Path $PgZip -ErrorAction Stop).Path } catch { Fail "PgZip not found: $PgZip" }
if (-not (Test-Path $FrontendDir)) { Fail "Frontend directory not found: $FrontendDir" }
if (-not (Test-Path $IsccPath)) { Fail "ISCC.exe not found at $IsccPath. Install Inno Setup 6." }

Step "Build Configuration"
Write-Host "Node ZIP: $NodeZip"
Write-Host "PG ZIP: $PgZip"
Write-Host "Frontend: $FrontendDir"

# Resolve paths
$BackendRoot = (Resolve-Path (Join-Path $ScriptRoot '..')).Path
$BuildDir = Join-Path $BackendRoot 'build'
$IssFile = Join-Path $ScriptRoot 'combined.iss'

if (-not (Test-Path $IssFile)) { Fail "Inno Setup script not found at $IssFile" }

if ($Clean -and (Test-Path $BuildDir)) { 
    Step 'Cleaning previous build directory'
    $killed = Stop-ProcessesUsingPath -Paths @($BuildDir, (Join-Path $FrontendDir 'dist\win-unpacked'))
    if ($killed -gt 0) { Write-Host "Stopped $killed process(es) locking previous build artifacts." -ForegroundColor Yellow }
    Remove-DirectoryWithRetry -Path $BuildDir -MaxAttempts 5 -DelaySeconds 2
}
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

# Progress-enabled ZIP extraction
function Expand-ZipWithProgress {
    [CmdletBinding()] Param(
        [Parameter(Mandatory=$true)][string]$ZipPath,
        [Parameter(Mandatory=$true)][string]$Destination,
        [string]$Activity = 'Extracting'
    )
    if (-not (Test-Path $ZipPath)) { Fail "Zip not found: $ZipPath" }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (-not (Test-Path $Destination)) { New-Item -ItemType Directory -Force -Path $Destination | Out-Null }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    $total = $archive.Entries.Count
    $i = 0
    foreach ($entry in $archive.Entries) {
        $targetPath = Join-Path $Destination $entry.FullName
        $targetDir = Split-Path $targetPath -Parent
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
        if (-not [string]::IsNullOrEmpty($entry.Name)) {
            try {
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $targetPath, $true)
            } catch {
                Write-Warning "Failed to extract $($entry.FullName): $($_.Exception.Message)"
            }
        }
        $i++
        if ($i -eq 1 -or $i -eq $total -or $i % 100 -eq 0) {
            $pct = [int](($i / $total) * 100)
            Write-Progress -Activity $Activity -Status ("$pct% ($i/$total)") -PercentComplete $pct
        }
    }
    $archive.Dispose()
    Write-Progress -Activity $Activity -Completed
}

#region Backend Build
if (-not $SkipBackend) {
    Step 'Terminating local node/prisma processes'
    $candidates = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.Name -in @('node.exe', 'npm.exe', 'npx.exe', 'query-engine-windows.exe')) -and
        $_.CommandLine -and
        ($_.CommandLine -match [regex]::Escape($BackendRoot))
    }
    foreach ($proc in $candidates) {
        [void](Stop-ProcessIfExists -Pid $proc.ProcessId)
    }
    Start-Sleep -Seconds 2

    Step 'Installing Backend dependencies (npm ci)'
    Push-Location $BackendRoot
    & npm ci
    if ($LASTEXITCODE -ne 0) {
        Warn 'npm ci failed on first attempt. Retrying after cleanup of Prisma lock candidates.'
        $prismaDll = Join-Path $BackendRoot 'node_modules\.prisma\client\query_engine-windows.dll.node'
        if (Test-Path $prismaDll) {
            try { attrib -R $prismaDll 2>$null | Out-Null } catch { }
        }
        $lockCandidates = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
            ($_.Name -in @('node.exe', 'query-engine-windows.exe')) -and
            $_.CommandLine -and
            ($_.CommandLine -match [regex]::Escape($BackendRoot))
        }
        foreach ($proc in $lockCandidates) {
            [void](Stop-ProcessIfExists -Pid $proc.ProcessId)
        }
        if (Test-Path $prismaDll) {
            try { Remove-Item $prismaDll -Force -ErrorAction Stop } catch { }
        }
        Start-Sleep -Seconds 2
        & npm ci
        if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed' }
    }
    
    Step 'Generating Prisma client'
    & npx prisma generate
    if ($LASTEXITCODE -ne 0) { Fail 'prisma generate failed' }
    
    Step 'Pruning dev dependencies'
    & npm prune --production
    if ($LASTEXITCODE -ne 0) { Fail 'npm prune failed' }
    Pop-Location

    Step 'Copying Backend application'
    $AppDest = Join-Path $BuildDir 'app'
    if (Test-Path $AppDest) { Remove-Item $AppDest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $AppDest | Out-Null

    $Include = @(
        'index.js',
        'app',
        'api',
        'core',
        'db',
        'prisma',
        'config',
        'scripts',
        'package.json',
        'package-lock.json'
    )
    foreach ($i in $Include) {
        $src = Join-Path $BackendRoot $i
        if (Test-Path $src) { Copy-Item $src $AppDest -Recurse -Force }
    }
    Copy-Item (Join-Path $BackendRoot 'node_modules') $AppDest -Recurse -Force

    Step 'Copying installer scripts'
    $ScriptsSrc = Join-Path $PSScriptRoot 'scripts'
    $ScriptsDest = Join-Path $BuildDir 'scripts'
    if (Test-Path $ScriptsDest) { Remove-Item $ScriptsDest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $ScriptsDest | Out-Null
    Get-ChildItem -Path $ScriptsSrc -File | ForEach-Object { Copy-Item $_.FullName -Destination $ScriptsDest -Force }

    Step 'Unpacking Node.js runtime'
    $NodeDest = Join-Path $BuildDir 'node'
    if (Test-Path $NodeDest) { Remove-Item $NodeDest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $NodeDest | Out-Null
    Expand-ZipWithProgress -ZipPath $NodeZip -Destination $NodeDest -Activity 'Extracting Node.js'
    
    # Flatten Node directory
    $Sub = Get-ChildItem $NodeDest -Directory | Select-Object -First 1
    if ($Sub -and (Test-Path (Join-Path $Sub.FullName 'node.exe'))) {
        Get-ChildItem $Sub.FullName -Force | ForEach-Object {
            $target = Join-Path $NodeDest $_.Name
            if (Test-Path $target) { Remove-Item $target -Recurse -Force }
            Copy-Item $_.FullName $target -Recurse -Force
        }
        Remove-Item $Sub.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path (Join-Path $NodeDest 'node.exe'))) { Fail 'node.exe not found after extraction' }

    Step 'Unpacking PostgreSQL'
    $PgDest = Join-Path $BuildDir 'pg'
    if (Test-Path $PgDest) { Remove-Item $PgDest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $PgDest | Out-Null
    Expand-ZipWithProgress -ZipPath $PgZip -Destination $PgDest -Activity 'Extracting PostgreSQL'
    
    # Locate and flatten PostgreSQL
    $PgBin = $null
    Get-ChildItem -Path $PgDest -Directory -Recurse | ForEach-Object {
        if (-not $PgBin -and (Test-Path (Join-Path $_.FullName 'bin/psql.exe'))) { $PgBin = $_ }
    }
    if ($PgBin -and $PgBin.FullName -ne $PgDest) {
        $needed = @('bin', 'lib', 'share', 'include')
        foreach ($dir in $needed) {
            $srcDir = Join-Path $PgBin.FullName $dir
            if (Test-Path $srcDir) {
                $destDir = Join-Path $PgDest $dir
                if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force }
                Copy-Item $srcDir $destDir -Recurse -Force
            }
        }
    }
    if (-not (Test-Path (Join-Path $PgDest 'bin/psql.exe'))) { Fail 'psql.exe not found after extraction' }

    # Verify critical PostgreSQL directories exist (missing share/timezonesets causes FATAL errors at runtime)
    $requiredPgDirs = @('bin', 'lib', 'share', 'share/timezonesets', 'share/timezone')
    foreach ($d in $requiredPgDirs) {
        $checkPath = Join-Path $PgDest $d
        if (-not (Test-Path $checkPath)) { Fail "PostgreSQL directory missing after extraction: $d (expected at $checkPath)" }
    }
    Write-Host "PostgreSQL directories verified OK" -ForegroundColor Green
}
#endregion

#region Frontend Build
if (-not $SkipFrontend) {
    Step 'Installing Frontend dependencies'
    Push-Location $FrontendDir
    & npm ci
    if ($LASTEXITCODE -ne 0) { Fail 'Frontend npm ci failed' }

    Step 'Building Frontend (React)'
    # Set empty REACT_APP_SITE_BACKEND so the build uses relative URLs.
    # This allows the frontend to correctly call APIs on the same host/port as the backend.
    $env:REACT_APP_SITE_BACKEND = ''
    & npm run build
    if ($LASTEXITCODE -ne 0) { Fail 'Frontend build failed' }

    Step 'Packaging Frontend (Electron)'
    & npm run pack
    if ($LASTEXITCODE -ne 0) { Fail 'Electron pack failed' }
    Pop-Location

    Step 'Copying Frontend to build directory'
    $FrontendDest = Join-Path $BuildDir 'frontend'
    if (Test-Path $FrontendDest) { Remove-Item $FrontendDest -Recurse -Force }
    
    # Copy unpacked Electron app
    $ElectronUnpacked = Join-Path $FrontendDir 'dist\win-unpacked'
    if (-not (Test-Path $ElectronUnpacked)) { Fail "Electron unpacked directory not found: $ElectronUnpacked" }
    Copy-Item $ElectronUnpacked $FrontendDest -Recurse -Force

    Step 'Copying React build to backend app directory'
    # The backend serves React static files from app/build
    $ReactBuild = Join-Path $FrontendDir 'build'
    $AppBuildDest = Join-Path $BuildDir 'app\build'
    if (Test-Path $ReactBuild) {
        if (Test-Path $AppBuildDest) { Remove-Item $AppBuildDest -Recurse -Force }
        Copy-Item $ReactBuild $AppBuildDest -Recurse -Force
        Write-Host "Copied React build to $AppBuildDest"
    } else {
        Warn "React build folder not found at $ReactBuild"
    }
}
#endregion

#region Environment Template
Step 'Creating environment template'
$EnvTemplate = @"
# === GSPApp Configuration ===
# This file is a template. Runtime config is stored in %ProgramData%\GSPApp\.env

# Server Configuration
HOST=127.0.0.1
PORT=8080
NODE_ENV=production

# PostgreSQL Configuration
PGPORT=5433
PGUSER=appuser
# PGPASSWORD is auto-generated on first run

# Database Connection (auto-configured on first run)
DB_HOST=localhost
DB_PORT=5433
DB_USER=appuser
DB_NAME=appdb
# DATABASE_URL is auto-generated

# Security (auto-generated on first run)
# JWT_SECRET_KEY=<generated>

# Frontend API Connection (only needed in development; production uses relative URLs)
# REACT_APP_SITE_BACKEND=http://127.0.0.1:8080
"@
$EnvTemplate | Set-Content -Path (Join-Path $BuildDir 'env.template') -Encoding utf8
#endregion

#region Convert logo PNG to ICO for installer
function Convert-PngToIco {
    param([string]$PngPath, [string]$IcoPath)
    Add-Type -AssemblyName System.Drawing
    $src = [System.Drawing.Image]::FromFile((Resolve-Path $PngPath).Path)
    $bmp = New-Object System.Drawing.Bitmap(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, 256, 256)
    $g.Dispose(); $src.Dispose()
    $pngStream = New-Object System.IO.MemoryStream
    $bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pngBytes = $pngStream.ToArray(); $pngStream.Dispose()
    # Build ICO (Vista PNG-in-ICO: single 256x256 PNG-compressed entry)
    $ms = New-Object System.IO.MemoryStream
    $w  = New-Object System.IO.BinaryWriter($ms)
    $w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)  # ICO header
    $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0)  # dir: w,h,colors,reserved
    $w.Write([uint16]1); $w.Write([uint16]32)                       # planes, bitcount
    $w.Write([uint32]$pngBytes.Length); $w.Write([uint32]22)        # size, offset (6+16=22)
    $w.Write($pngBytes, 0, $pngBytes.Length)
    $w.Flush()
    [System.IO.File]::WriteAllBytes($IcoPath, $ms.ToArray())
    $w.Dispose(); $ms.Dispose()
}

Step 'Generating installer icon (PNG -> ICO)'
$PngSrc = Join-Path $PSScriptRoot '..\..\frontedn_v2\public\img\gsbp_mini.png'
$IcoDst = Join-Path $PSScriptRoot 'gsbp_mini.ico'
Convert-PngToIco -PngPath $PngSrc -IcoPath $IcoDst
Write-Host "Icon written: $IcoDst"
#endregion

#region Compile Installer
Step 'Compiling installer with Inno Setup'
& $IsccPath $IssFile "/O$($BuildDir)\$OutputDir"
if ($LASTEXITCODE -ne 0) { Fail 'ISCC compilation failed' }
#endregion

Step 'BUILD COMPLETE'
$InstallerPath = Get-ChildItem -Path (Join-Path $BuildDir $OutputDir) -Filter '*.exe' | Select-Object -First 1
if ($InstallerPath) {
    Write-Host "Installer created: $($InstallerPath.FullName)" -ForegroundColor Green
    Write-Host "Size: $([math]::Round($InstallerPath.Length / 1MB, 2)) MB" -ForegroundColor Green
}
