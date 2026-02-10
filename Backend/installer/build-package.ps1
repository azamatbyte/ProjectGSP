<#!
.SYNOPSIS
	Build offline Windows installer (EXE) for the backend (Node.js + Prisma + PostgreSQL portable).

.DESCRIPTION
	1. Installs production dependencies (npm ci, prisma generate, prune dev deps).
	2. Assembles build/ directory (app/, node/, pg/, scripts/, .env).
	3. Unpacks provided portable Node and PostgreSQL ZIPs.
	4. Invokes Inno Setup (ISCC) to compile installer specified in installer/backend.iss.

.PARAMETER NodeZip
	Path to Node.js portable ZIP (e.g. node-v20.x.x-win-x64.zip).

.PARAMETER PgZip
	Path to PostgreSQL binaries ZIP (must contain bin/psql.exe after extract somewhere).

.PARAMETER OutputDir
	Directory to store final installer (optional; Inno default also used).

.PARAMETER Clean
	Remove existing build directory before assembling.

.PARAMETER IsccPath
	Custom path to ISCC.exe (defaults to standard Inno Setup 6 install location).

.EXAMPLE
	./installer/build-package.ps1 -NodeZip C:\dl\node-v20.15.0-win-x64.zip -PgZip C:\dl\postgresql-17.5-1-windows-x64-binaries.zip -Clean -Verbose

.NOTES
	Run in PowerShell with execution policy bypass if scripts are blocked:
		Set-ExecutionPolicy -Scope Process Bypass
#>
[CmdletBinding()] Param(
	[Parameter(Mandatory=$true)][string]$NodeZip,
	[Parameter(Mandatory=$true)][string]$PgZip,
	[string]$OutputDir = 'installer/dist',
	[switch]$Clean,
	[string]$IsccPath = 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe'
)

$ErrorActionPreference = 'Stop'
function Step($m){ Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Warn($m){ Write-Warning $m }
function Fail($m){ Write-Error $m; exit 1 }

# Normalize archive paths early (handles running script from different working directory or system32)
try { $NodeZip = (Resolve-Path $NodeZip -ErrorAction Stop).Path } catch { Fail "NodeZip not found: $NodeZip" }
try { $PgZip   = (Resolve-Path $PgZip   -ErrorAction Stop).Path } catch { Fail "PgZip not found: $PgZip" }
Step "Using Node ZIP: $NodeZip"
Step "Using PG   ZIP: $PgZip"

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
		$targetDir  = Split-Path $targetPath -Parent
		if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
		if (-not [string]::IsNullOrEmpty($entry.Name)) {
			# File entry
			try {
				[System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $targetPath, $true)
			} catch {
				Write-Warning "Failed to extract $($entry.FullName): $($_.Exception.Message)"
			}
		} else {
			# Directory entry: ensure exists
			if (-not (Test-Path $targetPath)) { New-Item -ItemType Directory -Force -Path $targetPath | Out-Null }
		}
		$i++
		if ($i -eq 1 -or $i -eq $total -or $i % 50 -eq 0) {
			$pct = [int](($i / $total) * 100)
			Write-Progress -Activity $Activity -Status ("$pct% ($i/$total)") -PercentComplete $pct
		}
	}
	$archive.Dispose()
	Write-Progress -Activity $Activity -Completed -Status ("Done in {0}s" -f [int]$sw.Elapsed.TotalSeconds)
}

# Resolve root & key paths
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BuildDir = Join-Path $Root 'build'
$IssFile = Join-Path $Root 'installer/backend.iss'

if (-not (Test-Path $IssFile)) { Fail "Inno Setup script not found at $IssFile" }
if (-not (Test-Path $NodeZip)) { Fail "NodeZip not found: $NodeZip" }
if (-not (Test-Path $PgZip))   { Fail "PgZip not found: $PgZip" }
if (-not (Test-Path $IsccPath)) { Fail "ISCC.exe not found at $IsccPath. Install Inno Setup or specify -IsccPath." }

if ($Clean -and (Test-Path $BuildDir)) { Step 'Cleaning previous build directory'; Remove-Item $BuildDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

# Ensure no lingering node processes locking prisma engine
Step 'Terminating local node processes (to prevent file locks)'
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -like "$Root*") } | ForEach-Object {
	try { Stop-Process -Id $_.Id -Force -ErrorAction Stop; Write-Host "Stopped node PID=$($_.Id)" } catch { }
}

function Remove-WithRetry($path,[int]$retries=5){
	if (-not (Test-Path $path)) { return }
	for($i=0;$i -lt $retries;$i++){
		try { Remove-Item $path -Recurse -Force -ErrorAction Stop; return }
		catch {
			Start-Sleep -Milliseconds (400 * ($i+1))
			if ($i -eq $retries-1) { throw }
		}
	}
}

# Pre-clean node_modules to avoid EPERM unlink inside npm ci if previous install half-locked
if (Test-Path (Join-Path $Root 'node_modules')) {
	Step 'Pre-clean existing node_modules (retry)'
	try { Remove-WithRetry (Join-Path $Root 'node_modules') 6 } catch { Warn "Could not fully remove node_modules before install: $($_.Exception.Message)" }
}

Step 'Installing dependencies (npm ci)'
Push-Location $Root
if (-not (Test-Path 'package-lock.json')) { Warn 'package-lock.json missing; reproducible install may not be guaranteed.' }
& npm ci
if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed' }
Step 'Prisma generate'
& npx prisma generate
if ($LASTEXITCODE -ne 0) { Fail 'prisma generate failed' }
Step 'Pruning dev dependencies'
& npm prune --production
if ($LASTEXITCODE -ne 0) { Fail 'npm prune failed' }
Pop-Location

