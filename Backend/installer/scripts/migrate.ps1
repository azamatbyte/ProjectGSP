<#!
.SYNOPSIS
	Run Prisma migrate deploy using ProgramData .env.
#>
Param(
	[string]$ProgramDataRoot = (Join-Path $env:ProgramData 'GSPApp'),
	[string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $ProgramDataRoot '.env'
if (Test-Path $envFile) {
	Get-Content $envFile | ForEach-Object { if ($_ -match '^(.*?)=(.*)$') { $env:$($matches[1])=$matches[2] } }
}
$prismaCli = Join-Path $AppRoot 'app/node_modules/.bin/prisma.cmd'
if (-not (Test-Path $prismaCli)) { Write-Error "Prisma CLI not found at $prismaCli" }
& $prismaCli migrate deploy --schema (Join-Path $AppRoot 'app/prisma/schema.prisma')
Write-Host "Migrations applied."
