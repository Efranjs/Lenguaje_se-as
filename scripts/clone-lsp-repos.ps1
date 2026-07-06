# Clona los repositorios LSP en vendors/
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $Root "frontend"))) {
    $Root = Split-Path -Parent $PSScriptRoot
}

$VendorsDir = Join-Path $Root "vendors"
New-Item -ItemType Directory -Force -Path $VendorsDir | Out-Null

$repos = @(
    @{ Name = "modelo_lstm_lsp"; Url = "https://github.com/ronvidev/modelo_lstm_lsp.git" },
    @{ Name = "VideoLSP10"; Url = "https://github.com/videoLSP/VideoLSP10.git" },
    @{ Name = "PeruvianSignLanguage"; Url = "https://github.com/gissemari/PeruvianSignLanguage.git" }
)

foreach ($repo in $repos) {
    $dest = Join-Path $VendorsDir $repo.Name
    if (Test-Path (Join-Path $dest ".git")) {
        Write-Host "[OK] Ya existe: $($repo.Name)" -ForegroundColor Green
        continue
    }
    Write-Host "[CLONE] $($repo.Url) -> $dest" -ForegroundColor Cyan
    git clone --depth 1 $repo.Url $dest
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo al clonar $($repo.Name)"
    }
}

Write-Host "`nRepositorios listos en: $VendorsDir" -ForegroundColor Green
