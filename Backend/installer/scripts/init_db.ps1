<#!
.SYNOPSIS
	Initialize portable PostgreSQL data directory and generate .env variables if needed.
	NOTE: This script only runs initdb and configures PG. Database creation
	is handled by start_services.ps1 after PostgreSQL is started.
#>
Param(
	[string]$ProgramDataRoot = (Join-Path $env:ProgramData 'GSPApp'),
	[string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)
$ErrorActionPreference = 'Stop'

# Logging functions
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

Write-Debug "Path configuration:"
Write-Debug "  AppRoot: $AppRoot (exists: $(Test-Path $AppRoot))"
Write-Debug "  ProgramDataRoot: $ProgramDataRoot (exists: $(Test-Path $ProgramDataRoot))"
Write-Debug "  pgBin: $pgBin (exists: $(Test-Path $pgBin))"
Write-Debug "  dataDir: $dataDir (exists: $(Test-Path $dataDir))"

$initdbExe = Join-Path $pgBin 'initdb.exe'
Write-Debug "  initdb.exe: $initdbExe (exists: $(Test-Path $initdbExe))"

if (-not (Test-Path $initdbExe)) {
	Write-Err "initdb.exe not found at: $initdbExe"
	if (Test-Path $pgBin) {
		Get-ChildItem $pgBin | ForEach-Object { Write-Err "  $($_.Name)" }
	} else {
		Write-Err "  pgBin directory does not exist: $pgBin"
	}
	exit 1
}

Write-Step "Creating directories..."
New-Item -ItemType Directory -Force -Path $ProgramDataRoot,$logsDir | Out-Null

# If data directory already exists, nothing to do -- database creation
# is handled by start_services.ps1 after PostgreSQL is started.
if (Test-Path $dataDir) {
	Write-Step "Data directory already exists at: $dataDir - skipping initdb."
	Write-Step "========== INIT_DB COMPLETED (nothing to do) =========="
	exit 0
}

# Seed env from app template if ProgramData copy missing
if (-not (Test-Path $envFile)) {
	Write-Debug "Environment file not found, looking for template..."
	$appEnv = Join-Path $AppRoot '.env'
	if (Test-Path $appEnv) {
		Copy-Item $appEnv $envFile
		Write-Debug "  Copied template to $envFile"
	} else {
		'' | Out-File $envFile -Encoding utf8
		Write-Debug "  Created empty env file"
	}
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
Ensure-Line 'DB_HOST' '127.0.0.1'
if (-not (Select-String -Path $envFile -Pattern '^DATABASE_URL=' -Quiet)) {
	$dbUrl = "postgresql://${pgUser}:${pgPass}@127.0.0.1:${pgPort}/${dbName}"
	Add-Content -Path $envFile -Value "DATABASE_URL=$dbUrl"
	Write-Debug "Added DATABASE_URL to env file"
}

# Run initdb (no temporary PG server needed)
Write-Step "Initializing PostgreSQL cluster in $dataDir"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$pwFile = [System.IO.Path]::GetTempFileName()
Set-Content -Path $pwFile -Value $pgPass -NoNewline -Encoding ascii

# Locale selection:
# - Prefer ICU when supported (better case-insensitive behavior for non-ASCII)
# - Allow env overrides via PG_LOCALE_PROVIDER / PG_ICU_LOCALE
# - Fall back to OS default locale if ICU flags are unavailable
$pgLocaleProvider = (Get-Val 'PG_LOCALE_PROVIDER' '')
if ($pgLocaleProvider) { $pgLocaleProvider = $pgLocaleProvider.ToLowerInvariant() }
$pgIcuLocale = Get-Val 'PG_ICU_LOCALE' 'und'
$initdbHelp = & $initdbExe --help 2>&1
$icuSupported = ($initdbHelp -match '--locale-provider') -or ($initdbHelp -match '--icu-locale')

$initdbArgs = @(
	'-U', $pgUser,
	'-D', "$dataDir",
	'--auth=scram-sha-256',
	"--pwfile=$pwFile",
	'--encoding=UTF8'
)

if ($icuSupported) {
	if ($pgLocaleProvider -eq 'libc') {
		$initdbArgs += '--locale-provider=libc'
		Write-Step "Locale: libc (explicit)"
	} else {
		$initdbArgs += '--locale-provider=icu'
		$initdbArgs += "--icu-locale=$pgIcuLocale"
		Write-Step "Locale: ICU ($pgIcuLocale)"
	}
} else {
	if ($pgLocaleProvider -or $pgIcuLocale) {
		Write-Warning "ICU locale flags not supported by this initdb. Using OS default locale."
	} else {
		Write-Step "Locale: OS default (ICU flags not supported)"
	}
}

$initLog = Join-Path $logsDir 'initdb.log'
Write-Step "Running initdb..."

$initResult = & $initdbExe @initdbArgs 2>&1
$initExitCode = $LASTEXITCODE
$initResult | Out-File -FilePath $initLog -Encoding utf8

Remove-Item $pwFile -Force -ErrorAction SilentlyContinue

if ($initExitCode -ne 0) {
	Write-Err "initdb failed (exit code $initExitCode)"
	$initResult | ForEach-Object { Write-Err "  $_" }
	Write-Err "See full log at: $initLog"
	exit 1
}
Write-Step "initdb completed successfully"

# Configure postgresql.conf and pg_hba.conf
Write-Step "Configuring PostgreSQL..."
$postgresConf = Join-Path $dataDir 'postgresql.conf'
$pgHba        = Join-Path $dataDir 'pg_hba.conf'

Add-Content -Path $postgresConf -Value "# --- Custom overrides ---"
Add-Content -Path $postgresConf -Value "listen_addresses = '127.0.0.1'"
Add-Content -Path $postgresConf -Value "port = $pgPort"
Add-Content -Path $postgresConf -Value "client_encoding = 'UTF8'"
Write-Debug "  Set listen_addresses = '127.0.0.1', port = $pgPort, client_encoding = UTF8"

if (-not (Select-String -Path $pgHba -Pattern '127.0.0.1/32' -Quiet)) {
	Add-Content -Path $pgHba -Value "host all all 127.0.0.1/32 scram-sha-256"
	Write-Debug "  Added host authentication rule"
}

Write-Step "========== INIT_DB COMPLETED =========="
Write-Step "Data directory: $dataDir"
Write-Step "Log files: $logsDir"
Write-Step "Note: Database '$dbName' will be created by start_services.ps1"
