powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Dev\runnercommercequen35plus\ops\start-whatsapp-bridge.ps1" `
  -BridgeAccountId "c153058c-375f-475b-93ea-86d1bc1dcc42" `
  -SessionName "runner-commerce-bridge-001" `
  -WorkerKey "bridge-001" `
  -AuthPath "C:\Dev\runnercommercequen35plus\backend\.wwebjs_auth_bridge_001" `
  -LogName "task-whatsapp-bridge-001.log" `
  -ProtocolTimeoutMs 300000
