param(
  [string]$BackendUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  Write-Host "cloudflared was not found on this machine." -ForegroundColor Yellow
  Write-Host "Install Cloudflare Tunnel first, then rerun this script."
  Write-Host "Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
  exit 1
}

Write-Host "Starting Cloudflare Tunnel for backend: $BackendUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "When Cloudflare prints a public https://*.trycloudflare.com URL:"
Write-Host "1. Set Vercel env NEXT_PUBLIC_API_URL to that URL."
Write-Host "2. Add your Vercel frontend URL to backend FRONTEND_URLS."
Write-Host "3. Restart the backend after changing FRONTEND_URLS."
Write-Host ""
Write-Host "Keep this window open while the public frontend is using the local backend."
Write-Host ""

cloudflared tunnel --url $BackendUrl
