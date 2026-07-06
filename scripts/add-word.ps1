param(
    [Parameter(Mandatory=$true)][string]$word_id,
    [Parameter(Mandatory=$true)][string]$display,
    [string]$duplicate_for_left_hand = "no"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$vendor = Join-Path $root "vendors" "modelo_lstm_lsp"
$constants = Join-Path $vendor "constants.py"
$wordsJson = Join-Path $vendor "models" "words.json"
$labelsJson = Join-Path $root "data" "models" "labels.json"

Write-Host "[1/4] Actualizando words.json..." -ForegroundColor Cyan
$existing = Get-Content $wordsJson -Raw | ConvertFrom-Json
$ids = @($existing.word_ids)
if ($duplicate_for_left_hand -ne "no") {
    $ids += "${word_id}-der"
    $ids += "${word_id}-izq"
} else {
    $ids += $word_id
}
$newWords = '{"word_ids":' + ($ids | ConvertTo-Json -Compress) + '}'
Set-Content -Path $wordsJson -Value $newWords -Encoding UTF8
Write-Host "   OK" -ForegroundColor Green

Write-Host "[2/4] Actualizando constants.py..." -ForegroundColor Cyan
$constContent = Get-Content $constants -Raw
$newEntry = "`n    `"${word_id}`": `"$display`","
$newConst = $constContent.TrimEnd() -replace '}$', ''
$newConst = $newConst.TrimEnd() + $newEntry + "`n}"
if ($newConst.Length -lt 10) {
    $newConst = $constContent.TrimEnd() -replace ',$',''
    $newConst = $newConst + $newEntry + "`n}"
}
Set-Content -Path $constants -Value $newConst -Encoding UTF8
Write-Host "   OK" -ForegroundColor Green

Write-Host "[3/4] Actualizando labels.json..." -ForegroundColor Cyan
$labelsRaw = Get-Content $labelsJson -Raw | ConvertFrom-Json
$labelsIds = @($labelsRaw.word_ids)
if ($duplicate_for_left_hand -ne "no") {
    $labelsIds += "${word_id}-der"
    $labelsIds += "${word_id}-izq"
} else {
    $labelsIds += $word_id
}
$labelsDisplay = @{}
$labelsRaw.display.PSObject.Properties | ForEach-Object { $labelsDisplay[$_.Name] = $_.Value }
$labelsDisplay[$word_id] = $display
$newLabels = ($labelsIds | ConvertTo-Json -Compress) + "|"
$newLabels = $newLabels -replace '\|$',''
$labelsJsonStr = '{"word_ids":' + ($labelsIds | ConvertTo-Json -Compress) + ',"display":' + ($labelsDisplay | ConvertTo-Json -Compress) + '}'
Set-Content -Path $labelsJson -Value $labelsJsonStr -Encoding UTF8
Write-Host "   OK" -ForegroundColor Green

Write-Host "[4/4] Iniciando captura de muestras..." -ForegroundColor Cyan
Write-Host "   Haga la senia frente a la camara 10-15 veces." -ForegroundColor Yellow
Write-Host "   Presione Q para salir." -ForegroundColor Yellow

$captureScript = Join-Path $vendor "capture_samples.py"
$venv = Join-Path $root "backend" ".venv" "Scripts" "python.exe"

Push-Location $vendor
try {
    if ($duplicate_for_left_hand -ne "no") {
        Write-Host "   Capturando ${word_id}-der (mano derecha)..." -ForegroundColor Yellow
        & $venv $captureScript "${word_id}-der"
        Write-Host "   Ahora ${word_id}-izq (mano izquierda)..." -ForegroundColor Yellow
        & $venv $captureScript "${word_id}-izq"
    } else {
        & $venv $captureScript $word_id
    }
} finally {
    Pop-Location
}

Write-Host "Captura completada. Siguiente: scripts\train-model.ps1" -ForegroundColor Green
