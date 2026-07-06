# SignAI — Lengua de Señas Peruana

Monorepo para traducción LSP en tiempo real: frontend React, backend FastAPI y motores/datasets de terceros en `vendors/`.

## Inicio rápido

### 1. Clonar repos LSP

```powershell
.\scripts\clone-lsp-repos.ps1
```

### 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Frontend

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Abre http://localhost:5173

### 4. Modelo (opcional para predicción)

Sin `data/models/actions_15.keras` la API responde pero no clasifica señas. Entrena en `vendors/modelo_lstm_lsp` y copia el archivo. Ver [docs/LSP_REPOS.md](docs/LSP_REPOS.md).

## Validación

```powershell
python scripts\validate-lsp.py
```

## Documentación

- [docs/LSP_REPOS.md](docs/LSP_REPOS.md) — repos integrados
- [backend/README.md](backend/README.md) — API
- [data/datasets/README.md](data/datasets/README.md) — descarga de datasets
