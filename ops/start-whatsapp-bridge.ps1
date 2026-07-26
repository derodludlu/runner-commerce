param(
  [string]$BridgeAccountId = "c153058c-375f-475b-93ea-86d1bc1dcc42",
  [string]$SessionName = "runner-commerce-session-bridge",
  [string]$WorkerKey = "",
  [string]$AuthPath = "",
  [string]$LogName = "",
  [int]$ProtocolTimeoutMs = 300000,
  [int]$BackfillLimit = 120
)

$ErrorActionPreference = "Continue"

$Root = "C:\Dev\runnercommercequen35plus"
$Backend = Join-Path $Root "backend"
$LogDir = Join-Path $Backend "logs"

if ([string]::IsNullOrWhiteSpace($AuthPath)) {
  $AuthPath = Join-Path $Backend ".wwebjs_auth"
}

if ([string]::IsNullOrWhiteSpace($LogName)) {
  $safeSessionName = $SessionName -replace '[^a-zA-Z0-9_.-]', '-'
  $LogName = "task-whatsapp-bridge-$safeSessionName.log"
}

$LogFile = Join-Path $LogDir $LogName

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $AuthPath | Out-Null

function Write-BridgeLog {
  param([string]$Message)

  $payload = "$Message$([Environment]::NewLine)"
  $encoding = [System.Text.UTF8Encoding]::new($false)

  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      $stream = [System.IO.File]::Open(
        $LogFile,
        [System.IO.FileMode]::Append,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::ReadWrite
      )
      try {
        $bytes = $encoding.GetBytes($payload)
        $stream.Write($bytes, 0, $bytes.Length)
      } finally {
        $stream.Dispose()
      }
      return
    } catch {
      if ($attempt -eq 5) {
        Write-Warning "Could not write bridge log '$LogFile': $($_.Exception.Message)"
        return
      }
      Start-Sleep -Milliseconds (100 * $attempt)
    }
  }
}

$lockKey = "$SessionName-$BridgeAccountId" -replace '[^a-zA-Z0-9_.-]', '_'
$bridgeMutex = New-Object System.Threading.Mutex($false, "Global\RunnerCommerceWhatsAppBridge_$lockKey")
$lockAcquired = $false
try {
  $lockAcquired = $bridgeMutex.WaitOne(0, $false)
} catch {
  $lockAcquired = $false
}

if (-not $lockAcquired) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-BridgeLog "[$stamp] Bridge worker already running for session=$SessionName bridge=$BridgeAccountId. Exiting duplicate launcher."
  Write-Host "Bridge worker already running for session=$SessionName bridge=$BridgeAccountId. Exiting duplicate launcher."
  exit 2
}

Set-Location $Backend

$env:WHATSAPP_SESSION_HEADLESS = "false"
$env:WHATSAPP_SESSION_NAME = $SessionName
$env:WHATSAPP_SESSION_AUTH_PATH = $AuthPath
$env:WHATSAPP_SESSION_PROTOCOL_TIMEOUT_MS = [string]$ProtocolTimeoutMs
$env:WHATSAPP_SESSION_BACKFILL_LIMIT = [string]$BackfillLimit

if ([string]::IsNullOrWhiteSpace($BridgeAccountId)) {
  Remove-Item Env:\WHATSAPP_BRIDGE_ACCOUNT_ID -ErrorAction SilentlyContinue
} else {
  $env:WHATSAPP_BRIDGE_ACCOUNT_ID = $BridgeAccountId
}

if ([string]::IsNullOrWhiteSpace($WorkerKey)) {
  Remove-Item Env:\WHATSAPP_BRIDGE_WORKER_KEY -ErrorAction SilentlyContinue
} else {
  $env:WHATSAPP_BRIDGE_WORKER_KEY = $WorkerKey
}

try {
  $restartDelaySeconds = 15
  while ($true) {
    $workerStartedAt = Get-Date
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-BridgeLog "[$stamp] Starting WhatsApp bridge worker: session=$SessionName bridge=$BridgeAccountId worker=$WorkerKey auth=$AuthPath"

    try {
      npm run whatsapp:session:bridge 2>&1 | ForEach-Object {
        $line = $_.ToString()
        Write-BridgeLog $line
        Write-Host $line
      }
      $exitStamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
      Write-BridgeLog "[$exitStamp] Bridge worker exited with code $LASTEXITCODE"
    } catch {
      $errorStamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
      Write-BridgeLog "[$errorStamp] Bridge worker crashed: $($_.Exception.Message)"
    }

    $workerRunSeconds = ((Get-Date) - $workerStartedAt).TotalSeconds
    if ($workerRunSeconds -ge 300) {
      $restartDelaySeconds = 15
    } else {
      $restartDelaySeconds = [Math]::Min(300, [Math]::Max(15, $restartDelaySeconds * 2))
    }

    $sleepStamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-BridgeLog "[$sleepStamp] Restarting WhatsApp bridge in $restartDelaySeconds seconds"
    Start-Sleep -Seconds $restartDelaySeconds
  }
} finally {
  if ($lockAcquired) {
    $bridgeMutex.ReleaseMutex() | Out-Null
  }
  $bridgeMutex.Dispose()
}
