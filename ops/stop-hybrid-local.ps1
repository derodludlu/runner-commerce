param(
  [switch]$StopDocker,
  [switch]$StopBridges,
  [switch]$RepostingAlreadyPaused,
  [int]$DelayBeforeAppStopSeconds = 0
)

$ErrorActionPreference = "Continue"

$Root = "C:\Dev\runnercommercequen35plus"
$Backend = Join-Path $Root "backend"
$env:PM2_HOME = Join-Path $Root ".pm2"
$MaintenanceFlag = Join-Path $Root ".runner-commerce-maintenance"
$Pm2 = Join-Path $Backend "node_modules\.bin\pm2.cmd"
$startedAt = Get-Date

Write-Host "Entering maintenance mode..." -ForegroundColor Cyan
New-Item -ItemType File -Force -Path $MaintenanceFlag | Out-Null
if (-not $RepostingAlreadyPaused) {
  Set-Location $Backend
  npm run settings:set -- whatsappRepostingEnabled false
}

if ($StopBridges) {
  Write-Host "Stopping bridge worker processes from lock files..." -ForegroundColor Cyan
  $locks = @(
    Join-Path $Backend ".wwebjs_auth\runner-commerce-session-bridge.bridge.lock"
    Join-Path $Backend ".wwebjs_auth_bridge_001\runner-commerce-bridge-001.bridge.lock"
    Join-Path $Backend ".wwebjs_auth_bridge_002\runner-commerce-bridge-002.bridge.lock"
  )

  foreach ($lockFile in $locks) {
    if (-not (Test-Path $lockFile)) {
      continue
    }

    try {
      $lock = Get-Content $lockFile -Raw | ConvertFrom-Json
      $pidToStop = [int]$lock.pid
      if ($pidToStop -gt 0) {
        Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped bridge PID $pidToStop"
      }
      Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
    } catch {
      Write-Host "Could not stop bridge from ${lockFile}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

Write-Host "Stopping PM2 frontend/backend processes..." -ForegroundColor Cyan
if ($DelayBeforeAppStopSeconds -gt 0) {
  Write-Host "Allowing ${DelayBeforeAppStopSeconds}s for the shutdown response to complete..." -ForegroundColor Cyan
  Start-Sleep -Seconds $DelayBeforeAppStopSeconds
}
Set-Location $Backend
if (Test-Path $Pm2) {
  # This script is launched by the API. Stop the API last; stopping it first can
  # terminate this helper before the frontend, monitor, and bridge are stopped.
  $dependentApps = @(
    "runner-commerce-frontend"
    "runner-commerce-frontend-dev"
    "runner-commerce-whatsapp-monitor"
    "runner-commerce-whatsapp-bridge"
  )
  foreach ($app in $dependentApps) {
    & $Pm2 stop $app --silent 2>$null
  }

  Write-Host "Stopping API last..." -ForegroundColor Cyan
  & $Pm2 stop runner-commerce-api --silent 2>$null
} else {
  Write-Host "Local PM2 executable was not found; using npm fallback." -ForegroundColor Yellow
  npm run pm2:stop:apps
}

if ($StopDocker) {
  Write-Host "Stopping Docker infrastructure..." -ForegroundColor Cyan
  Set-Location $Root
  docker compose stop postgres redis
} else {
  Write-Host "Docker PostgreSQL/Redis left running. Use -StopDocker to stop them." -ForegroundColor Yellow
}

$elapsed = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
Write-Host "Safe shutdown finished in ${elapsed}s." -ForegroundColor Green
