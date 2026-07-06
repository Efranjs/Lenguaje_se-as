param(
    [Parameter(Mandatory=$true)][string]$word_id,
    [string]$duplicate_for_left_hand = "no"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$vendor = Join-Path $root "vendors" "modelo_lstm_lsp"
$captureScript = Join-Path $vendor "capture_samples.py"
$venv = Join-Path $root "backend" ".venv" "Scripts" "python.exe"

Write-Host "Iniciando captura de muestras para '$word_id'" -ForegroundColor Cyan
Write-Host "Haga la senia frente a la camara 10-15 veces." -ForegroundColor Yellow
Write-Host "Separe las manos entre cada repeticion. Presione Q para salir." -ForegroundColor Yellow

Push-Location $vendor
try {
    if ($duplicate_for_left_hand -ne "no") {
        Write-Host "Capturando ${word_id}-der (mano derecha)..." -ForegroundColor Yellow
        & $venv $captureScript "${word_id}-der"
        Write-Host "Ahora ${word_id}-izq (mano izquierda)..." -ForegroundColor Yellow
        & $venv $captureScript "${word_id}-izq"
    } else {
        & $venv $captureScript $word_id
    }
} finally {
    Pop-Location
}

Write-Host "Listo! Siguiente: scripts\capture-word.ps1 <otra_palabra>" -ForegroundColor Green
