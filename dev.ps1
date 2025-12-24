$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backend = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $root "backend") -PassThru
$frontend = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $root "frontend") -PassThru

Write-Host "Backend PID: $($backend.Id)" -ForegroundColor Green
Write-Host "Frontend PID: $($frontend.Id)" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop both processes."

try {
  Wait-Process -Id $backend.Id, $frontend.Id
} finally {
  if (-not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
  if (-not $frontend.HasExited) { Stop-Process -Id $frontend.Id -Force }
}
