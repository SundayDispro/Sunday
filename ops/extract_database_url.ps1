param(
  [Parameter(Mandatory = $true)]
  [string]$EnvFilePath
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path -Path $EnvFilePath)) {
  exit 1
}

$line = Get-Content -Path $EnvFilePath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) {
  exit 2
}

$val = $line -replace '^\s*DATABASE_URL\s*=\s*', ''
$val = $val.Trim()
# Quitar comillas dobles envolventes si existen (p.ej. "postgresql://user:pass@host:5432/db")
$val = $val.Trim([char]34)

Write-Output $val

