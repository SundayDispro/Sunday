# Ajusta el plan de energía ACTIVO de Windows para que, con corriente (AC), el PC no entre en suspensión
# por inactividad. Útil para servidor Sunday en un sobremesa enchufado.
#
# NO impide el apagado manual (Inicio > Apagar) ni un corte de luz; solo evita sleep/hibernar por tiempo de inactividad en AC.
#
# Uso (como administrador recomendado para que aplique al plan activo):
#   powershell -ExecutionPolicy Bypass -File scripts\set-pc-no-sleep-ac.ps1 -Action Apply
#   powershell -ExecutionPolicy Bypass -File scripts\set-pc-no-sleep-ac.ps1 -Action Status
#   powershell -ExecutionPolicy Bypass -File scripts\set-pc-no-sleep-ac.ps1 -Action RestoreBalanced
#
param(
    [ValidateSet('Apply', 'Status', 'RestoreBalanced')]
    [string]$Action = 'Status'
)

function Invoke-PowerCfg {
    param([string[]]$Args)
    $p = Start-Process -FilePath 'powercfg.exe' -ArgumentList $Args -Wait -PassThru -NoNewWindow
    return $p.ExitCode
}

Write-Host '=== Energía Windows (solo guía; plan activo actual) ===' -ForegroundColor Cyan

if ($Action -eq 'Status') {
    Invoke-PowerCfg @('/getactivescheme')
    Write-Host ''
    Write-Host 'Lista de planes (GUID para RestoreBalanced):' -ForegroundColor Gray
    powercfg /list
    exit 0
}

if ($Action -eq 'Apply') {
    # Con AC: no suspender ni hibernar por inactividad. (No tocamos apagado de pantalla; ajústalo en Panel de control si quieres.)
    $null = Invoke-PowerCfg @('/change', 'disk-timeout-ac', '0')
    $null = Invoke-PowerCfg @('/change', 'standby-timeout-ac', '0')
    $null = Invoke-PowerCfg @('/change', 'hibernate-timeout-ac', '0')

    Write-Host 'Aplicado en el plan ACTIVO (AC): suspensión e hibernación por inactividad = nunca; disco = nunca.' -ForegroundColor Green
    Write-Host 'La batería (DC) no se modifica aquí; si usas portátil, revisa Opciones de energía.' -ForegroundColor Yellow
    exit 0
}

if ($Action -eq 'RestoreBalanced') {
    # Restaura el esquema "Equilibrado" como activo (valores por defecto típicos de Microsoft).
    $balanced = powercfg /list | Select-String -Pattern 'Equilibrado|Balanced' | ForEach-Object { if ($_ -match 'GUID:\s+([-a-f0-9]+)') { $matches[1] } } | Select-Object -First 1
    if (-not $balanced) {
        Write-Host 'No encontré el GUID del plan Equilibrado. Lista de planes:' -ForegroundColor Red
        powercfg /list
        exit 1
    }
    $null = Invoke-PowerCfg @('/setactive', $balanced)
    Write-Host "Plan activo: Equilibrado ($balanced)." -ForegroundColor Green
    exit 0
}
