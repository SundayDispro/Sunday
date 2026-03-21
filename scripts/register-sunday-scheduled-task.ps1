# Ejecutar UNA VEZ como Administrador (clic derecho > Ejecutar con PowerShell como administrador).
# Registra "Sunday Server" al ARRANQUE del sistema (cuenta SYSTEM), para que suba sin iniciar sesión.

$script = Join-Path $PSScriptRoot 'start-sunday-at-boot.ps1'
if (-not (Test-Path $script)) {
    Write-Error "No se encuentra $script"
    exit 1
}

$arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName 'Sunday Server' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force
Write-Host 'Tarea "Sunday Server" registrada (al inicio del sistema, como SYSTEM).'
