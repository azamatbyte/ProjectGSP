<#!
.SYNOPSIS
	Initialize portable PostgreSQL data directory and generate .env variables if needed.
#>
Param(
	[string]$ProgramDataRoot = (Join-Path $env:ProgramData 'GSPApp'),
	[string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)
$ErrorActionPreference = 'Stop'

# Enhanced logging functions
function Write-Step($m){
	$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
	Write-Host "[$timestamp][init_db] $m" -ForegroundColor Cyan
}
function Write-Debug($m){
	$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
	Write-Host "[$timestamp][init_db][DEBUG] $m" -ForegroundColor Yellow
}
function Write-Err($m){
	$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
	Write-Host "[$timestamp][init_db][ERROR] $m" -ForegroundColor Red
}

Write-Step "========== INIT_DB SCRIPT STARTED =========="
Write-Step "Script location: $PSScriptRoot"
Write-Step "PowerShell version: $($PSVersionTable.PSVersion)"

$pgBin   = Join-Path $AppRoot 'pg/bin'
$dataDir = Join-Path $ProgramDataRoot 'pgdata'
$logsDir = Join-Path $ProgramDataRoot 'logs'
$envFile = Join-Path $ProgramDataRoot '.env'

# Log all paths
Write-Debug "Path configuration:"
Write-Debug "  AppRoot: $AppRoot (exists: $(Test-Path $AppRoot))"
Write-Debug "  ProgramDataRoot: $ProgramDataRoot (exists: $(Test-Path $ProgramDataRoot))"
Write-Debug "  pgBin: $pgBin (exists: $(Test-Path $pgBin))"
Write-Debug "  dataDir: $dataDir (exists: $(Test-Path $dataDir))"
Write-Debug "  logsDir: $logsDir (exists: $(Test-Path $logsDir))"
Write-Debug "  envFile: $envFile (exists: $(Test-Path $envFile))"

# Check PostgreSQL binaries
$initdbExe = Join-Path $pgBin 'initdb.exe'
$pgCtlExe = Join-Path $pgBin 'pg_ctl.exe'
$pgIsReadyExe = Join-Path $pgBin 'pg_isready.exe'
$createdbExe = Join-Path $pgBin 'createdb.exe'

Write-Debug "PostgreSQL binaries:"
Write-Debug "  initdb.exe: $initdbExe (exists: $(Test-Path $initdbExe))"
Write-Debug "  pg_ctl.exe: $pgCtlExe (exists: $(Test-Path $pgCtlExe))"
Write-Debug "  pg_isready.exe: $pgIsReadyExe (exists: $(Test-Path $pgIsReadyExe))"
Write-Debug "  createdb.exe: $createdbExe (exists: $(Test-Path $createdbExe))"

if (-not (Test-Path $initdbExe)) {
	Write-Err "initdb.exe not found! Listing pgBin directory contents:"
	if (Test-Path $pgBin) {
		Get-ChildItem $pgBin | ForEach-Object { Write-Err "  $($_.Name)" }
	} else {
		Write-Err "  pgBin directory does not exist: $pgBin"
	}
	exit 1
}

Write-Step "Creating directories..."
New-Item -ItemType Directory -Force -Path $ProgramDataRoot,$logsDir | Out-Null
Write-Debug "Directories created/verified"

# Seed env from app template if ProgramData copy missing
if (-not (Test-Path $envFile)) {
	Write-Debug "Environment file not found, looking for template..."
	$appEnv = Join-Path $AppRoot '.env'
	Write-Debug "  Looking for: $appEnv (exists: $(Test-Path $appEnv))"
	if (Test-Path $appEnv) {
		Copy-Item $appEnv $envFile
		Write-Debug "  Copied template to $envFile"
	} else {
		'' | Out-File $envFile -Encoding utf8
		Write-Debug "  Created empty env file"
	}
} else {
	Write-Debug "Environment file already exists: $envFile"
}

# Parse env file into map
Write-Debug "Parsing environment file..."
$envMap = @{}
Get-Content $envFile | ForEach-Object {
	$line = $_.Trim()
	if (-not $line) { return }
	if ($line.StartsWith('#')) { return }
	$eq = $line.IndexOf('='); if ($eq -lt 1) { return }
	$k = $line.Substring(0,$eq).Trim()
	$v = $line.Substring($eq+1)
	if ($k) { $envMap[$k] = $v }
}
Write-Debug "Parsed $($envMap.Count) environment variables"

function Get-Val([string]$k,[string]$def){ if ($envMap.ContainsKey($k) -and $envMap[$k]) { return $envMap[$k] } return $def }

$pgUser = Get-Val 'DB_USER' 'appuser'
$pgPort = Get-Val 'DB_PORT' '5433'
$pgPass = Get-Val 'DB_PASSWORD' ([Guid]::NewGuid().ToString('n').Substring(0,24))
$dbName = Get-Val 'DB_NAME' 'appdb'

Write-Step "Database configuration:"
Write-Step "  User: $pgUser"
Write-Step "  Port: $pgPort"
Write-Step "  Database: $dbName"
Write-Step "  Password: ***"

# Ensure env file has keys
function Ensure-Line($key,$value){
	if (-not (Select-String -Path $envFile -Pattern "^$key=" -Quiet)) {
		Add-Content -Path $envFile -Value "$key=$value"
		Write-Debug "Added $key to env file"
	}
}
Ensure-Line 'DB_USER' $pgUser
Ensure-Line 'DB_PORT' $pgPort
Ensure-Line 'DB_PASSWORD' $pgPass
Ensure-Line 'DB_NAME' $dbName
Ensure-Line 'DB_HOST' 'localhost'
if (-not (Select-String -Path $envFile -Pattern '^DATABASE_URL=' -Quiet)) {
	$dbUrl = "postgresql://${pgUser}:${pgPass}@localhost:${pgPort}/${dbName}"
	Add-Content -Path $envFile -Value "DATABASE_URL=$dbUrl"
	Write-Debug "Added DATABASE_URL to env file"
}

if (Test-Path $dataDir) {
	Write-Step "Data directory already exists at: $dataDir"
	Write-Step "Skipping initdb - checking if database '$dbName' exists..."
	Write-Debug "Contents of data directory:"
	Get-ChildItem $dataDir -ErrorAction SilentlyContinue | Select-Object -First 10 | ForEach-Object { Write-Debug "  $($_.Name)" }

	# Start a temporary PG server to check/create the database
	$logFile = Join-Path $logsDir 'postgres-init.log'
	$env:PGPASSWORD = $pgPass

	# Check if PG is already running
	$pgAlreadyRunning = $false
	$isReadyCheck = & $pgIsReadyExe -h 127.0.0.1 -p $pgPort 2>&1
	if ($LASTEXITCODE -eq 0) {
		$pgAlreadyRunning = $true
		Write-Step "PostgreSQL is already running on port $pgPort"
	} else {
		Write-Step "Starting temporary PostgreSQL server..."
		$startResult = & $pgCtlExe -D $dataDir -l $logFile -w -t 30 start 2>&1
		if ($LASTEXITCODE -ne 0) {
			Write-Err "Failed to start PostgreSQL: $startResult"
			exit 1
		}
		# Wait for ready
		$deadline = (Get-Date).AddSeconds(30)
		$ready = $false
		while ((Get-Date) -lt $deadline) {
			$null = & $pgIsReadyExe -h 127.0.0.1 -p $pgPort 2>&1
			if ($LASTEXITCODE -eq 0) { $ready = $true; break }
			Start-Sleep -Milliseconds 500
		}
		if (-not $ready) {
			Write-Err "PostgreSQL did not become ready within 30 seconds"
			exit 1
		}
	}

	# Check if database exists
	$psqlExe = Join-Path $pgBin 'psql.exe'
	$dbExists = & $psqlExe -h 127.0.0.1 -p $pgPort -U $pgUser -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'" 2>&1
	if ($dbExists -eq '1') {
		Write-Step "Database '$dbName' already exists - nothing to do."
	} else {
		Write-Step "Database '$dbName' not found - creating..."
		$createResult = & $createdbExe -h 127.0.0.1 -p $pgPort -U $pgUser $dbName 2>&1
		if ($LASTEXITCODE -eq 0) {
			Write-Step "Database '$dbName' created successfully"
		} else {
			Write-Err "Failed to create database '$dbName': $createResult"
		}
	}

	# Stop temporary server only if we started it
	if (-not $pgAlreadyRunning) {
		Write-Step "Stopping temporary PostgreSQL server..."
		& $pgCtlExe -D $dataDir -w -t 30 stop 2>&1 | Out-Null
	}
	exit 0
}

Write-Step "Initializing PostgreSQL cluster in $dataDir"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Write-Debug "Created data directory"

$pwFile = [System.IO.Path]::GetTempFileName()
Set-Content -Path $pwFile -Value $pgPass -NoNewline -Encoding ascii
Write-Debug "Created temporary password file: $pwFile"

$initLog = Join-Path $logsDir 'initdb.log'
Write-Step "Running initdb..."
Write-Debug "Command: $initdbExe -U $pgUser -D `"$dataDir`" --auth=scram-sha-256 --pwfile=`"$pwFile`" --encoding=UTF8 --locale=C"

$initResult = & $initdbExe -U $pgUser -D "$dataDir" --auth=scram-sha-256 --pwfile="$pwFile" --encoding=UTF8 --locale=C 2>&1
$initExitCode = $LASTEXITCODE
$initResult | Out-File -FilePath $initLog -Encoding utf8

Write-Debug "initdb exit code: $initExitCode"
if ($initExitCode -ne 0) {
	Write-Err "initdb failed (exit code $initExitCode)"
	Write-Err "initdb output:"
	$initResult | ForEach-Object { Write-Err "  $_" }
	Write-Err "See full log at: $initLog"
	Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
	exit 1
}
Write-Step "initdb completed successfully"
Remove-Item $pwFile -Force -ErrorAction SilentlyContinue

# Adjust configs
Write-Step "Configuring PostgreSQL..."
$postgresConf = Join-Path $dataDir 'postgresql.conf'
$pgHba        = Join-Path $dataDir 'pg_hba.conf'

Write-Debug "Updating postgresql.conf: $postgresConf"
Add-Content -Path $postgresConf -Value "# --- Custom overrides ---"
Add-Content -Path $postgresConf -Value "listen_addresses = '127.0.0.1'"
Add-Content -Path $postgresConf -Value "port = $pgPort"
Write-Debug "  Set listen_addresses = '127.0.0.1'"
Write-Debug "  Set port = $pgPort"

if (-not (Select-String -Path $pgHba -Pattern '127.0.0.1/32' -Quiet)) {
	Write-Debug "Updating pg_hba.conf: $pgHba"
	Add-Content -Path $pgHba -Value "host all all 127.0.0.1/32 scram-sha-256"
	Write-Debug "  Added host authentication rule"
}

# Start temporary server to create the database
$logFile = Join-Path $logsDir 'postgres-init.log'
Write-Step "Starting temporary PostgreSQL server..."
Write-Debug "Command: $pgCtlExe -D `"$dataDir`" -l `"$logFile`" -w -t 30 start"

$startResult = & $pgCtlExe -D $dataDir -l $logFile -w -t 30 start 2>&1
$startExitCode = $LASTEXITCODE

Write-Debug "pg_ctl start exit code: $startExitCode"
if ($startExitCode -ne 0) {
	Write-Err "pg_ctl start returned $startExitCode"
	Write-Err "pg_ctl output: $startResult"
	if (Test-Path $logFile) {
		Write-Err "PostgreSQL log (last 20 lines):"
		Get-Content $logFile -Tail 20 | ForEach-Object { Write-Err "  $_" }
	}
}

# Wait for PostgreSQL to be ready
Write-Step "Waiting for PostgreSQL to accept connections..."
$deadline = (Get-Date).AddSeconds(30)
$ready = $false
$attempts = 0

while ((Get-Date) -lt $deadline) {
	$attempts++
	$isReadyOutput = & $pgIsReadyExe -h 127.0.0.1 -p $pgPort 2>&1
	$isReadyExitCode = $LASTEXITCODE

	if ($isReadyExitCode -eq 0) {
		$ready = $true
		Write-Step "PostgreSQL is ready (after $attempts attempts)"
		break
	}

	if ($attempts -le 5 -or $attempts % 10 -eq 0) {
		Write-Debug "pg_isready attempt $attempts : exit code $isReadyExitCode"
	}

	Start-Sleep -Milliseconds 500
}

if (-not $ready) {
	Write-Err "PostgreSQL did not become ready within 30 seconds"
	Write-Err "Total attempts: $attempts"
	if (Test-Path $logFile) {
		Write-Err "PostgreSQL log (last 30 lines):"
		Get-Content $logFile -Tail 30 | ForEach-Object { Write-Err "  $_" }
	}
	exit 1
}

Write-Step "Creating database '$dbName'..."
Write-Debug "Command: $createdbExe -h 127.0.0.1 -p $pgPort -U $pgUser $dbName"

# Set PGPASSWORD so createdb can authenticate (pg_hba.conf uses scram-sha-256)
$env:PGPASSWORD = $pgPass

$createSuccess = $false
for ($i = 0; $i -lt 3; $i++) {
	$createResult = & $createdbExe -h 127.0.0.1 -p $pgPort -U $pgUser $dbName 2>&1
	$createExitCode = $LASTEXITCODE

	if ($createExitCode -eq 0) {
		Write-Step "Database '$dbName' created successfully"
		$createSuccess = $true
		break
	} else {
		Write-Err "createdb attempt $($i+1) returned $createExitCode"
		Write-Err "createdb output: $createResult"
		if ($i -lt 2) { Start-Sleep -Seconds 2 }
	}
}

if (-not $createSuccess) {
	Write-Err "Failed to create database '$dbName' after 3 attempts"
}

Write-Step "Stopping temporary PostgreSQL server..."
$stopResult = & $pgCtlExe -D $dataDir -w -t 30 stop 2>&1
$stopExitCode = $LASTEXITCODE
Write-Debug "pg_ctl stop exit code: $stopExitCode"

Write-Step "========== INIT_DB COMPLETED =========="
Write-Step "Data directory: $dataDir"
Write-Step "Log files: $logsDir"
