# GPU para SignAI LSP
# - Linux / WSL2: tensorflow[and-cuda]
# - Windows nativo: TensorFlow 2.11+ NO soporta CUDA (solo CPU / WSL2)
$ErrorActionPreference = "Stop"

if ($env:OS -match "Windows" -and -not $env:WSL_DISTRO_NAME) {
    Write-Host "=== Windows nativo detectado ===" -ForegroundColor Yellow
    Write-Host @"
TensorFlow 2.15 en Windows NO instala drivers CUDA (solo tensorflow-intel CPU).
Tu GPU: NVIDIA GeForce RTX 3050 6GB — usable con:

  1) WSL2 (recomendado para TF+CUDA):
     wsl --install
     Dentro de Ubuntu en WSL:
       cd /mnt/c/Users/efran/Documents/Proyectos/Lenguaje_señas/backend
       python3 -m venv .venv && source .venv/bin/activate
       pip install -r requirements.txt
       pip uninstall -y tensorflow tensorflow-intel
       pip install 'tensorflow[and-cuda]==2.15.1'

  2) Seguir en Windows con optimizaciones CPU (ya aplicadas en el codigo):
     - MediaPipe complexity 0
     - Frames 480px, ~15 FPS
     - Skip frame si el backend esta ocupado

Ejecuta: .\scripts\check-gpu.ps1
"@ -ForegroundColor Cyan
    exit 0
}

$backend = Join-Path $PSScriptRoot "..\backend"
$venvPip = Join-Path $backend ".venv\Scripts\pip.exe"
$venvPy = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPy)) {
    Write-Host "Crea el venv en backend primero." -ForegroundColor Yellow
    exit 1
}

Write-Host "Desinstalando TensorFlow CPU..." -ForegroundColor Cyan
& $venvPip uninstall -y tensorflow tensorflow-intel 2>$null
Write-Host "Instalando tensorflow[and-cuda]==2.15.1 ..." -ForegroundColor Cyan
& $venvPip install "tensorflow[and-cuda]==2.15.1"
& $venvPy -c "import tensorflow as tf; print('GPUs:', tf.config.list_physical_devices('GPU'))"
