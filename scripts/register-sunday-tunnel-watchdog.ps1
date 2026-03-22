# Ejecutar en PowerShell COMO ADMINISTRADOR (una vez).
# Tarea cada 5 min: si el túnel trycloudflare no responde, recrea cloudflared y publica en el feed.

$script = Join-Path $PSScriptRoot 'startup-sunday-tunnel.ps1'
if (-not (Test-Path -LiteralPath $script)) {
    Write-Error "No se encuentra: $script"
    exit 1
}

$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -EnsureOnly -InitialSleepSeconds 0"
schtasks /create /tn "SundayTunnelWatch" /tr $tr /sc minute /mo 5 /ru SYSTEM /rl HIGHEST /f
if ($LASTEXITCODE -ne 0) {
    Write-Error "schtasks falló (¿administrador?). Código: $LASTEXITCODE"
    exit 1
}
Write-Host "SundayTunnelWatch registrada (cada 5 min, -EnsureOnly). Script: $script"
