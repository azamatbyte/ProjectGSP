<#!
.SYNOPSIS
	Stop Node server and PostgreSQL started by start_services.ps1.
#>
Param(
	[string]$ProgramDataRoot = (Join-Path $env:ProgramData 'GSPApp'),
	[string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)
$ErrorActionPreference = 'Stop'
function Log($m){ Write-Host "[stop] $m" }

$pidDir  = Join-Path $ProgramDataRoot 'pids'
$dataDir = Join-Path $ProgramDataRoot 'pgdata'
$pgBin   = Join-Path $AppRoot 'pg/bin'
$nodePidFile = Join-Path $pidDir 'node.pid'
$pgPidFile   = Join-Path $pidDir 'postgres.pid'

if (Test-Path $nodePidFile) {
	$pid = Get-Content $nodePidFile | Select-Object -First 1
	if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
		Log "Stopping Node (PID $pid)"; Stop-Process -Id $pid -Force
	}
	Remove-Item $nodePidFile -ErrorAction SilentlyContinue
}
else { Log "No node.pid file" }

if (Test-Path $dataDir) {
	try { Log "Stopping PostgreSQL"; & "$pgBin/pg_ctl.exe" -D $dataDir stop | Out-Null } catch { Log "pg_ctl stop failed: $_" }
	Remove-Item $pgPidFile -ErrorAction SilentlyContinue
} else { Log "No pgdata directory; skipping PostgreSQL stop" }

Log "Services stopped."
