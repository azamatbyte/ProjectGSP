<#!
.SYNOPSIS
  Show runtime status and recent log tails for GSPApp.
#>
Param(
  [string]$ProgramDataRoot = (Join-Path $env:ProgramData 'GSPApp'),
  [int]$AppTail = 80,
  [int]$PgTail = 30
)
$ErrorActionPreference = 'SilentlyContinue'

function Section($t){ Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Show-FileTail($path,$lines){
  if (Test-Path $path) {
    Write-Host "[file] $path" -ForegroundColor DarkGray
    try { Get-Content -Path $path -Tail $lines } catch { Write-Host "  (error reading) $_" -ForegroundColor Red }
  } else { Write-Host "[missing] $path" -ForegroundColor Yellow }
}

$logsDir = Join-Path $ProgramDataRoot 'logs'
$pidDir  = Join-Path $ProgramDataRoot 'pids'
$envFile = Join-Path $ProgramDataRoot '.env'
$appLog  = Join-Path $logsDir 'app.log'
$pgLog   = Join-Path $logsDir 'postgres.log'

Section 'Environment'
if (Test-Path $envFile) { Get-Content $envFile | Where-Object { $_ -match '^(PORT|PGPORT|PGUSER|DATABASE_URL)=' } }
else { Write-Host 'No ProgramData .env found.' -ForegroundColor Yellow }

$port = $env:PORT; if (-not $port -and (Test-Path $envFile)) { $port = (Select-String -Path $envFile -Pattern '^PORT=' | ForEach-Object { $_.Line.Split('=')[1] }) }
if (-not $port) { $port = 8080 }
Write-Host "Resolved App Port: $port"

Section 'Processes'
$nodePidFile = Join-Path $pidDir 'node.pid'
if (Test-Path $nodePidFile) {
  $pid = (Get-Content $nodePidFile | Select-Object -First 1)
  if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) { Write-Host "Node running (PID $pid)" -ForegroundColor Green }
  else { Write-Host 'Node not running (stale pid file)' -ForegroundColor Yellow }
} else { Write-Host 'No node.pid file' -ForegroundColor Yellow }

$pgPidFile = Join-Path $pidDir 'postgres.pid'
if (Test-Path $pgPidFile) {
  $ppid = (Get-Content $pgPidFile | Select-Object -First 1)
  if ($ppid -and (Get-Process -Id $ppid -ErrorAction SilentlyContinue)) { Write-Host "PostgreSQL running (PID $ppid)" -ForegroundColor Green }
  else { Write-Host 'PostgreSQL not running (stale pid file)' -ForegroundColor Yellow }
} else { Write-Host 'No postgres.pid file' -ForegroundColor Yellow }

Section 'Port Test'
try {
  $tnc = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue
  if ($tnc.TcpTestSucceeded) { Write-Host "Port $port is LISTENING" -ForegroundColor Green }
  else { Write-Host "Port $port not listening" -ForegroundColor Yellow }
} catch { Write-Host 'Test-NetConnection failed; skipping' -ForegroundColor DarkGray }

Section 'Recent app.log'
Show-FileTail $appLog $AppTail

Section 'Recent postgres.log'
Show-FileTail $pgLog $PgTail

Section 'Next Steps'
Write-Host 'If Node not running: run start_services.ps1. If port not listening but Node running, inspect app.log for startup errors.' -ForegroundColor White
