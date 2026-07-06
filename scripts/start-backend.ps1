# Inicia la API LSP en http://127.0.0.1:8000
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root "backend"
$py = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $py)) {
    Write-Host "Falta el venv. Ejecuta primero:" -ForegroundColor Yellow
    Write-Host "  cd backend"
    Write-Host "  python -m venv .venv"
    Write-Host "  .\.venv\Scripts\pip install -r requirements.txt"
    exit 1
}

$inUse = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($inUse) {
    Write-Host "El puerto 8000 ya esta en uso (PID $($inUse.OwningProcess))." -ForegroundColor Yellow
    Write-Host "Si la API responde, no hace falta iniciar otra vez: http://127.0.0.1:8000/health"
    exit 0
}

Set-Location $root
$env:PYTHONPATH = "$backend"
$env:TF_CPP_MIN_LOG_LEVEL = "2"
Write-Host "Comprobando modelos MediaPipe..." -ForegroundColor Cyan
& $py (Join-Path $root "scripts\ensure_mediapipe_assets.py")
if ($LASTEXITCODE -ne 0) {
    Write-Host "No se pudieron preparar los .tflite. La API puede fallar en la camara." -ForegroundColor Yellow
}
Set-Location $backend
Write-Host "Iniciando API en http://127.0.0.1:8000 ..." -ForegroundColor Green
Write-Host "Detener con Ctrl+C. Luego recarga el frontend." -ForegroundColor Cyan
& $py -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
