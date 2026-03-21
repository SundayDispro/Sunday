# Comprueba que Sunday sigue operativo tras suspender/reanudar o tras un fallo de red.
# Uso (desde la raíz del repo): powershell -ExecutionPolicy Bypass -File scripts\verify-sunday-health.ps1
# Código de salida: 0 = todo OK, 1 = algo falla.

$ErrorActionPreference = 'Continue'
$issues = @()

function Test-Tcp([string]$HostName, [int]$Port, [string]$Label) {
    try {
        $r = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
        if ($r.TcpTestSucceeded) { return $true }
        $script:issues += "$Label : puerto $Port no responde en $HostName"
        return $false
    } catch {
        $script:issues += "$Label : error comprobando ${HostName}:${Port} - $($_.Exception.Message)"
        return $false
    }
}

function Test-HttpJson([string]$Url, [string]$Label) {
    try {
        $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
        if ($res.StatusCode -ne 200) {
            $script:issues += "$Label : HTTP $($res.StatusCode) en $Url"
            return $false
        }
        return $true
    } catch {
        $script:issues += "$Label : no se pudo GET $Url - $($_.Exception.Message)"
        return $false
    }
}

Write-Host '=== Sunday: verificación de salud ===' -ForegroundColor Cyan

$pg = Test-Tcp '127.0.0.1' 5432 'PostgreSQL'
$be = Test-Tcp '127.0.0.1' 3001 'Backend Node'
$nx = Test-Tcp '127.0.0.1' 5173 'Nginx (frontend estático)'

if ($be) {
    [void](Test-HttpJson 'http://127.0.0.1:3001/api/health' 'API health (directo 3001)')
}
if ($nx) {
    [void](Test-HttpJson 'http://127.0.0.1:5173/api/health' 'API health (vía Nginx 5173)')
}

Write-Host ''
if ($issues.Count -eq 0) {
    Write-Host 'Estado: OK (puertos y /api/health).' -ForegroundColor Green
    Write-Host 'Nota: tras suspender, recarga la app en el navegador si ves errores de socket o 401; las WebSockets se reconectan solas si el backend sigue vivo.'
    exit 0
}

Write-Host 'Estado: PROBLEMAS DETECTADOS' -ForegroundColor Yellow
foreach ($i in $issues) { Write-Host "  - $i" }
Write-Host ''
Write-Host 'Sugerencia: si el PC acaba de reanudar, espera unos segundos y vuelve a ejecutar este script.' -ForegroundColor Gray
Write-Host 'Si sigue fallando: powershell -ExecutionPolicy Bypass -File scripts\start-sunday-at-boot.ps1' -ForegroundColor Gray
Write-Host '(o reinicia el servicio de PostgreSQL si 5432 no responde).' -ForegroundColor Gray
exit 1
