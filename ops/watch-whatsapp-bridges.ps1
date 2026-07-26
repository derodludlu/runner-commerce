param(
  [int]$PollSeconds = 60,
  [int]$FailureThreshold = 4,
  [int]$TailLines = 180,
  [int]$CooldownSeconds = 300,
  [int]$StaleMinutes = 45
)

$ErrorActionPreference = "Continue"

$Root = "C:\Dev\runnercommercequen35plus"
$Backend = Join-Path $Root "backend"
$LogDir = Join-Path $Backend "logs"
$MonitorLog = Join-Path $LogDir "task-whatsapp-bridge-monitor.log"
$MaintenanceFlag = Join-Path $Root ".runner-commerce-maintenance"

$bridges = @(
  @{
    Name = "WhatsApp Bridge 1"
    BridgeAccountId = "c153058c-375f-475b-93ea-86d1bc1dcc42"
    SessionName = "runner-commerce-bridge-001"
    AuthPath = Join-Path $Backend ".wwebjs_auth_bridge_001"
    LogName = "task-whatsapp-bridge-001.log"
  },
  @{
    Name = "WhatsApp Bridge 2"
    BridgeAccountId = "246622ad-dd30-4adf-aef6-f2ea41e6d17d"
    SessionName = "runner-commerce-bridge-002"
    AuthPath = Join-Path $Backend ".wwebjs_auth_bridge_002"
    LogName = "task-whatsapp-bridge-002.log"
  }
)

$failurePatterns = @(
  "Attempted to use detached Frame",
  "Runtime.callFunctionOn timed out",
  "Execution context was destroyed",
  "Protocol error",
  "auth timeout",
  "Target closed",
  "net::ERR",
  "Runner auto-post failed",
  "Hourly shop capture failed",
  "WhatsApp group discovery sync failed"
)

$healthyPatterns = @(
  "Starting WhatsApp bridge worker",
  "WhatsApp QR awaiting scan",
  "WhatsApp session bridge ready",
  "WhatsApp session authenticated",
  "Synced .* authenticated WhatsApp group",
  "Capturing .* mapped group",
  "Auto-post result .* sent=.* failed=0",
  "Hourly capture .* failed=0",
  "Hourly shop capture sweep completed",
  "Runner auto-post scheduler active"
)

$lastRestartByBridge = @{}
$monitorMutex = New-Object System.Threading.Mutex($false, "Local\RunnerCommerceWhatsAppBridgeMonitor")
$monitorLockAcquired = $false

function Write-MonitorLog {
  param([string]$Message)

  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$stamp] $Message"
  Add-Content -Path $MonitorLog -Encoding UTF8 -Value $line
  Write-Host $line
}

function Test-AnyPattern {
  param(
    [string]$Text,
    [string[]]$Patterns
  )

  foreach ($pattern in $Patterns) {
    if ($Text -match $pattern) {
      return $true
    }
  }

  return $false
}

function Get-BridgeSignal {
  param([hashtable]$Bridge)

  $logFile = Join-Path $LogDir $Bridge.LogName
  if (-not (Test-Path $logFile)) {
    return @{
      State = "UNKNOWN"
      IssueCount = 0
      LastIssue = $null
      LastHealthy = $null
      LogModifiedAt = $null
      Reason = "log file not found"
    }
  }

  $logItem = Get-Item $logFile
  $lines = @(Get-Content -Path $logFile -Tail $TailLines -ErrorAction SilentlyContinue)
  $latestWorkerStartIndex = -1
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ([string]$lines[$index] -match "Starting WhatsApp bridge worker") {
      $latestWorkerStartIndex = $index
    }
  }
  if ($latestWorkerStartIndex -ge 0) {
    $lines = @($lines[$latestWorkerStartIndex..($lines.Count - 1)])
  }
  $lastHealthyIndex = -1
  $lastIssueIndex = -1

  for ($index = 0; $index -lt $lines.Count; $index++) {
    $line = [string]$lines[$index]
    if (Test-AnyPattern -Text $line -Patterns $healthyPatterns) {
      $lastHealthyIndex = $index
    }
    if (Test-AnyPattern -Text $line -Patterns $failurePatterns) {
      $lastIssueIndex = $index
    }
  }

  $issueLines = @()
  for ($index = ($lastHealthyIndex + 1); $index -lt $lines.Count; $index++) {
    $line = [string]$lines[$index]
    if (Test-AnyPattern -Text $line -Patterns $failurePatterns) {
      $issueLines += $line
    }
  }

  $state = "OK"
  $reason = "healthy"
  if ($issueLines.Count -ge $FailureThreshold -and $lastIssueIndex -gt $lastHealthyIndex) {
    $state = "BROKEN"
    $reason = "$($issueLines.Count) repeated runtime issue(s) after last healthy line"
  } elseif ($logItem.LastWriteTime -lt (Get-Date).AddMinutes(-1 * $StaleMinutes)) {
    $state = "STALE"
    $reason = "log has not changed since $($logItem.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  }

  return @{
    State = $state
    IssueCount = $issueLines.Count
    LastIssue = if ($lastIssueIndex -ge 0) { [string]$lines[$lastIssueIndex] } else { $null }
    LastHealthy = if ($lastHealthyIndex -ge 0) { [string]$lines[$lastHealthyIndex] } else { $null }
    LogModifiedAt = $logItem.LastWriteTime
    Reason = $reason
  }
}

