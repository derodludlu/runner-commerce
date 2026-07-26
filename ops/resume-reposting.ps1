param(
  [switch]$ClearMaintenanceMode
)

$ErrorActionPreference = "Stop"

$Root = "C:\Dev\runnercommercequen35plus"
$Backend = Join-Path $Root "backend"
$MaintenanceFlag = Join-Path $Root ".runner-commerce-maintenance"

if ($ClearMaintenanceMode -and (Test-Path $MaintenanceFlag)) {
  Remove-Item $MaintenanceFlag -Force
  Write-Host "Maintenance mode cleared. Bridge watchdog may supervise workers again." -ForegroundColor Green
}

Set-Location $Backend
npm run settings:set -- whatsappRepostingEnabled true
Write-Host "WhatsApp reposting enabled. Bridge mode, runner, shop, and listing settings still apply." -ForegroundColor Green
