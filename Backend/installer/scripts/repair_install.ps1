$ErrorActionPreference = 'Stop'

function Step($m){ Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Warn($m){ Write-Warning $m }
function Fail($m){ Write-Error $m; pause; exit 1 }

$AppRoot = 'C:\Program Files\GSPApp\backend'
$ProgramDataRoot = Join-Path $env:ProgramData 'GSPApp'

$pgBin     = Join-Path $AppRoot 'pg\bin'
$pgCtl     = Join-Path $pgBin 'pg_ctl.exe'
$pgIsReady = Join-Path $pgBin 'pg_isready.exe'
$createdb  = Join-Path $pgBin 'createdb.exe'
$dataDir   = Join-Path $ProgramDataRoot 'pgdata'
$logsDir   = Join-Path $ProgramDataRoot 'logs'
$envFile   = Join-Path $ProgramDataRoot '.env'
$pidDir    = Join-Path $ProgramDataRoot 'pids'
$nodeExe   = Join-Path $AppRoot 'node\node.exe'
$indexJs   = Join-Path $AppRoot 'app\index.js'
$prismaCli = Join-Path $AppRoot 'app\node_modules\.bin\prisma.cmd'
$BuildPg   = 'd:\Documents\react\ProjectGSP\Backend\build\pg'

# ---- Step 1: Fix PG directories ----
Step '1. Fixing PostgreSQL installation directories'
$pgDest = Join-Path $AppRoot 'pg'
$requiredDirs = @('bin', 'lib', 'share')
$fixed = $false

foreach ($dir in $requiredDirs) {
    $destPath = Join-Path $pgDest $dir
    $srcPath  = Join-Path $BuildPg $dir
    if (-not (Test-Path $destPath)) {
        Write-Host "$dir directory MISSING - copying from build..."
        if (-not (Test-Path $srcPath)) { Fail "Build $dir not found at $srcPath" }
        Copy-Item $srcPath $destPath -Recurse -Force
        Write-Host "$dir copied OK" -ForegroundColor Green
        $fixed = $true
    } else {
        if ($dir -eq 'bin' -and -not (Test-Path (Join-Path $destPath 'pg_ctl.exe'))) {
            Write-Host 'bin exists but pg_ctl.exe missing - re-copying from build...'
            Remove-Item $destPath -Recurse -Force
            Copy-Item $srcPath $destPath -Recurse -Force
            Write-Host 'bin re-copied OK' -ForegroundColor Green
            $fixed = $true
        }
        if ($dir -eq 'share' -and -not (Test-Path (Join-Path $destPath 'timezonesets'))) {
            Write-Host 'share exists but timezonesets missing - re-copying from build...'
            Remove-Item $destPath -Recurse -Force
            Copy-Item $srcPath $destPath -Recurse -Force
            Write-Host 'share re-copied OK' -ForegroundColor Green
            $fixed = $true
        }
    }
}
if (-not $fixed) { Write-Host 'All PostgreSQL directories verified OK' }

# ---- Step 2: Remove stale PID files ----
Step '2. Removing stale PID files'
$postmasterPid = Join-Path $dataDir 'postmaster.pid'
if (Test-Path $postmasterPid) {
    $pmPid = Get-Content $postmasterPid | Select-Object -First 1
    $pmProc = $null
    try { $pmProc = Get-Process -Id $pmPid -ErrorAction SilentlyContinue } catch {}
    if ($pmProc) {
        Write-Host "PostgreSQL is running (PID $pmPid), stopping..."
        & $pgCtl -D $dataDir -w stop 2>&1
    } else {
        Write-Host "Removing stale postmaster.pid (PID $pmPid)"
        Remove-Item $postmasterPid -Force
    }
} else {
    Write-Host 'No stale postmaster.pid'
}

$pgPidFile = Join-Path $pidDir 'postgres.pid'
if (Test-Path $pgPidFile) {
    Remove-Item $pgPidFile -Force -ErrorAction SilentlyContinue
    Write-Host 'Removed stale postgres.pid'
}

$nodePidFile = Join-Path $pidDir 'node.pid'
if (Test-Path $nodePidFile) {
    $nPid = Get-Content $nodePidFile | Select-Object -First 1
    $nProc = $null
    try { $nProc = Get-Process -Id $nPid -ErrorAction SilentlyContinue } catch {}
    if ($nProc) {
        Write-Host "Stopping existing Node process (PID $nPid)..."
        Stop-Process -Id $nPid -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $nodePidFile -Force -ErrorAction SilentlyContinue
    Write-Host 'Removed node.pid'
}

# ---- Step 3: Load .env ----
Step '3. Loading environment'
if (-not (Test-Path $envFile)) { Fail ".env not found at $envFile" }
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.*)$') {
        $n = $matches[1].Trim()
        $v = $matches[2].Trim()
        if ($n) { Set-Item -Path "Env:$n" -Value $v -ErrorAction SilentlyContinue }
    }
}
Write-Host 'Environment loaded'
$pgPort = if ($env:DB_PORT) { $env:DB_PORT } else { '5433' }
$pgUser = if ($env:DB_USER) { $env:DB_USER } else { 'appuser' }
$pgPass = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { $env:PGPASSWORD }
$dbName = if ($env:DB_NAME) { $env:DB_NAME } else { 'appdb' }
Write-Host "Port=$pgPort User=$pgUser DB=$dbName"

$nodeDir = Split-Path $nodeExe -Parent
if (Test-Path $nodeDir) {
    $env:PATH = $nodeDir + ';' + $env:PATH
}

