<#!
.SYNOPSIS
	Start PostgreSQL and Node server (idempotent). Pushes Prisma schema and seeds DB on first run.
	Resilient: each step is wrapped in try/catch so Node can start even if PG has issues.
#>
Param(
	[string]$ProgramDataRoot = (Join-Path $env:ProgramData 'GSPApp'),
	[string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
	[switch]$SkipNodeStart   # Pass from installer to skip Node startup (Electron starts it instead)
)

# Do NOT use $ErrorActionPreference = 'Stop' globally - we want to continue on errors
$ErrorActionPreference = 'Continue'

# Enhanced logging functions
function Log($m){
	$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
	Write-Host "[$timestamp][start] $m"
}
function LogErr($m){
	$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
	Write-Host "[$timestamp][start][ERROR] $m" -ForegroundColor Red
}
function LogDebug($m){
	$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
	Write-Host "[$timestamp][start][DEBUG] $m" -ForegroundColor Yellow
}

$pgBin   = Join-Path $AppRoot 'pg/bin'
$dataDir = Join-Path $ProgramDataRoot 'pgdata'
$logsDir = Join-Path $ProgramDataRoot 'logs'
$envFile = Join-Path $ProgramDataRoot '.env'
$pidDir  = Join-Path $ProgramDataRoot 'pids'
$nodeExe = Join-Path $AppRoot 'node/node.exe'
$indexJs = Join-Path $AppRoot 'app/index.js'
$prismaCli = Join-Path $AppRoot 'app/node_modules/.bin/prisma.cmd'
$seedMarker = Join-Path $ProgramDataRoot '.seeded'
$startLog = Join-Path $logsDir 'start_services.log'

$uploadsDir = Join-Path $AppRoot 'app/uploads'
try {
	New-Item -ItemType Directory -Force -Path $logsDir,$pidDir,$uploadsDir | Out-Null
	# Uploads dir is under Program Files - grant write access so Node can save generated files
	icacls $uploadsDir /grant 'Users:(OI)(CI)F' /Q 2>&1 | Out-Null
} catch {}

# Redirect all script output to log file as well
try { Start-Transcript -Path $startLog -Append -Force | Out-Null } catch {}

Log "========== START_SERVICES SCRIPT STARTED =========="
Log "Script location: $PSScriptRoot"
Log "PowerShell version: $($PSVersionTable.PSVersion)"

# Log all paths for debugging
LogDebug "Checking paths..."
LogDebug "  AppRoot: $AppRoot (exists: $(Test-Path $AppRoot))"
LogDebug "  ProgramDataRoot: $ProgramDataRoot (exists: $(Test-Path $ProgramDataRoot))"
LogDebug "  pgBin: $pgBin (exists: $(Test-Path $pgBin))"
LogDebug "  dataDir: $dataDir (exists: $(Test-Path $dataDir))"
LogDebug "  logsDir: $logsDir (exists: $(Test-Path $logsDir))"
LogDebug "  envFile: $envFile (exists: $(Test-Path $envFile))"
LogDebug "  nodeExe: $nodeExe (exists: $(Test-Path $nodeExe))"
LogDebug "  indexJs: $indexJs (exists: $(Test-Path $indexJs))"
LogDebug "  prismaCli: $prismaCli (exists: $(Test-Path $prismaCli))"

# Check pg_ctl.exe specifically
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$pgIsReady = Join-Path $pgBin 'pg_isready.exe'
LogDebug "  pg_ctl.exe: $pgCtl (exists: $(Test-Path $pgCtl))"
LogDebug "  pg_isready.exe: $pgIsReady (exists: $(Test-Path $pgIsReady))"

# Add portable Node to PATH so that prisma.cmd (and other .cmd shims) can find node.exe
$nodeDir = Split-Path $nodeExe -Parent
if (Test-Path $nodeDir) {
	$env:PATH = "$nodeDir;$($env:PATH)"
	LogDebug "Added Node to PATH: $nodeDir"
}

# Load .env
if (Test-Path $envFile) {
	LogDebug "Loading environment from: $envFile"
	Get-Content $envFile | ForEach-Object {
		if ($_ -match '^([^#][^=]*)=(.*)$') {
			$name = $matches[1].Trim(); $val = $matches[2].Trim()
			if ($name) {
				Set-Item -Path Env:$name -Value $val -ErrorAction SilentlyContinue
				# Don't log passwords
				if ($name -notmatch 'PASSWORD|SECRET|KEY') {
					LogDebug "  Set env: $name=$val"
				} else {
					LogDebug "  Set env: $name=***"
				}
			}
		}
	}
} else {
	LogErr "Environment file not found: $envFile"
}
$pgPort = if ($env:DB_PORT) { $env:DB_PORT } else { '5433' }

# Patch DATABASE_URL: replace localhost with 127.0.0.1 to avoid IPv6 resolution issues
# On Windows 10/11, localhost can resolve to ::1 (IPv6) but PG only listens on 127.0.0.1
if ($env:DATABASE_URL -and $env:DATABASE_URL -match '@localhost:') {
	$env:DATABASE_URL = $env:DATABASE_URL -replace '@localhost:', '@127.0.0.1:'
	LogDebug "Patched DATABASE_URL: replaced @localhost: with @127.0.0.1:"
}

Log "Configuration:"
Log "  AppRoot: $AppRoot"
Log "  ProgramDataRoot: $ProgramDataRoot"
Log "  pgPort: $pgPort"
Log "  DATABASE_URL: $(if ($env:DATABASE_URL) { $env:DATABASE_URL -replace ':([^:@]+)@', ':***@' } else { 'NOT SET' })"

# -- PostgreSQL ---------------------------------------------------------------
Log "========== POSTGRESQL STARTUP =========="

# Create missing timezonesets directory (antivirus may block extraction from installer)
# Without this, autovacuum workers crash every minute with FATAL error
$tzDir = Join-Path $AppRoot 'pg/share/timezonesets'
if (-not (Test-Path $tzDir)) {
	try {
		New-Item -ItemType Directory -Force -Path $tzDir | Out-Null
		Log "Created missing timezonesets directory: $tzDir"
	} catch {
		LogDebug "Could not create timezonesets directory: $_"
	}
}

try {
	# Auto-init if pgdata is missing (init_db.ps1 may have failed during install)
	if (-not (Test-Path $dataDir)) {
		Log "PostgreSQL data dir missing - attempting auto-init..."
		$initScript = Join-Path $PSScriptRoot 'init_db.ps1'
		LogDebug "Looking for init script at: $initScript"
		if (Test-Path $initScript) {
			Log "Running init_db.ps1..."
			& powershell.exe -ExecutionPolicy Bypass -NoProfile -File $initScript -AppRoot $AppRoot -ProgramDataRoot $ProgramDataRoot 2>&1 | Write-Host
			LogDebug "init_db.ps1 completed with exit code: $LASTEXITCODE"
		} else {
			LogErr "init_db.ps1 not found at $initScript"
		}
	}

	if (-not (Test-Path $dataDir)) {
		LogErr "PostgreSQL data dir still missing after init attempt: $dataDir"
		LogErr "Cannot start PostgreSQL without data directory!"
	} else {
		LogDebug "PostgreSQL data directory exists: $dataDir"

		# List contents of data directory for debugging
		$pgDataFiles = Get-ChildItem $dataDir -ErrorAction SilentlyContinue | Select-Object -First 10
		LogDebug "Data dir contents (first 10): $($pgDataFiles.Name -join ', ')"

		# Check postgresql.conf
		$pgConf = Join-Path $dataDir 'postgresql.conf'
		if (Test-Path $pgConf) {
			$portLine = Get-Content $pgConf | Select-String -Pattern '^port\s*=' | Select-Object -First 1
			LogDebug "postgresql.conf port setting: $portLine"

			# Ensure client_encoding = UTF8 (prevents WIN1252 encoding errors with Cyrillic data)
			if (-not (Select-String -Path $pgConf -Pattern "client_encoding\s*=" -Quiet)) {
				Add-Content -Path $pgConf -Value "client_encoding = 'UTF8'"
				Log "Added client_encoding = 'UTF8' to postgresql.conf"
			}
		}

		# Start Postgres if needed
		$pgPidFile = Join-Path $pidDir 'postgres.pid'
		$needStart = $true

		LogDebug "Checking if PostgreSQL is already running..."
		if (Test-Path $pgPidFile) {
			$savedPid = Get-Content $pgPidFile | Select-Object -First 1
			LogDebug "Found PID file with PID: $savedPid"
			$pgProc = $null
			try { $pgProc = Get-Process -Id $savedPid -ErrorAction SilentlyContinue } catch {}
			if ($pgProc) {
				$needStart = $false
				LogDebug "Process with PID $savedPid is running"
			} else {
				LogDebug "Stale PID file (PID $savedPid not running) - removing"
				Remove-Item $pgPidFile -Force -ErrorAction SilentlyContinue
			}
		} else {
			LogDebug "No PID file found at: $pgPidFile"
		}

		# Also check postmaster.pid
		$postmasterPidFile = Join-Path $dataDir 'postmaster.pid'
		if (Test-Path $postmasterPidFile) {
			$pmPid = Get-Content $postmasterPidFile | Select-Object -First 1
			LogDebug "Found postmaster.pid with PID: $pmPid"
			$pmProc = $null
			try { $pmProc = Get-Process -Id $pmPid -ErrorAction SilentlyContinue } catch {}
			if ($pmProc) {
				LogDebug "PostgreSQL postmaster process is running (PID $pmPid)"
				$needStart = $false
			} else {
				LogDebug "Stale postmaster.pid found (PID $pmPid not running) - removing"
				Remove-Item $postmasterPidFile -Force -ErrorAction SilentlyContinue
			}
		}

		if ($needStart) {
			Log "Starting PostgreSQL on port $pgPort..."

			# Verify pg_ctl exists
			if (-not (Test-Path $pgCtl)) {
				LogErr "pg_ctl.exe not found at: $pgCtl"
				LogErr "Contents of pgBin directory:"
				Get-ChildItem $pgBin -ErrorAction SilentlyContinue | ForEach-Object { LogErr "  $($_.Name)" }
			} else {
				$pgLogFile = Join-Path $logsDir 'postgres.log'
				LogDebug "PostgreSQL log file: $pgLogFile"
				LogDebug "Executing: $pgCtl -D `"$dataDir`" -l `"$pgLogFile`" -w start"

				# Use -w flag to wait for startup to complete
				$pgCtlOutput = & $pgCtl -D $dataDir -l $pgLogFile -w start 2>&1
				$pgCtlExitCode = $LASTEXITCODE

				LogDebug "pg_ctl output: $pgCtlOutput"
				LogDebug "pg_ctl exit code: $pgCtlExitCode"

				if ($pgCtlExitCode -ne 0) {
					LogErr "pg_ctl start failed with exit code: $pgCtlExitCode"
					LogErr "pg_ctl output: $pgCtlOutput"

					# Check postgres log for errors
					if (Test-Path $pgLogFile) {
						LogErr "Last 20 lines of postgres.log:"
						Get-Content $pgLogFile -Tail 20 | ForEach-Object { LogErr "  $_" }
					}
				} else {
					Log "pg_ctl start command succeeded"
				}

				# Wait for PostgreSQL to be ready
				Log "Waiting for PostgreSQL to accept connections..."
				$deadline = (Get-Date).AddSeconds(30)
				$pgReady = $false
				$attempts = 0

				while ((Get-Date) -lt $deadline) {
					$attempts++
					$isReadyOutput = & $pgIsReady -h 127.0.0.1 -p $pgPort 2>&1
					$isReadyExitCode = $LASTEXITCODE

					if ($isReadyExitCode -eq 0) {
						$pgReady = $true
						Log "PostgreSQL is ready! (after $attempts attempts)"
						break
					}

					if ($attempts -le 5 -or $attempts % 10 -eq 0) {
						LogDebug "pg_isready attempt $attempts : exit code $isReadyExitCode - $isReadyOutput"
					}

					Start-Sleep -Milliseconds 500
				}

				if (-not $pgReady) {
					LogErr "PostgreSQL did not become ready within 30 seconds!"
					LogErr "Total pg_isready attempts: $attempts"

					# Check if process is running
					if (Test-Path $postmasterPidFile) {
						$pmPid = Get-Content $postmasterPidFile | Select-Object -First 1
						$pmProcess = Get-Process -Id $pmPid -ErrorAction SilentlyContinue
						if ($pmProcess) {
							LogErr "PostgreSQL process IS running (PID $pmPid) but not accepting connections"
						} else {
							LogErr "PostgreSQL process is NOT running (PID $pmPid from postmaster.pid)"
						}
					}

					# Show postgres log
					if (Test-Path $pgLogFile) {
						LogErr "Last 30 lines of postgres.log:"
						Get-Content $pgLogFile -Tail 30 | ForEach-Object { LogErr "  $_" }
					}

					# Fallback: try a simple psql connect to confirm readiness
					$psqlExeFallback = Join-Path $pgBin 'psql.exe'
					$dbUserFallback = if ($env:DB_USER) { $env:DB_USER } else { 'appuser' }
					if (Test-Path $psqlExeFallback) {
						$psqlTest = & $psqlExeFallback -h 127.0.0.1 -p $pgPort -U $dbUserFallback -tAc "SELECT 1" postgres 2>&1
						if ($LASTEXITCODE -eq 0) {
							$pgReady = $true
							Log "PostgreSQL is ready (psql fallback check succeeded)."
						} else {
							LogErr "psql fallback check failed: $psqlTest"
						}
					}
				}

				# Save PID
				if (Test-Path $postmasterPidFile) {
					$pmPid = Get-Content $postmasterPidFile | Select-Object -First 1
					$pmPid | Out-File $pgPidFile -Encoding ascii
					LogDebug "Saved PostgreSQL PID to: $pgPidFile"
				}

				if ($pgReady) {
					Log "PostgreSQL started successfully."
				}
			}
		} else {
			Log "PostgreSQL already running."
		}
	}
} catch {
	LogErr "PostgreSQL start failed with exception: $_"
	LogErr "Exception details: $($_.Exception.Message)"
	LogErr "Stack trace: $($_.ScriptStackTrace)"
}

# -- Password health check ----------------------------------------------------
# If .env was regenerated but pgdata kept old password, fix it via pg_hba.conf trust
Log "========== PASSWORD HEALTH CHECK =========="
try {
	$psqlExe = Join-Path $pgBin 'psql.exe'
	$pgHbaConf = Join-Path $dataDir 'pg_hba.conf'
	$dbUser = if ($env:DB_USER) { $env:DB_USER } else { 'appuser' }
	$dbPass = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { $env:PGPASSWORD }

	if ((Test-Path $psqlExe) -and (Test-Path $pgHbaConf)) {
		# Ensure PGPASSWORD env var matches DB_PASSWORD (psql/createdb use PGPASSWORD)
		if ($dbPass -and (-not $env:PGPASSWORD -or $env:PGPASSWORD -ne $dbPass)) {
			$env:PGPASSWORD = $dbPass
			LogDebug "Synced PGPASSWORD env var from DB_PASSWORD"
		}

		# Test authentication with current password
		$testResult = & $psqlExe -h 127.0.0.1 -p $pgPort -U $dbUser -tAc "SELECT 1" postgres 2>&1
		if ($LASTEXITCODE -eq 0) {
			Log "Password authentication OK."
		} else {
			$testStr = "$testResult"
			if ($testStr -match 'password authentication failed') {
				Log "Password mismatch detected - resetting password via pg_hba.conf trust..."

				# Backup pg_hba.conf
				$pgHbaBackup = "$pgHbaConf.bak"
				Copy-Item $pgHbaConf $pgHbaBackup -Force

				# Temporarily set trust auth for 127.0.0.1
				$hbaContent = Get-Content $pgHbaConf
				$hbaNew = $hbaContent -replace 'host\s+all\s+all\s+127\.0\.0\.1/32\s+scram-sha-256', 'host all all 127.0.0.1/32 trust'
				$hbaNew | Set-Content $pgHbaConf -Encoding ascii

				# Reload PG config (no restart needed)
				& $pgCtl -D $dataDir reload 2>&1 | Out-Null
				Start-Sleep -Seconds 2

				# Reset password
				$escapedPass = $dbPass -replace "'", "''"
				$alterResult = & $psqlExe -h 127.0.0.1 -p $pgPort -U $dbUser -c "ALTER USER `"$dbUser`" WITH PASSWORD '$escapedPass'" postgres 2>&1
				if ($LASTEXITCODE -eq 0) {
					Log "Password reset successfully."
					$env:PGPASSWORD = $dbPass
				} else {
					LogErr "Password reset failed: $alterResult"
				}

				# Restore pg_hba.conf
				Copy-Item $pgHbaBackup $pgHbaConf -Force
				Remove-Item $pgHbaBackup -Force -ErrorAction SilentlyContinue

				# Reload config again
				& $pgCtl -D $dataDir reload 2>&1 | Out-Null
				Start-Sleep -Seconds 2

				# Verify
				$verifyResult = & $psqlExe -h 127.0.0.1 -p $pgPort -U $dbUser -tAc "SELECT 1" postgres 2>&1
				if ($LASTEXITCODE -eq 0) {
					Log "Password verification OK after reset."
				} else {
					LogErr "Password still failing after reset: $verifyResult"
				}
			} else {
				LogDebug "psql test returned non-auth error: $testStr"
			}
		}
	}
} catch {
	LogErr "Password health check failed: $_"
}

# -- Database creation (if needed) --------------------------------------------
# init_db.ps1 only runs initdb; we create the actual database here once PG is running
Log "========== DATABASE CREATION CHECK =========="
try {
	$psqlExe = Join-Path $pgBin 'psql.exe'
	$createdbExe = Join-Path $pgBin 'createdb.exe'
	$dbName = if ($env:DB_NAME) { $env:DB_NAME } else { 'appdb' }
	$dbUser = if ($env:DB_USER) { $env:DB_USER } else { 'appuser' }

	LogDebug "Checking if database '$dbName' exists..."
	if (Test-Path $psqlExe) {
		$dbCheck = & $psqlExe -h 127.0.0.1 -p $pgPort -U $dbUser -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'" postgres 2>&1
		if ("$dbCheck".Trim() -eq '1') {
			Log "Database '$dbName' already exists."
		} else {
			Log "Database '$dbName' not found - creating..."
			for ($i = 0; $i -lt 3; $i++) {
				$createResult = & $createdbExe -h 127.0.0.1 -p $pgPort -U $dbUser $dbName 2>&1
				if ($LASTEXITCODE -eq 0) {
					Log "Database '$dbName' created successfully."
					break
				} elseif ("$createResult" -match 'already exists') {
					Log "Database '$dbName' already exists (confirmed by createdb)."
					break
				} else {
					LogErr "createdb attempt $($i+1) failed: $createResult"
					if ($i -lt 2) { Start-Sleep -Seconds 2 }
				}
			}
		}
	} else {
		LogErr "psql.exe not found at $psqlExe - cannot verify database"
	}
	# Force UTF8 client_encoding at the database level (overrides client locale negotiation)
	# This prevents WIN1252 encoding errors when inserting Cyrillic data
	if (Test-Path $psqlExe) {
		$encResult = & $psqlExe -h 127.0.0.1 -p $pgPort -U $dbUser -c "ALTER DATABASE `"$dbName`" SET client_encoding = 'UTF8'" postgres 2>&1
		if ($LASTEXITCODE -eq 0) {
			Log "Set client_encoding = UTF8 on database '$dbName'"
		} else {
			LogDebug "ALTER DATABASE client_encoding result: $encResult"
		}
	}
} catch {
	LogErr "Database creation check failed: $_"
}

# -- Locale check -------------------------------------------------------------
Log "========== LOCALE CHECK =========="
try {
	$psqlExe = Join-Path $pgBin 'psql.exe'
	$dbUser = if ($env:DB_USER) { $env:DB_USER } else { 'appuser' }

	if (Test-Path $psqlExe) {
		# lc_collate / lc_ctype are not runtime GUCs in newer PG versions.
		# Query pg_database instead (postgres DB always exists).
		$localeRow = & $psqlExe -h 127.0.0.1 -p $pgPort -U $dbUser -tAc "SELECT datcollate || '|' || datctype FROM pg_database WHERE datname = 'postgres';" postgres 2>&1
		$localeTrim = "$localeRow".Trim()
		if ($localeTrim -match '\|') {
			$parts = $localeTrim.Split('|', 2)
			$lcCollateTrim = $parts[0].Trim()
			$lcCtypeTrim = $parts[1].Trim()

			if ($lcCollateTrim -match '^(C|POSIX)$' -or $lcCtypeTrim -match '^(C|POSIX)$') {
				LogErr "WARNING: PostgreSQL locale is lc_collate='$lcCollateTrim', lc_ctype='$lcCtypeTrim'."
				LogErr "Case-insensitive search for non-ASCII names may fail."
				LogErr "Reinitialize data directory: $dataDir"
			} else {
				Log "Locale OK: lc_collate='$lcCollateTrim', lc_ctype='$lcCtypeTrim'"
			}
		} else {
			LogErr "Locale check failed (unexpected output): $localeTrim"
		}
	} else {
		LogErr "psql.exe not found at $psqlExe - cannot check locale"
	}
} catch {
	LogErr "Locale check failed: $_"
}

# -- Prisma schema push -------------------------------------------------------
# Must run BEFORE Node server starts, so database schema exists
Log "========== PRISMA SCHEMA PUSH =========="
$prismaLog = Join-Path $logsDir 'prisma.log'
$prismaOk = $false
try {
	LogDebug "Prisma CLI path: $prismaCli (exists: $(Test-Path $prismaCli))"
	if (Test-Path $prismaCli) {
		$schemaPath = Join-Path $AppRoot 'app/prisma/schema.prisma'
		LogDebug "Schema path: $schemaPath (exists: $(Test-Path $schemaPath))"
		LogDebug "DATABASE_URL is set: $(if ($env:DATABASE_URL) { 'YES' } else { 'NO' })"

		"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] prisma db push started" | Out-File $prismaLog -Encoding utf8
		"DATABASE_URL=$(if ($env:DATABASE_URL) { $env:DATABASE_URL -replace ':([^:@]+)@', ':***@' } else { 'NOT SET' })" | Out-File $prismaLog -Append -Encoding utf8

		for ($i=0; $i -lt 3; $i++) {
			try {
				Log "Running prisma db push (attempt $($i+1)/3)..."
				"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Attempt $($i+1)/3" | Out-File $prismaLog -Append -Encoding utf8

				$prismaOutput = & $prismaCli db push --schema $schemaPath --accept-data-loss 2>&1
				$prismaExitCode = $LASTEXITCODE

				$prismaOutput | Out-File $prismaLog -Append -Encoding utf8
				"Exit code: $prismaExitCode" | Out-File $prismaLog -Append -Encoding utf8

				LogDebug "Prisma exit code: $prismaExitCode"
				$prismaOutput | ForEach-Object { LogDebug "  $_" }

				if ($prismaExitCode -eq 0) {
					Log "Prisma push succeeded."
					$prismaOk = $true
					break
				} else {
					LogErr "Prisma push failed with exit code: $prismaExitCode"
					if ($i -lt 2) {
						Log "Waiting 3 seconds before retry..."
						Start-Sleep -Seconds 3
					}
				}
			}
			catch {
				LogErr "prisma db push attempt $($i+1) exception: $_"
				"EXCEPTION: $_" | Out-File $prismaLog -Append -Encoding utf8
				if ($i -lt 2) { Start-Sleep -Seconds 3 }
			}
		}
	} else {
		LogErr "Prisma CLI not found at $prismaCli - skipping schema push"
		LogErr "This means database schema will not be created!"
		"ERROR: Prisma CLI not found at $prismaCli" | Out-File $prismaLog -Encoding utf8
	}
} catch {
	LogErr "Prisma push failed with exception: $_"
	LogErr "Exception details: $($_.Exception.Message)"
	"EXCEPTION: $_ -- $($_.Exception.Message)" | Out-File $prismaLog -Append -Encoding utf8
}
Log "Prisma log: $prismaLog"

# -- Seed database (once, on first run) ---------------------------------------
# Must run BEFORE Node server starts, so admin accounts exist
Log "========== DATABASE SEEDING =========="
$seedLog = Join-Path $logsDir 'seed.log'
try {
	LogDebug "Seed marker path: $seedMarker (exists: $(Test-Path $seedMarker))"
	if (-not (Test-Path $seedMarker)) {
		$seedJs = Join-Path $AppRoot 'app/scripts/seed.js'
		LogDebug "Seed script path: $seedJs (exists: $(Test-Path $seedJs))"

		if (Test-Path $seedJs) {
			Log "Seeding database (first run)..."
			LogDebug "Command: $nodeExe `"$seedJs`""

			"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Seed started" | Out-File $seedLog -Encoding utf8
			"Command: $nodeExe `"$seedJs`"" | Out-File $seedLog -Append -Encoding utf8
			"DATABASE_URL=$(if ($env:DATABASE_URL) { $env:DATABASE_URL -replace ':([^:@]+)@', ':***@' } else { 'NOT SET' })" | Out-File $seedLog -Append -Encoding utf8
			"Prisma push succeeded: $prismaOk" | Out-File $seedLog -Append -Encoding utf8

			if (-not $prismaOk) {
				LogErr "Skipping seed - prisma db push did not succeed (schema may not exist)"
				"SKIPPED: prisma db push did not succeed" | Out-File $seedLog -Append -Encoding utf8
			} else {
				$seedOutput = & $nodeExe $seedJs 2>&1
				$seedExitCode = $LASTEXITCODE

				"Exit code: $seedExitCode" | Out-File $seedLog -Append -Encoding utf8
				$seedOutput | Out-File $seedLog -Append -Encoding utf8

				LogDebug "Seed exit code: $seedExitCode"
				$seedOutput | ForEach-Object { Write-Host "  $_" }

				if ($seedExitCode -eq 0) {
					'seeded' | Out-File $seedMarker -Encoding ascii
					Log "Database seeded successfully."
					"SUCCESS" | Out-File $seedLog -Append -Encoding utf8
				} else {
					LogErr "Seed failed (exit code $seedExitCode)"
					LogErr "Check log: $seedLog"
					LogErr "You can re-run manually: $nodeExe `"$seedJs`""
					"FAILED" | Out-File $seedLog -Append -Encoding utf8
				}
			}
		} else {
			LogErr "Seed script not found: $seedJs"
			"ERROR: seed.js not found at $seedJs" | Out-File $seedLog -Encoding utf8
		}
	} else {
		Log "Database already seeded (marker file exists)"
	}
} catch {
	LogErr "Seed failed with exception: $_"
	LogErr "Exception details: $($_.Exception.Message)"
	"EXCEPTION: $_ -- $($_.Exception.Message)" | Out-File $seedLog -Append -Encoding utf8
}
Log "Seed log: $seedLog"

# -- Windows Firewall --------------------------------------------------------
Log "========== FIREWALL CONFIGURATION =========="
try {
    $fwPort = if ($env:PORT) { $env:PORT } else { '8080' }
    $fwRuleName = "GSPApp Backend (TCP $fwPort)"
    $existing = Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $fwRuleName -Direction Inbound -Protocol TCP -LocalPort $fwPort -Action Allow -Profile Any | Out-Null
        Log "Created firewall rule: $fwRuleName"
    } else {
        Log "Firewall rule already exists: $fwRuleName"
    }
} catch {
    LogErr "Firewall rule creation failed: $_"
    LogErr "You may need to manually allow TCP port $fwPort in Windows Firewall"
}

# -- Node server --------------------------------------------------------------
# Start Node AFTER database is ready with schema and seed data.
# Skipped during installer run (-SkipNodeStart); Electron's ensureBackendRunning() starts it instead.
if (-not $SkipNodeStart) {
Log "========== NODE SERVER STARTUP =========="
try {
	$nodePidFile = Join-Path $pidDir 'node.pid'
	$nodeAlready = $false

	LogDebug "Checking if Node is already running..."
	LogDebug "Node PID file: $nodePidFile (exists: $(Test-Path $nodePidFile))"

	if (Test-Path $nodePidFile) {
		$savedPid = Get-Content $nodePidFile | Select-Object -First 1
		LogDebug "Found PID file with PID: $savedPid"
		if ($savedPid -and (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)) {
			$nodeAlready = $true
			Log "Node already running (PID $savedPid)"
		} else {
			LogDebug "Process with PID $savedPid is NOT running"
		}
	}

	if (-not $nodeAlready) {
		LogDebug "node.exe path: $nodeExe (exists: $(Test-Path $nodeExe))"
		LogDebug "index.js path: $indexJs (exists: $(Test-Path $indexJs))"

		if (-not (Test-Path $nodeExe)) {
			LogErr "node.exe not found: $nodeExe"
		}
		elseif (-not (Test-Path $indexJs)) {
			LogErr "index.js not found: $indexJs"
		}
		else {
			$appLog = Join-Path $logsDir 'app.log'
			$appErrLog = Join-Path $logsDir 'app-error.log'
			$workingDir = Join-Path $AppRoot 'app'

			Log "Starting Node server..."
			LogDebug "Working directory: $workingDir"
			LogDebug "App log file: $appLog"

			# Set NODE_ENV in current session (child process inherits environment)
			$env:NODE_ENV = 'production'

			try {
				# Use cmd /C wrapper: gives Node a new detached console (no shared console with PowerShell).
				# - PowerShell can exit immediately after this line.
				# - cmd.exe stays alive as long as node runs; taskkill /T on cmd PID also kills node child.
				# - PID file stores cmd.exe PID — works for alive-check and stop_services.ps1 (which uses /T).
				$cmdArgs = "/C `"$nodeExe`" --max-old-space-size=4096 `"$indexJs`" 1>>`"$appLog`" 2>>`"$appErrLog`""
				$proc = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdArgs `
					-WorkingDirectory $workingDir -WindowStyle Hidden -PassThru
				if ($proc) {
					$proc.Id | Out-File $nodePidFile -Encoding ascii
					Log "Node started successfully (cmd PID $($proc.Id))"
				} else {
					LogErr "Failed to start Node process"
				}
			} catch {
				LogErr "Exception starting Node: $_"
				LogErr "Exception details: $($_.Exception.Message)"
			}
		}
	}
} catch {
	LogErr "Node start failed with exception: $_"
	LogErr "Exception details: $($_.Exception.Message)"
	LogErr "Stack trace: $($_.ScriptStackTrace)"
}
} else {
	Log "========== NODE SERVER STARTUP SKIPPED (-SkipNodeStart) =========="
	Log "Electron will start Node via ensureBackendRunning() on first launch."
}

try { Stop-Transcript | Out-Null } catch {}

Log "========== START_SERVICES COMPLETED =========="
Log "Check logs at: $logsDir"
Log "  - start_services.log (this script)"
Log "  - postgres.log (PostgreSQL)"
Log "  - prisma.log (Prisma schema push)"
Log "  - seed.log (Database seeding)"
Log "  - app.log (Node.js)"
