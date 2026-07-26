powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Dev\runnercommercequen35plus\ops\watch-whatsapp-bridges.ps1" `
  -PollSeconds 60 `
  -FailureThreshold 4 `
  -CooldownSeconds 300 `
  -StaleMinutes 45
