param(
  [switch]$IncludeWhatsAppSession
)

$ErrorActionPreference = "Stop"

$Root = "C:\Dev\runnercommercequen35plus"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $Root "backups"
$BackupDir = Join-Path $BackupRoot $Timestamp
$DatabaseFile = Join-Path $BackupDir "runnercommerce_db.sql"
$UploadsSource = Join-Path $Root "backend\uploads"
$UploadsTarget = Join-Path $BackupDir "uploads"
$SessionSource = Join-Path $Root "backend\.wwebjs_auth"
$SessionTarget = Join-Path $BackupDir "wwebjs_auth"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

Write-Host "Creating PostgreSQL backup at $DatabaseFile"
docker exec runner-commerce-postgres pg_dump -U runnercommerce runnercommerce_db |
  Out-File -FilePath $DatabaseFile -Encoding utf8

if (Test-Path $UploadsSource) {
  Write-Host "Copying uploads to $UploadsTarget"
  Copy-Item -Path $UploadsSource -Destination $UploadsTarget -Recurse -Force
} else {
  Write-Host "Uploads folder not found at $UploadsSource"
}

if ($IncludeWhatsAppSession) {
  if (Test-Path $SessionSource) {
    Write-Host "Copying WhatsApp session storage to $SessionTarget"
    Copy-Item -Path $SessionSource -Destination $SessionTarget -Recurse -Force
  } else {
    Write-Host "WhatsApp session folder not found at $SessionSource"
  }
} else {
  Write-Host "Skipped WhatsApp session backup. Rerun with -IncludeWhatsAppSession only if this backup will be stored securely."
}

Write-Host "Backup complete: $BackupDir"
