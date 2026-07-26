$env:WHATSAPP_SHOP_CAPTURE_ENABLED = "true"
$env:WHATSAPP_AUTO_PIPELINE_ENABLED = "true"
$env:WHATSAPP_ORDER_TRACKING_ENABLED = "false"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Dev\runnercommercequen35plus\ops\start-whatsapp-bridge.ps1" `
  -BridgeAccountId "246622ad-dd30-4adf-aef6-f2ea41e6d17d" `
  -SessionName "runner-commerce-bridge-002" `
  -WorkerKey "bridge-002" `
  -AuthPath "C:\Dev\runnercommercequen35plus\backend\.wwebjs_auth_bridge_002" `
  -LogName "task-whatsapp-bridge-002.log" `
  -ProtocolTimeoutMs 300000
