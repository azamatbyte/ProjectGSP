<#!
.SYNOPSIS
	Start PostgreSQL and Node server (idempotent). Pushes Prisma schema and seeds DB on first run.
	Resilient: each step is wrapped in try/catch so Node can start even if PG has issues.
#>
Param(
	[string]$ProgramDataRoot = (Join-Path $env:ProgramData 'GSPApp'),
	[string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
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
try { New-Item -ItemType Directory -Force -Path $logsDir,$pidDir,$uploadsDir | Out-Null } catch {}

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

Log "Configuration:"
Log "  AppRoot: $AppRoot"
Log "  ProgramDataRoot: $ProgramDataRoot"
Log "  pgPort: $pgPort"
Log "  DATABASE_URL: $(if ($env:DATABASE_URL) { $env:DATABASE_URL -replace ':([^:@]+)@', ':***@' } else { 'NOT SET' })"

# -- PostgreSQL ---------------------------------------------------------------
Log "========== POSTGRESQL STARTUP =========="
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
					$isReadyOutput = & $pgIsReady -h localhost -p $pgPort 2>&1
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

# -- Prisma schema push -------------------------------------------------------
# Must run BEFORE Node server starts, so database schema exists
Log "========== PRISMA SCHEMA PUSH =========="
try {
	LogDebug "Prisma CLI path: $prismaCli (exists: $(Test-Path $prismaCli))"
	if (Test-Path $prismaCli) {
		$schemaPath = Join-Path $AppRoot 'app/prisma/schema.prisma'
		LogDebug "Schema path: $schemaPath (exists: $(Test-Path $schemaPath))"
		LogDebug "DATABASE_URL is set: $(if ($env:DATABASE_URL) { 'YES' } else { 'NO' })"

		for ($i=0; $i -lt 3; $i++) {
			try {
				Log "Running prisma db push (attempt $($i+1)/3)..."
				LogDebug "Command: $prismaCli db push --schema `"$schemaPath`" --accept-data-loss"

				$prismaOutput = & $prismaCli db push --schema $schemaPath --accept-data-loss 2>&1
				$prismaExitCode = $LASTEXITCODE

				LogDebug "Prisma exit code: $prismaExitCode"
				$prismaOutput | ForEach-Object { LogDebug "  $_" }

				if ($prismaExitCode -eq 0) {
					Log "Prisma push succeeded."
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
				if ($i -lt 2) { Start-Sleep -Seconds 3 }
			}
		}
	} else {
		LogErr "Prisma CLI not found at $prismaCli - skipping schema push"
		LogErr "This means database schema will not be created!"
	}
} catch {
	LogErr "Prisma push failed with exception: $_"
	LogErr "Exception details: $($_.Exception.Message)"
}

# -- Seed database (once, on first run) ---------------------------------------
# Must run BEFORE Node server starts, so admin accounts exist
Log "========== DATABASE SEEDING =========="
try {
	LogDebug "Seed marker path: $seedMarker (exists: $(Test-Path $seedMarker))"
	if (-not (Test-Path $seedMarker)) {
		$seedJs = Join-Path $AppRoot 'app/scripts/seed.js'
		LogDebug "Seed script path: $seedJs (exists: $(Test-Path $seedJs))"

		if (Test-Path $seedJs) {
			Log "Seeding database (first run)..."
			LogDebug "Command: $nodeExe `"$seedJs`""

			$seedOutput = & $nodeExe $seedJs 2>&1
			$seedExitCode = $LASTEXITCODE

			LogDebug "Seed exit code: $seedExitCode"
			$seedOutput | ForEach-Object { Write-Host "  $_" }

			if ($seedExitCode -eq 0) {
				'seeded' | Out-File $seedMarker -Encoding ascii
				Log "Database seeded successfully."
			} else {
				LogErr "Seed failed (exit code $seedExitCode)"
				LogErr "You can re-run manually: $nodeExe `"$seedJs`""
			}
		} else {
			LogErr "Seed script not found: $seedJs"
		}
	} else {
		Log "Database already seeded (marker file exists)"
	}
} catch {
	LogErr "Seed failed with exception: $_"
	LogErr "Exception details: $($_.Exception.Message)"
}

# -- Node server --------------------------------------------------------------
# Start Node AFTER database is ready with schema and seed data
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
			$workingDir = Join-Path $AppRoot 'app'

			Log "Starting Node server..."
			LogDebug "Working directory: $workingDir"
			LogDebug "App log file: $appLog"
			LogDebug "NODE_ENV will be set to: production"

			$startInfo = New-Object System.Diagnostics.ProcessStartInfo
			$startInfo.FileName = $nodeExe
			$startInfo.Arguments = '"' + $indexJs + '"'
			$startInfo.WorkingDirectory = $workingDir
			$startInfo.RedirectStandardOutput = $true
			$startInfo.RedirectStandardError  = $true
			$startInfo.UseShellExecute = $false
			$startInfo.CreateNoWindow = $true

			# Copy all environment variables
			$envCount = 0
			foreach ($envVar in Get-ChildItem Env:) {
				$startInfo.EnvironmentVariables[$envVar.Name] = $envVar.Value
				$envCount++
			}
			$startInfo.EnvironmentVariables['NODE_ENV'] = 'production'
			LogDebug "Copied $envCount environment variables to Node process"

			$proc = New-Object System.Diagnostics.Process
			$proc.StartInfo = $startInfo

			try {
				$started = $proc.Start()
				if ($started) {
					$proc.Id | Out-File $nodePidFile -Encoding ascii
					Log "Node started successfully (PID $($proc.Id))"

					# Start background job to capture output
					Start-Job -ScriptBlock {
						Param($p,$log)
						try {
							while (-not $p.HasExited) {
								while (-not $p.StandardOutput.EndOfStream) { $p.StandardOutput.ReadLine() | Out-File -FilePath $log -Append }
								while (-not $p.StandardError.EndOfStream)  { $p.StandardError.ReadLine()  | Out-File -FilePath $log -Append }
								Start-Sleep -Milliseconds 200
							}
						} catch { }
					} -ArgumentList $proc,$appLog | Out-Null
					LogDebug "Started background job to capture Node output to: $appLog"
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

try { Stop-Transcript | Out-Null } catch {}

Log "========== START_SERVICES COMPLETED =========="
Log "Check logs at: $logsDir"
Log "  - start_services.log (this script)"
Log "  - postgres.log (PostgreSQL)"
Log "  - app.log (Node.js)"
