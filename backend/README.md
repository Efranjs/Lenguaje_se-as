# SignAI Backend — LSP

API FastAPI que envuelve [vendors/modelo_lstm_lsp](../vendors/modelo_lstm_lsp/).

## Requisitos

- Python 3.10 u 3.11
- Repos vendor clonados: `..\scripts\clone-lsp-repos.ps1`

## Instalación

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Tu GPU y rendimiento

| Hardware | NVIDIA GeForce RTX 3050 6GB (driver CUDA 13.1) |
| TensorFlow en Windows nativo | **Solo CPU** desde TF 2.11; el venv usa `tensorflow-intel` |
| MediaPipe Holistic | **CPU** (mayor parte del tiempo por frame) |

**Fluidez ya optimizada en código:** ~15 FPS en frontend, frames 480px, MediaPipe `complexity=0`, salta frames si el backend va saturado.

```powershell
.\scripts\check-gpu.ps1
```

**Para usar la RTX 3050 con TensorFlow 2.15:** ejecutar el backend en **WSL2 (Ubuntu)** e instalar ahí `tensorflow[and-cuda]` (`.\scripts\setup-gpu.ps1` dentro de WSL).

En `backend/.env` (ver `.env.example`):

```env
LSP_MEDIAPIPE_COMPLEXITY=0
FRAME_MAX_WIDTH=480
INFERENCE_SKIP_IF_BUSY=true
```

## Modelo

Tras `clone-lsp-repos.ps1`, el vendor suele incluir `vendors/modelo_lstm_lsp/models/actions_15.keras`. El backend lo resuelve automáticamente (o `data/models/actions_15.keras` si lo copias ahí).

Si no hay pesos:

1. Entrenar en el vendor (keypoints en `vendors/modelo_lstm_lsp/data/keypoints/`)
2. Copiar el `.keras` a `data/models/actions_15.keras`

Sin modelo, `/health` responde `model_loaded: false`; MediaPipe y la API siguen activos.

### Windows y rutas con caracteres no ASCII (p. ej. `Lenguaje_señas`)

TensorFlow y MediaPipe pueden fallar al leer archivos bajo rutas con `ñ` u otros caracteres fuera de ASCII. El backend aplica workarounds automáticos:

- Modelo Keras → copia en `%TEMP%\signai_lsp\actions_15.keras`
- Recursos MediaPipe → copia en `%TEMP%\signai_lsp\mp_site\` (ver `app/inference/mediapipe_fix.py`)

Si persisten errores, mueve el proyecto a una ruta solo ASCII (p. ej. `C:\dev\signai`) o usa WSL2.

## Ejecutar

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Documentación interactiva: http://127.0.0.1:8000/docs

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado y carga del modelo |
| GET | `/labels` | Palabras LSP |
| POST | `/predict/frame` | Frame base64 → predicción |
| WS | `/ws/detect` | Stream de frames JSON |
| POST | `/session/{id}/reset` | Reinicia sesión de secuencia |

## Variables de entorno

Crear `backend/.env` (opcional):

```env
LSP_MODEL_PATH=C:/ruta/actions_15.keras
LSP_VENDOR_DIR=../vendors/modelo_lstm_lsp
PREDICTION_THRESHOLD=0.7
CORS_ORIGINS=http://localhost:5173
```

## Validación

```powershell
python ..\scripts\validate-lsp.py
```
