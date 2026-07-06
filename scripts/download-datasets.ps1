# Prepara carpetas y muestra enlaces para descargar datasets LSP
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
    (Join-Path $Root "data\datasets\VideoLSP10"),
    (Join-Path $Root "data\datasets\PeruSIL"),
    (Join-Path $Root "data\models")
)

foreach ($p in $paths) {
    New-Item -ItemType Directory -Force -Path $p | Out-Null
    Write-Host "[OK] Carpeta: $p" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== VideoLSP10 ===" -ForegroundColor Cyan
$videoReadme = Join-Path $Root "vendors\VideoLSP10\README.md"
if (Test-Path $videoReadme) {
    Write-Host "Lee el enlace de descarga en: $videoReadme"
} else {
    Write-Host "Clona primero los repos: .\scripts\clone-lsp-repos.ps1"
}
Write-Host "Extrae el contenido en: data\datasets\VideoLSP10\"

Write-Host ""
Write-Host "=== PeruSIL (PUCP) ===" -ForegroundColor Cyan
Write-Host "Portal: https://datos.pucp.edu.pe/dataset.xhtml?persistentId=hdl%3A20.500.12534%2FHDOAGH"
Write-Host "Guarda archivos en: data\datasets\PeruSIL\"

Write-Host ""
Write-Host "=== Modelo LSTM (motor ronvidev) ===" -ForegroundColor Cyan
Write-Host "Entrena en vendors\modelo_lstm_lsp\ y copia actions_15.keras a data\models\"
Write-Host "Ver: docs\LSP_REPOS.md"
