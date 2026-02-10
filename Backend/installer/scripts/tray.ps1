<#!
Tray controller for GSPApp.
Provides a system tray icon with menu:
 - Open API Docs (uses PORT from .env)
 - Open pgAdmin (if bundled)
 - Quit (stops backend + closes tray)

Reads ports from ProgramData\GSPApp\.env (preferred) or installation .env.
Ensures backend services are started when launched.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# Ensure STA (System.Windows.Forms requirement)
if ([System.Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
    Start-Process powershell -ArgumentList '-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-STA','-File',("`"{0}`"" -f $PSCommandPath) -WindowStyle Hidden
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Get-EnvMap {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    Get-Content -Path $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line) { return }
        if ($line.StartsWith('#')) { return }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { return }
        $k = $line.Substring(0,$eq).Trim()
        $v = $line.Substring($eq+1).Trim()
        $map[$k] = $v
    }
    return $map
}

$InstallRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath) # ...\GSPBackend\scripts
$ProgramDataEnv = Join-Path $env:ProgramData 'GSPApp/.env'
$LocalEnv = Join-Path $InstallRoot '.env'
$envMap = @{}
$envMap = Get-EnvMap -Path $LocalEnv
$pdMap = Get-EnvMap -Path $ProgramDataEnv
foreach($k in $pdMap.Keys){ $envMap[$k] = $pdMap[$k] }

function Get-EnvValue { param($Key,$Default) if ($envMap.ContainsKey($Key) -and $envMap[$Key]) { return $envMap[$Key] } return $Default }

$AppPort = Get-EnvValue 'PORT' '8080'
$PgPort = Get-EnvValue 'PGPORT' '5433'

$ScriptsDir = Join-Path $InstallRoot 'scripts'
$StartScript = Join-Path $ScriptsDir 'start_services.ps1'
$StopScript  = Join-Path $ScriptsDir 'stop_services.ps1'

function Start-Backend {
    try {
        Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',"$StartScript" | Out-Null
    } catch { }
}
function Stop-Backend {
    try {
        Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',"$StopScript" | Out-Null
    } catch { }
}

# Kick services (idempotent)
Start-Backend

# Build Tray Icon (fallback if portable node not present in dev environment)
$nodeExePath = Join-Path $InstallRoot 'node/node.exe'
try {
    if (Test-Path $nodeExePath) {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($nodeExePath)
    }
} catch { }
if (-not $icon) { $icon = [System.Drawing.SystemIcons]::Application }
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $icon
$notify.Text = "GSPApp (App $AppPort / DB $PgPort)"
$notify.Visible = $true

$ctx = New-Object System.Windows.Forms.ContextMenuStrip

function Add-MenuItem {
    param(
        [string]$Text,
        [scriptblock]$OnClick,
        [bool]$Enabled = $true
    )
    $item = New-Object System.Windows.Forms.ToolStripMenuItem
    $item.Text = $Text
    $item.Enabled = $Enabled
    if ($OnClick) {
        # Attach the provided scriptblock directly as the event handler. Previous implementation wrapped it
        # in another scriptblock using the call operator (& $OnClick) which lost the closure variable in
        # the event scope under Windows PowerShell 5.1, producing: "The expression after '&' ... was not valid".
        $null = $item.Add_Click($OnClick)
    }
    $null = $ctx.Items.Add($item)
}

Add-MenuItem -Text "Open API Docs" -OnClick { Start-Process "http://localhost:$AppPort/api/v1/api-docs" } | Out-Null

# Logs folder shortcut
$logsFolder = Join-Path $env:ProgramData 'GSPApp/logs'
Add-MenuItem -Text "Open Logs Folder" -OnClick {
    if (-not (Test-Path $logsFolder)) { [System.Windows.Forms.MessageBox]::Show("Logs folder not found: $logsFolder") }
    else { Start-Process explorer.exe $logsFolder }
} | Out-Null

$PgAdminExe = Join-Path $InstallRoot 'pg/pgAdmin 4/bin/pgAdmin4.exe'
if (Test-Path $PgAdminExe) {
    Add-MenuItem -Text "Open pgAdmin" -OnClick { Start-Process -FilePath $PgAdminExe } | Out-Null
}
Add-MenuItem -Text "Quit" -OnClick {
    Stop-Backend
    $notify.Visible = $false
    $notify.Dispose()
    [System.Windows.Forms.Application]::Exit()
} | Out-Null

$notify.ContextMenuStrip = $ctx
# Double-click opens API docs
$notify.Add_DoubleClick({ Start-Process "http://localhost:$AppPort/api/v1/api-docs" })

# Balloon tip once
try { $notify.ShowBalloonTip(3000,"GSPApp","Running on port $AppPort (DB $PgPort)",[System.Windows.Forms.ToolTipIcon]::Info) } catch {}

# Run message loop
[System.Windows.Forms.Application]::Run()
