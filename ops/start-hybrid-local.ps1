param(
  [switch]$StartBridges,
  [switch]$SkipPm2Save,
  [switch]$ResumeReposting,
  [switch]$PauseReposting
)

$ErrorActionPreference = "Stop"

$Root = "C:\Dev\runnercommercequen35plus"
$Backend = Join-Path $Root "backend"
$FrontendUrl = "http://localhost:3000"
$BackendUrl = "http://localhost:3001"
$env:PM2_HOME = Join-Path $Root ".pm2"
$MaintenanceFlag = Join-Path $Root ".runner-commerce-maintenance"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [int]$Seconds = 60
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

Set-Location $Root

Write-Step "Starting Docker infrastructure: PostgreSQL and Redis"
$legacyContainers = @("runner-commerce-postgres", "runner-commerce-redis")
foreach ($containerName in $legacyContainers) {
  $legacyStatus = docker inspect --format "{{.State.Running}}" $containerName 2>$null
  if ($legacyStatus -eq "true") {
    Write-Host "Legacy container $containerName is running and may use the same port." -ForegroundColor Yellow
    Write-Host "If Docker startup fails, stop it with: docker stop $containerName" -ForegroundColor Yellow
  }
}
docker compose up -d postgres redis

Write-Step "Waiting for PostgreSQL container health"
$postgresReady = $false
for ($i = 0; $i -lt 30; $i++) {
  $status = docker inspect --format "{{.State.Health.Status}}" runner-commerce-postgres 2>$null
  if ($status -eq "healthy") {
    $postgresReady = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $postgresReady) {
  throw "PostgreSQL did not become healthy. Check: docker compose logs postgres"
}

Write-Step "Setting reposting state"
Set-Location $Backend
if ($PauseReposting) {
  npm run settings:set -- whatsappRepostingEnabled false
  Write-Host "WhatsApp reposting paused for this start." -ForegroundColor Yellow
} else {
  npm run settings:set -- whatsappRepostingEnabled true
  if ($ResumeReposting) {
    Write-Host "WhatsApp reposting explicitly enabled for this start." -ForegroundColor Green
  } else {
    Write-Host "WhatsApp reposting enabled by default for this start." -ForegroundColor Green
  }
}

if (Test-Path $MaintenanceFlag) {
  Remove-Item $MaintenanceFlag -Force -ErrorAction SilentlyContinue
  Write-Host "Maintenance flag cleared; bridge watchdog may supervise workers again." -ForegroundColor Green
}

Write-Step "Starting frontend and backend with PM2"
Set-Location $Backend
npm run pm2:start:apps

if (-not $SkipPm2Save) {
  npm run pm2:save
}

Write-Step "Checking local endpoints"
$frontendReady = Wait-HttpOk -Url $FrontendUrl -Seconds 45
$backendReady = Wait-HttpOk -Url "$BackendUrl/api/docs" -Seconds 45

Write-Host ""
Write-Host "Hybrid local hosting status" -ForegroundColor Green
Write-Host "Frontend: $FrontendUrl $($(if ($frontendReady) { 'ready' } else { 'starting/check logs' }))"
Write-Host "Backend:  $BackendUrl $($(if ($backendReady) { 'ready' } else { 'starting/check logs' }))"
Write-Host "Database: Docker container runner-commerce-postgres"
Write-Host "Redis:    Docker container runner-commerce-redis"
Write-Host ""
Write-Host "PM2 status:"
npm run pm2:status

Write-Host ""
Write-Host "Interactive WhatsApp bridge commands:"
Write-Host "Bridge 1: powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Root\ops\start-whatsapp-bridge-001.ps1"
Write-Host "Bridge 2: powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Root\ops\start-whatsapp-bridge-002.ps1"
Write-Host "Watchdog: powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Root\ops\watch-whatsapp-bridges.ps1"
Write-Host ""
Write-Host "Reposting safety:" -ForegroundColor Yellow
Write-Host "  Default start enables WhatsApp reposting."
Write-Host "  To start with reposting paused: powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Root\ops\start-hybrid-local.ps1 -PauseReposting"
Write-Host "  You can also toggle it from Admin > Development Controls > WhatsApp Reposting."

if ($StartBridges) {
  Write-Step "Starting interactive bridge windows"
  Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$Root\ops\start-whatsapp-bridge-001.ps1`""
  Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$Root\ops\start-whatsapp-bridge-002.ps1`""
  Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$Root\ops\watch-whatsapp-bridges.ps1`""
}