Step 'Copying application source'
$AppDest = Join-Path $BuildDir 'app'
if (Test-Path $AppDest) { Remove-Item $AppDest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $AppDest | Out-Null

$Include = @('index.js','api','db','prisma','package.json','package-lock.json','vercel.json')
foreach($i in $Include){ $src = Join-Path $Root $i; if (Test-Path $src){ Copy-Item $src $AppDest -Recurse -Force } }
Copy-Item (Join-Path $Root 'node_modules') $AppDest -Recurse -Force

Step 'Adding installer scripts'
$ScriptsSrc = Join-Path $Root 'installer/scripts'
$ScriptsDest = Join-Path $BuildDir 'scripts'
if (Test-Path $ScriptsDest) { Remove-Item $ScriptsDest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ScriptsDest | Out-Null
# Copy only the contents to avoid nested scripts\scripts duplication
Get-ChildItem -Path $ScriptsSrc | ForEach-Object { Copy-Item $_.FullName -Destination $ScriptsDest -Recurse -Force }

Step 'Preparing .env template'
$RootEnv = Join-Path $Root '.env'
if (Test-Path $RootEnv) { Copy-Item $RootEnv (Join-Path $BuildDir '.env') -Force }
else {
	@(
		'PORT=8080',
		'HOST=127.0.0.1',
		'PGPORT=5433',
		'PGUSER=appuser',
		'# PGPASSWORD generated first run',
		'SERVER_URL=http://localhost:8080',
		'DATABASE_URL='
	) | Set-Content -Path (Join-Path $BuildDir '.env') -Encoding utf8
}

Step 'Unpacking Node runtime'
$NodeDest = Join-Path $BuildDir 'node'
if (Test-Path $NodeDest) { Remove-Item $NodeDest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $NodeDest | Out-Null
Expand-ZipWithProgress -ZipPath $NodeZip -Destination $NodeDest -Activity 'Extracting Node runtime'
$Sub = Get-ChildItem $NodeDest -Directory | Select-Object -First 1
if ($Sub -and (Test-Path (Join-Path $Sub.FullName 'node.exe'))) {
	Step "Flattening Node runtime from '$($Sub.Name)' (copy mode)"
	Get-ChildItem $Sub.FullName -Force | ForEach-Object {
		$target = Join-Path $NodeDest $_.Name
		if (Test-Path $target) { Remove-Item $target -Recurse -Force }
		Copy-Item $_.FullName $target -Recurse -Force
	}
	try { Remove-Item $Sub.FullName -Recurse -Force -ErrorAction SilentlyContinue } catch { }
}
if (-not (Test-Path (Join-Path $NodeDest 'node.exe'))) { Fail 'node.exe not found after extraction' }

Step 'Unpacking PostgreSQL binaries'
$PgDest = Join-Path $BuildDir 'pg'
if (Test-Path $PgDest) { Remove-Item $PgDest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $PgDest | Out-Null
Expand-ZipWithProgress -ZipPath $PgZip -Destination $PgDest -Activity 'Extracting PostgreSQL binaries'

# Locate folder containing bin/psql.exe or psql.exe
$PgBin = $null
Get-ChildItem -Path $PgDest -Directory -Recurse | ForEach-Object {
	if (-not $PgBin) {
		if (Test-Path (Join-Path $_.FullName 'bin/psql.exe')) { $PgBin = $_ }
		elseif (Test-Path (Join-Path $_.FullName 'psql.exe')) { $PgBin = $_ }
	}
}

if ($PgBin) {
	if (Test-Path (Join-Path $PgBin.FullName 'bin/psql.exe')) {
		if ($PgBin.FullName -ne $PgDest) {
			Step "Flattening PostgreSQL from '$($PgBin.Name)'"
			$needed = @('bin','lib','share','include','pgAdmin 4')
			foreach($dir in $needed){
				$srcDir = Join-Path $PgBin.FullName $dir
				if (Test-Path $srcDir) {
					$destDir = Join-Path $PgDest $dir
					if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force }
					try { Move-Item $srcDir $destDir -Force -ErrorAction Stop }
					catch {
						Write-Warning "Move failed for $dir ($($_.Exception.Message)); falling back to copy."
						New-Item -ItemType Directory -Force -Path $destDir | Out-Null
						Copy-Item $srcDir/* $destDir -Recurse -Force
					}
				}
			}
		}
	} elseif (Test-Path (Join-Path $PgBin.FullName 'psql.exe')) {
		Step "Normalizing PostgreSQL layout from single-level '$($PgBin.Name)'"
		$bin = Join-Path $PgDest 'bin'
		New-Item -ItemType Directory -Force -Path $bin | Out-Null
		Copy-Item (Join-Path $PgBin.FullName '*') $bin -Recurse -Force
	}
}

if (-not (Test-Path (Join-Path $PgDest 'bin/psql.exe'))) { Fail 'Could not locate PostgreSQL bin/psql.exe after extraction' }

Step 'Compiling installer with Inno Setup'
& $IsccPath $IssFile
if ($LASTEXITCODE -ne 0) { Fail 'ISCC compilation failed' }

if ($OutputDir) {
	$OutputAbs = Resolve-Path (Join-Path $Root $OutputDir) -ErrorAction SilentlyContinue
	if (-not $OutputAbs) { $OutputAbs = New-Item -ItemType Directory -Force -Path (Join-Path $Root $OutputDir) }
	# Move any freshly built installer matching pattern GSPBackendInstaller.exe
	$built = Get-ChildItem -Path $Root -Filter 'GSPBackendInstaller*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
	if ($built) { Move-Item $built.FullName (Join-Path $OutputAbs 'GSPBackendInstaller.exe') -Force }
}

Step 'DONE'
Write-Host 'Installer created. Check dist folder or Inno default output.' -ForegroundColor Green