function Restart-BridgeWorker {
  param(
    [hashtable]$Bridge,
    [hashtable]$Signal
  )

  $lockFile = Join-Path $Bridge.AuthPath "$($Bridge.SessionName).bridge.lock"
  if (-not (Test-Path $lockFile)) {
    Write-MonitorLog "$($Bridge.Name): cannot restart because lock file was not found at $lockFile"
    return
  }

  try {
    $lock = Get-Content -Path $lockFile -Raw | ConvertFrom-Json
    $pidToStop = [int]$lock.pid
    if ($pidToStop -le 0) {
      Write-MonitorLog "$($Bridge.Name): lock file does not contain a valid pid"
      return
    }

    $process = Get-Process -Id $pidToStop -ErrorAction SilentlyContinue
    if (-not $process) {
      Write-MonitorLog "$($Bridge.Name): worker pid $pidToStop is not running; supervisor should relaunch on next loop"
      return
    }

    Write-MonitorLog "$($Bridge.Name): restarting worker pid $pidToStop because $($Signal.Reason). Last issue: $($Signal.LastIssue)"
    Stop-Process -Id $pidToStop -Force
  } catch {
    Write-MonitorLog "$($Bridge.Name): restart failed: $($_.Exception.Message)"
  }
}

$monitorLockAcquired = $monitorMutex.WaitOne(0, $false)
if (-not $monitorLockAcquired) {
  Write-MonitorLog "WhatsApp bridge monitor already running. Exiting duplicate launcher."
  $monitorMutex.Dispose()
  exit 2
}

Write-MonitorLog "WhatsApp bridge monitor started. Poll=${PollSeconds}s threshold=$FailureThreshold cooldown=${CooldownSeconds}s stale=${StaleMinutes}m"

try {
  while ($true) {
    if (Test-Path $MaintenanceFlag) {
      Write-MonitorLog "Maintenance flag detected. Bridge restart supervision paused."
      Start-Sleep -Seconds $PollSeconds
      continue
    }

    foreach ($bridge in $bridges) {
      $signal = Get-BridgeSignal -Bridge $bridge
      $state = $signal.State

      if ($state -eq "BROKEN" -or $state -eq "STALE") {
        $lastRestart = $lastRestartByBridge[$bridge.BridgeAccountId]
        $cooldownOpen = -not $lastRestart -or $lastRestart -lt (Get-Date).AddSeconds(-1 * $CooldownSeconds)

        if ($cooldownOpen) {
          $lastRestartByBridge[$bridge.BridgeAccountId] = Get-Date
          Restart-BridgeWorker -Bridge $bridge -Signal $signal
        } else {
          Write-MonitorLog "$($bridge.Name): $state detected but restart is cooling down. Reason: $($signal.Reason)"
        }
      }
    }

    Start-Sleep -Seconds $PollSeconds
  }
} finally {
  if ($monitorLockAcquired) {
    $monitorMutex.ReleaseMutex() | Out-Null
  }
  $monitorMutex.Dispose()
}
