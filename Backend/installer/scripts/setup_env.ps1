<#!
.SYNOPSIS
    Setup environment configuration for GSPApp on first run.

.DESCRIPTION
    Creates or updates the shared .env file in %ProgramData%\GSPApp with:
    - Auto-generated secure PGPASSWORD
    - Auto-generated JWT_SECRET_KEY
    - Properly formatted DATABASE_URL
    
.PARAMETER AppRoot
    Path to backend application root (contains pg/, node/, app/)

.PARAMETER Force
    Force regeneration of secrets even if .env exists
#>
[CmdletBinding()] Param(
    [string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\backend')).Path,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
function Log($m){ Write-Host "[setup_env] $m" -ForegroundColor Cyan }

$ProgramDataRoot = Join-Path $env:ProgramData 'GSPApp'
$EnvFile = Join-Path $ProgramDataRoot '.env'
$TemplateFile = Join-Path (Split-Path $AppRoot -Parent) '.env.template'

# Ensure directories exist
New-Item -ItemType Directory -Force -Path $ProgramDataRoot | Out-Null

# Generate secure random string
function New-SecureString {
    Param([int]$Length = 32)
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    $result = ''
    $random = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $bytes = New-Object byte[] $Length
    $random.GetBytes($bytes)
    foreach ($byte in $bytes) {
        $result += $chars[$byte % $chars.Length]
    }
    return $result
}

# If .env exists and not forcing, just ensure required keys
if ((Test-Path $EnvFile) -and -not $Force) {
    Log "Environment file exists. Checking required keys..."
    
    $content = Get-Content $EnvFile -Raw
    $needsUpdate = $false
    
    # Check for PGPASSWORD
    if ($content -notmatch 'PGPASSWORD\s*=\s*\S+') {
        $pgPass = New-SecureString -Length 24
        Add-Content -Path $EnvFile -Value "PGPASSWORD=$pgPass"
        Log "Generated PGPASSWORD"
        $needsUpdate = $true
    }
    
    # Check for JWT_SECRET_KEY
    if ($content -notmatch 'JWT_SECRET_KEY\s*=\s*\S+') {
        $jwtKey = New-SecureString -Length 48
        Add-Content -Path $EnvFile -Value "JWT_SECRET_KEY=$jwtKey"
        Log "Generated JWT_SECRET_KEY"
        $needsUpdate = $true
    }
    
    # Parse existing values for reuse
    $envMap = @{}
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^([^#][^=]*)=(.*)$') {
            $envMap[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    $user = if ($envMap['PGUSER']) { $envMap['PGUSER'] } else { 'appuser' }
    $pass = if ($envMap['PGPASSWORD']) { $envMap['PGPASSWORD'] } else { $pgPass }
    $port = if ($envMap['PGPORT']) { $envMap['PGPORT'] } else { '5433' }
    $dbName = 'appdb'

    # Ensure DB_* keys exist (init_db.ps1 reads these)
    if ($content -notmatch 'DB_HOST\s*=') {
        Add-Content -Path $EnvFile -Value "DB_HOST=127.0.0.1"
        Log "Added DB_HOST"
        $needsUpdate = $true
    }
    if ($content -notmatch 'DB_PORT\s*=') {
        Add-Content -Path $EnvFile -Value "DB_PORT=$port"
        Log "Added DB_PORT"
        $needsUpdate = $true
    }
    if ($content -notmatch 'DB_USER\s*=') {
        Add-Content -Path $EnvFile -Value "DB_USER=$user"
        Log "Added DB_USER"
        $needsUpdate = $true
    }
    if ($content -notmatch 'DB_PASSWORD\s*=') {
        Add-Content -Path $EnvFile -Value "DB_PASSWORD=$pass"
        Log "Added DB_PASSWORD"
        $needsUpdate = $true
    }
    if ($content -notmatch 'DB_NAME\s*=') {
        Add-Content -Path $EnvFile -Value "DB_NAME=$dbName"
        Log "Added DB_NAME"
        $needsUpdate = $true
    }

    # Check for DATABASE_URL
    if ($content -notmatch 'DATABASE_URL\s*=\s*\S+') {
        $dbUrl = "postgresql://${user}:${pass}@127.0.0.1:${port}/${dbName}?schema=public"
        Add-Content -Path $EnvFile -Value "DATABASE_URL=$dbUrl"
        Log "Generated DATABASE_URL"
        $needsUpdate = $true
    }

    if (-not $needsUpdate) {
        Log "All required keys present."
    }
    exit 0
}

# Create new .env file
Log "Creating new environment configuration..."

# Start from template if exists
if (Test-Path $TemplateFile) {
    Copy-Item $TemplateFile $EnvFile -Force
    Log "Copied template to $EnvFile"
} else {
    # Create minimal template
    @(
        '# GSPApp Configuration',
        'HOST=127.0.0.1',
        'PORT=8080',
        'NODE_ENV=production',
        '',
        '# PostgreSQL',
        'PGPORT=5433',
        'PGUSER=appuser',
        '',
        '# Frontend',
        'REACT_APP_SITE_PATH=http://127.0.0.1:8080'
    ) | Set-Content -Path $EnvFile -Encoding utf8
}

# Generate secrets
$pgPass = New-SecureString -Length 24
$jwtKey = New-SecureString -Length 48

# Append generated values
@(
    '',
    '# Auto-generated secrets (do not share)',
    "PGPASSWORD=$pgPass",
    "JWT_SECRET_KEY=$jwtKey",
    '',
    '# Database Connection',
    "DATABASE_URL=postgresql://appuser:${pgPass}@127.0.0.1:5433/appdb?schema=public",
    "DB_HOST=127.0.0.1",
    "DB_PORT=5433",
    "DB_USER=appuser",
    "DB_PASSWORD=$pgPass",
    "DB_NAME=appdb"
) | Add-Content -Path $EnvFile

Log "Environment configuration complete: $EnvFile"
Log "PGPASSWORD and JWT_SECRET_KEY have been auto-generated."
