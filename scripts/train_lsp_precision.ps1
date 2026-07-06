# Entrena el modelo Transformer LSP (mayor precisión) e instala en data/models/
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Vendor = Join-Path $Root "vendors\modelo_lstm_lsp"
$Python = Join-Path $Root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    $Python = "python"
}

Write-Host "=== SignAI: entrenamiento Transformer LSP ===" -ForegroundColor Cyan

# 1) Importar PeruSIL si existe el dataset local
$PklPath = Join-Path $Root "data\datasets\PeruSIL\Keypoints\pkl\Segmented_gestures"
if (Test-Path $PklPath) {
    Write-Host "Importando keypoints PeruSIL desde $PklPath …"
    & $Python (Join-Path $Root "scripts\import_perusil_keypoints.py") --from-pkl $PklPath
} else {
    Write-Host "Sin dataset PeruSIL en $PklPath (opcional). Usando keypoints en vendor/data/keypoints." -ForegroundColor Yellow
}

Set-Location $Vendor
$env:PYTHONPATH = "."

# 2) Augmentación + entrenamiento
& $Python training_transformer.py --augment 2 --epochs 120

$Src = Join-Path $Vendor "models\actions_15_transformer.keras"
$DstDir = Join-Path $Root "data\models"
New-Item -ItemType Directory -Force -Path $DstDir | Out-Null
$Dst = Join-Path $DstDir "actions_15_transformer.keras"

if (Test-Path $Src) {
    Copy-Item -Force $Src $Dst
    $MetaSrc = $Src -replace "\.keras$", ".meta.json"
    if (Test-Path $MetaSrc) {
        Copy-Item -Force $MetaSrc ($Dst -replace "\.keras$", ".meta.json")
    }
    Write-Host "Modelo copiado a $Dst" -ForegroundColor Green
    Write-Host "Reinicia el backend para cargar el Transformer." -ForegroundColor Green
} else {
    Write-Host "No se generó el modelo. Revisa que existan archivos .h5 en data/keypoints." -ForegroundColor Red
    exit 1
}