# ---- Step 4: Start PostgreSQL ----
Step '4. Starting PostgreSQL'
if (-not (Test-Path $dataDir)) { Fail "PostgreSQL data directory not found: $dataDir" }
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$pgLogFile = Join-Path $logsDir 'postgres.log'
Write-Host 'Starting pg_ctl...'
$pgOutput = & $pgCtl -D $dataDir -l $pgLogFile -w start 2>&1
$pgExitCode = $LASTEXITCODE
Write-Host "pg_ctl exit code: $pgExitCode"
if ($pgExitCode -ne 0) {
    Write-Host "pg_ctl output: $pgOutput" -ForegroundColor Red
}

Write-Host 'Waiting for PostgreSQL...'
$deadline = (Get-Date).AddSeconds(30)
$ready = $false
while ((Get-Date) -lt $deadline) {
    $null = & $pgIsReady -h 127.0.0.1 -p $pgPort 2>&1
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
}
if ($ready) {
    Write-Host 'PostgreSQL is ready!' -ForegroundColor Green
} else {
    Write-Host 'PostgreSQL did not become ready' -ForegroundColor Red
    if (Test-Path $pgLogFile) {
        Write-Host 'Last 20 lines of postgres.log:'
        Get-Content $pgLogFile -Tail 20
    }
    Fail 'PostgreSQL startup failed'
}

# ---- Step 5: Create database ----
Step "5. Checking/creating database '$dbName'"
$env:PGPASSWORD = $pgPass
$psqlExe = Join-Path $pgBin 'psql.exe'
$null = & $psqlExe -h 127.0.0.1 -p $pgPort -U $pgUser -d $dbName -c 'SELECT 1' 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Database '$dbName' does not exist, creating..."
    $createResult = & $createdb -h 127.0.0.1 -p $pgPort -U $pgUser $dbName 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database '$dbName' created!" -ForegroundColor Green
    } else {
        Write-Host "createdb output: $createResult" -ForegroundColor Red
        Fail 'Failed to create database'
    }
} else {
    Write-Host "Database '$dbName' already exists"
}

# ---- Step 6: Prisma db push ----
Step '6. Running Prisma db push'
if (Test-Path $prismaCli) {
    $schemaPath = Join-Path $AppRoot 'app\prisma\schema.prisma'
    $prismaOut = & $prismaCli db push --schema $schemaPath --accept-data-loss 2>&1
    Write-Host "Prisma exit code: $LASTEXITCODE"
    $prismaOut | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'Prisma push succeeded!' -ForegroundColor Green
    } else {
        Warn "Prisma push failed (exit code $LASTEXITCODE)"
    }
} else {
    Warn "Prisma CLI not found at $prismaCli"
}

# ---- Step 7: Seed database ----
Step '7. Seeding database'
$seedMarker = Join-Path $ProgramDataRoot '.seeded'
$seedJs = Join-Path $AppRoot 'app\scripts\seed.js'
if (-not (Test-Path $seedMarker) -and (Test-Path $seedJs)) {
    Write-Host 'Running seed script...'
    $seedOut = & $nodeExe $seedJs 2>&1
    Write-Host "Seed exit code: $LASTEXITCODE"
    $seedOut | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -eq 0) {
        'seeded' | Out-File $seedMarker -Encoding ascii
        Write-Host 'Database seeded!' -ForegroundColor Green
    } else {
        Warn "Seed failed (exit code $LASTEXITCODE)"
    }
} elseif (Test-Path $seedMarker) {
    Write-Host 'Already seeded'
} else {
    Warn "Seed script not found: $seedJs"
}

# ---- Step 8: Start Node ----
Step '8. Starting Node server'
if (-not (Test-Path $nodeExe)) { Fail "node.exe not found: $nodeExe" }
if (-not (Test-Path $indexJs)) { Fail "index.js not found: $indexJs" }

$workingDir = Join-Path $AppRoot 'app'
$appLog = Join-Path $logsDir 'app.log'

$si = New-Object System.Diagnostics.ProcessStartInfo
$si.FileName = $nodeExe
$si.Arguments = "`"$indexJs`""
$si.WorkingDirectory = $workingDir
$si.RedirectStandardOutput = $true
$si.RedirectStandardError  = $true
$si.UseShellExecute = $false
$si.CreateNoWindow = $true

foreach ($ev in Get-ChildItem Env:) {
    $si.EnvironmentVariables[$ev.Name] = $ev.Value
}
$si.EnvironmentVariables['NODE_ENV'] = 'production'

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $si
$started = $proc.Start()
if ($started) {
    New-Item -ItemType Directory -Force -Path $pidDir | Out-Null
    $proc.Id | Out-File (Join-Path $pidDir 'node.pid') -Encoding ascii
    Write-Host "Node started (PID $($proc.Id))" -ForegroundColor Green

    Start-Job -ScriptBlock {
        Param($p, $log)
        try {
            while (-not $p.HasExited) {
                while (-not $p.StandardOutput.EndOfStream) {
                    $p.StandardOutput.ReadLine() | Out-File -FilePath $log -Append
                }
                while (-not $p.StandardError.EndOfStream) {
                    $p.StandardError.ReadLine() | Out-File -FilePath $log -Append
                }
                Start-Sleep -Milliseconds 200
            }
        } catch {}
    } -ArgumentList $proc, $appLog | Out-Null
} else {
    Fail 'Failed to start Node'
}

Step 'REPAIR COMPLETE'
Write-Host "PostgreSQL: port $pgPort (running)" -ForegroundColor Green
Write-Host 'Node: http://127.0.0.1:8080 (running)' -ForegroundColor Green
Write-Host "Logs: $logsDir" -ForegroundColor Green
Write-Host ''
Write-Host 'Press any key to exit...'
pause
