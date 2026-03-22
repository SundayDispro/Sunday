#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Deja OpenSSH Server listo para arranque automático y reglas de firewall activas.
  Ejecutar en el PC SERVIDOR: clic derecho → "Ejecutar con PowerShell" como administrador,
  o:  powershell -ExecutionPolicy Bypass -File ops\ssh-servidor-preparar.ps1
#>
$ErrorActionPreference = 'Stop'

Write-Host 'Configurando OpenSSH Server (sshd)...' -ForegroundColor Cyan

Set-Service -Name sshd -StartupType Automatic
if ((Get-Service sshd).Status -ne 'Running') {
  Start-Service sshd
}

# Reglas típicas de Windows para OpenSSH
Get-NetFirewallRule -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -match 'OpenSSH' } |
  ForEach-Object {
    Enable-NetFirewallRule -Name $_.Name -ErrorAction SilentlyContinue
    Write-Host "Firewall: $($_.DisplayName) -> habilitada" -ForegroundColor Green
  }

Write-Host ''
Write-Host 'Listo: sshd inicia con Windows y el puerto 22 queda permitido en firewall local.' -ForegroundColor Green
Write-Host 'Desde casa aun necesitas VPN (p. ej. Tailscale) o reenvio de puerto 22 en el router.' -ForegroundColor Yellow
Write-Host 'Guia: docs/ACCESO_REMOTO_SSH_Y_TUNEL.md' -ForegroundColor Yellow
