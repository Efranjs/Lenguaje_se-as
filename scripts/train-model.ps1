param(
    [switch]$gpu,
    [int]$epochs = 120,
    [int]$augment = 2
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$vendor = Join-Path $root "vendors" "modelo_lstm_lsp"
$venvPath = Join-Path $root "backend" ".venv" "Scripts"
$python = Join-Path $venvPath "python.exe"
$outputModel = Join-Path $root "data" "models" "actions_15.keras"

Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      ENTRENAMIENTO COMPLETO LSP                 ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan

Push-Location $vendor
try {
    # ─── 1. Normalizar ───
    Write-Host ""
    Write-Host "[1/3] Normalizando muestras a $($MODEL_FRAMES) frames..." -ForegroundColor Yellow
    & $python normalize_samples.py
    if ($LASTEXITCODE -ne 0) { throw "Error en normalización" }
    Write-Host "✓ Normalización completa" -ForegroundColor Green

    # ─── 2. Extraer keypoints ───
    Write-Host ""
    Write-Host "[2/3] Extrayendo keypoints con MediaPipe..." -ForegroundColor Yellow
    & $python create_keypoints.py
    if ($LASTEXITCODE -ne 0) { throw "Error en extracción de keypoints" }
    Write-Host "✓ Keypoints extraídos" -ForegroundColor Green

    # ─── 3. Entrenar ───
    Write-Host ""
    Write-Host "[3/3] Entrenando modelo Transformer (${epochs} epochs, augment=$augment)..." -ForegroundColor Yellow
    & $python training_transformer.py --output $outputModel --epochs $epochs --augment $augment
    if ($LASTEXITCODE -ne 0) { throw "Error en entrenamiento" }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║      ENTRENAMIENTO COMPLETO                      ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Modelo: data/models/actions_15.keras           ║" -ForegroundColor Green
Write-Host "║  Reiniciá el backend para usarlo                ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Comandos para reiniciar el backend:" -ForegroundColor Yellow
Write-Host "  cd backend/.venv/Scripts/activate.ps1" -ForegroundColor Gray
Write-Host "  uvicorn app.main:app --reload" -ForegroundColor Gray
