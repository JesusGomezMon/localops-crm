# Simulated production deployment (standalone of Docker Desktop).
# Mirrors docker-compose.yml: migrate/seed → production Node server.
#
# Usage: powershell -File scripts/deploy-simulado.ps1
# App → http://localhost:3001

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$env:NODE_ENV = "production"
$env:ADMIN_PASSWORD = "SimDeploy-Kasterz-2026!"
$env:AUTH_SECRET = "sim-deploy-auth-secret-change-in-real-prod"
$env:AUTH_URL = "http://localhost:3001"
$env:AUTH_TRUST_HOST = "true"
$env:DATABASE_URL = "file:./prisma/sim-deploy.db"
$env:BOOKING_RATE_LIMIT = "5"
$env:BOOKING_RATE_WINDOW_MS = "60000"
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:PORT = "3001"

Write-Host "==> [1/4] prisma migrate deploy + seed"
pnpm prisma migrate deploy
pnpm db:seed

Write-Host "==> [2/4] production build"
pnpm build

Write-Host "==> [3/4] starting next start on :3001"
Write-Host "    Panel: http://localhost:3001/login"
Write-Host "    User:  admin"
Write-Host "    Pass:  SimDeploy-Kasterz-2026!"

# Stop any previous sim on this port
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

pnpm exec next start -p 3001
