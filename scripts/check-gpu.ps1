# Diagnostico de GPU para SignAI LSP
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

Write-Host "=== GPU del sistema ===" -ForegroundColor Cyan
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,utilization.gpu --format=csv
} else {
    Write-Host "nvidia-smi no encontrado (sin driver NVIDIA o no en PATH)"
}
Get-CimInstance Win32_VideoController | ForEach-Object {
    Write-Host ("  {0} (driver {1})" -f $_.Name, $_.DriverVersion)
}

Write-Host ""
Write-Host "=== TensorFlow en backend ===" -ForegroundColor Cyan
$py = Join-Path $root "backend\.venv\Scripts\python.exe"
$checkScript = Join-Path $PSScriptRoot "check_gpu_tf.py"

if (-not (Test-Path -LiteralPath $py)) {
    Write-Host "No existe backend\.venv. Crea el venv primero:" -ForegroundColor Yellow
    Write-Host "  cd backend"
    Write-Host "  python -m venv .venv"
    Write-Host "  .\.venv\Scripts\pip install -r requirements.txt"
    exit 1
}

$env:TF_CPP_MIN_LOG_LEVEL = "2"
$env:TF_ENABLE_ONEDNN_OPTS = "0"
& $py $checkScript
exit $LASTEXITCODE
