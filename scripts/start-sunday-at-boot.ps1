# Arranque automático Sunday (backend + Nginx). Pensado para tarea programada al inicio de Windows.
# Ejecutable también a mano: powershell -ExecutionPolicy Bypass -File scripts\start-sunday-at-boot.ps1

$RepoRoot = 'C:\Users\PC\Documents\Sunday'
$BackendDir = Join-Path $RepoRoot 'backend'
$NginxDir = 'C:\nginx'
$NginxExe = Join-Path $NginxDir 'nginx.exe'
$NodeCandidates = @(
    (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe'
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

$LogDir = Join-Path $env:ProgramData 'Sunday'
$null = New-Item -ItemType Directory -Force -Path $LogDir
$LogFile = Join-Path $LogDir 'startup.log'

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

try {
    Write-Log '--- Inicio ---'
    # Dar tiempo a servicios de Windows y a PostgreSQL
    Start-Sleep -Seconds 45

    if (-not $NodeCandidates) {
        Write-Log 'ERROR: node.exe no encontrado.'
        exit 1
    }
    $nodeExe = $NodeCandidates
    Write-Log "Node: $nodeExe"

    if (-not (Test-Path (Join-Path $BackendDir 'dist\src\index.js'))) {
        Write-Log 'ERROR: backend no compilado (falta dist\src\index.js). Ejecuta npm run build en backend.'
        exit 1
    }
    if (-not (Test-Path $NginxExe)) {
        Write-Log "ERROR: Nginx no encontrado en $NginxExe"
        exit 1
    }

    $pgDeadline = (Get-Date).AddMinutes(3)
    $pgOk = $false
    while ((Get-Date) -lt $pgDeadline) {
        if (Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue | Where-Object { $_.TcpTestSucceeded }) {
            $pgOk = $true
            break
        }
        Start-Sleep -Seconds 3
    }
    if (-not $pgOk) {
        Write-Log 'ERROR: PostgreSQL (5432) no respondió a tiempo.'
        exit 1
    }
    Write-Log 'PostgreSQL OK.'

    Stop-Process -Name nginx -Force -ErrorAction SilentlyContinue
    Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2

    Start-Process -FilePath $nodeExe -ArgumentList 'dist/src/index.js' -WorkingDirectory $BackendDir -WindowStyle Hidden
    Write-Log 'Backend Node iniciado.'

    $beDeadline = (Get-Date).AddSeconds(120)
    $beOk = $false
    while ((Get-Date) -lt $beDeadline) {
        if (Test-NetConnection -ComputerName 127.0.0.1 -Port 3001 -WarningAction SilentlyContinue | Where-Object { $_.TcpTestSucceeded }) {
            $beOk = $true
            break
        }
        Start-Sleep -Seconds 2
    }
    if (-not $beOk) {
        Write-Log 'ERROR: backend (3001) no levantó a tiempo.'
        exit 1
    }
    Write-Log 'Backend OK (3001).'

    Start-Process -FilePath $NginxExe -WorkingDirectory $NginxDir -WindowStyle Hidden
    Write-Log 'Nginx iniciado.'

    Start-Sleep -Seconds 2
    if (Test-NetConnection -ComputerName 127.0.0.1 -Port 5173 -WarningAction SilentlyContinue | Where-Object { $_.TcpTestSucceeded }) {
        Write-Log 'Nginx OK (5173).'
    } else {
        Write-Log 'ADVERTENCIA: puerto 5173 no escucha (revisa nginx.conf y firewall).'
    }

    Write-Log '--- Fin OK ---'
    exit 0
} catch {
    Write-Log "EXCEPCION: $($_.Exception.Message)"
    exit 1
}
