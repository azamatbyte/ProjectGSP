<#!
.SYNOPSIS
	Stop Node server and PostgreSQL started by start_services.ps1.
	Uses Continue error action so that PG stop runs even if Node stop fails.
#>
Param(
	[string]$ProgramDataRoot = (Join-Path $env:ProgramData 'GSPApp'),
	[string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)
# IMPORTANT: use Continue so Node errors do not prevent PG stop
$ErrorActionPreference = 'Continue'
function Log($m){ Write-Host "[stop] $m" }

$pidDir  = Join-Path $ProgramDataRoot 'pids'
$dataDir = Join-Path $ProgramDataRoot 'pgdata'
$pgBin   = Join-Path $AppRoot 'pg\bin'
$nodePidFile = Join-Path $pidDir 'node.pid'
$pgPidFile   = Join-Path $pidDir 'postgres.pid'

# -- Stop Node ----------------------------------------------------------------
try {
	if (Test-Path $nodePidFile) {
		$pid = Get-Content $nodePidFile | Select-Object -First 1
		if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
			Log "Stopping Node process tree (PID $pid)"
			# /T kills entire process tree, /F forces termination
			& taskkill /T /F /PID $pid 2>&1 | Out-Null
		}
		Remove-Item $nodePidFile -Force -ErrorAction SilentlyContinue
	}
	else { Log "No node.pid file" }
} catch {
	Log "Error stopping Node: $_"
}

# -- Stop PostgreSQL -----------------------------------------------------------
try {
	$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
	if ((Test-Path $dataDir) -and (Test-Path $pgCtl)) {
		# Use "fast" mode: rolls back open transactions and disconnects clients
		# immediately instead of waiting for clients to disconnect ("smart" mode)
		Log "Stopping PostgreSQL (fast mode)..."
		$stopOutput = & $pgCtl -D $dataDir stop -m fast -w -t 15 2>&1
		$stopExitCode = $LASTEXITCODE
		if ($stopExitCode -ne 0) {
			Log "pg_ctl fast stop returned $stopExitCode : $stopOutput"
			# Fallback: immediate mode (like SIGQUIT - aborts all processes)
			Log "Trying immediate stop..."
			& $pgCtl -D $dataDir stop -m immediate -w -t 10 2>&1 | Out-Null
			if ($LASTEXITCODE -ne 0) {
				# Last resort: kill all postgres processes from our data dir
				Log "pg_ctl failed - killing postgres processes directly"
				$postmasterPid = $null
				$pmFile = Join-Path $dataDir 'postmaster.pid'
				if (Test-Path $pmFile) {
					$postmasterPid = Get-Content $pmFile | Select-Object -First 1
				}
				if ($postmasterPid -and (Get-Process -Id $postmasterPid -ErrorAction SilentlyContinue)) {
					& taskkill /T /F /PID $postmasterPid 2>&1 | Out-Null
					Log "Killed postgres PID $postmasterPid"
				}
			}
		} else {
			Log "PostgreSQL stopped successfully."
		}
	}
	elseif (-not (Test-Path $dataDir)) {
		Log "No pgdata directory; skipping PostgreSQL stop"
	}
	else {
		Log "pg_ctl.exe not found at $pgCtl"
	}
	Remove-Item $pgPidFile -Force -ErrorAction SilentlyContinue
} catch {
	Log "Error stopping PostgreSQL: $_"
}

# Clean up stale postmaster.pid if postgres is actually gone
try {
	$pmFile = Join-Path $dataDir 'postmaster.pid'
	if (Test-Path $pmFile) {
		$pmPid = Get-Content $pmFile | Select-Object -First 1
		if (-not (Get-Process -Id $pmPid -ErrorAction SilentlyContinue)) {
			Remove-Item $pmFile -Force -ErrorAction SilentlyContinue
			Log "Removed stale postmaster.pid"
		}
	}
} catch {}

Log "Services stopped."
