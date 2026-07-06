import json
import logging
import os
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.auth import TokenData, create_access_token, decode_token, hash_password, verify_password
from app.config import settings
from app.database import get_db, init_db
from app.inference.lsp_engine import get_engine
from app.inference import lsp_engine as lsp_engine_module
from app.models import User as UserModel
from app.repository import (
    end_session,
    get_all_sessions,
    get_or_create_session,
    get_predictions_by_session,
    get_session_history,
    save_prediction,
)
from app.schemas import (
    AgentStatusResponse,
    HandLandmarks,
    HealthResponse,
    HistoryResponse,
    LabelItem,
    LabelsResponse,
    LandmarkPoint,
    LoginRequest,
    LoginResponse,
    OrientRequest,
    OrientResponse,
    OrientationItem,
    PhraseItem,
    PhrasesResponse,
    PredictFrameRequest,
    PredictFrameResponse,
    PredictionItem,
    SessionDetail,
    SessionItem,
    TrainStatusResponse,
    TtsRequest,
    WordPrediction,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("signai.backend")

app = FastAPI(title="SignAI LSP API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Set-Cookie"],
)

security = HTTPBearer(auto_error=False)
COOKIE_NAME = "signai_token"
TRAINING_RUNNING = False
TRAINING_PROCESS: subprocess.Popen | None = None
TRAINING_STARTED_AT: str | None = None
TRAINING_LOG: list[str] = []
TRAINING_LOCK = threading.Lock()


def _extract_token(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> str | None:
    if credentials:
        return credentials.credentials
    token = request.cookies.get(COOKIE_NAME)
    if token:
        return token
    return None


def _get_current_user(
    token_str: str | None = Depends(_extract_token),
    db: DbSession = Depends(get_db),
) -> UserModel | None:
    if not token_str:
        return None
    token_data = decode_token(token_str)
    if not token_data:
        return None
    user = db.execute(
        select(UserModel).where(UserModel.username == token_data.username)
    ).scalar_one_or_none()
    return user


def _require_admin(user: UserModel | None = Depends(_get_current_user)) -> UserModel:
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Se requiere autenticación de administrador")
    return user


PHRASES = [
    PhraseItem(id="hola", text="Hola", category="saludo"),
    PhraseItem(id="gracias", text="Gracias", category="cortesia"),
    PhraseItem(id="como_estas", text="¿Cómo estás?", category="saludo"),
    PhraseItem(id="buenos_dias", text="Buenos días", category="saludo"),
    PhraseItem(id="buenas_tardes", text="Buenas tardes", category="saludo"),
    PhraseItem(id="buenas_noches", text="Buenas noches", category="saludo"),
    PhraseItem(id="por_favor", text="Por favor", category="cortesia"),
    PhraseItem(id="disculpa", text="Disculpa", category="cortesia"),
    PhraseItem(id="me_ayudas", text="¿Me ayudas?", category="pregunta"),
    PhraseItem(id="bien", text="Bien", category="estado"),
    PhraseItem(id="mal", text="Mal", category="estado"),
    PhraseItem(id="adios", text="Adiós", category="saludo"),
    PhraseItem(id="si", text="Sí", category="afirmacion"),
    PhraseItem(id="no", text="No", category="negacion"),
    PhraseItem(id="cuanto_cuesta", text="¿Cuánto cuesta?", category="pregunta"),
    PhraseItem(id="donde_esta", text="¿Dónde está?", category="pregunta"),
    PhraseItem(id="necesito_ayuda", text="Necesito ayuda", category="necesidad"),
    PhraseItem(id="me_gusta", text="Me gusta", category="expresion"),
    PhraseItem(id="no_entiendo", text="No entiendo", category="expresion"),
    PhraseItem(id="feliz_cumple", text="Feliz cumpleaños", category="celebracion"),
]


@app.post("/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, response: Response, db: DbSession = Depends(get_db)):
    user = db.execute(
        select(UserModel).where(UserModel.username == body.username)
    ).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    token = create_access_token(data={"sub": user.username})
    max_age = 60 * 60 * 24 * 30  # 30 days
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=False,  # True en producción con HTTPS
        path="/",
    )
    return LoginResponse(access_token=token, username=user.username, is_admin=user.is_admin)


@app.get("/auth/me")
def auth_me(user: UserModel | None = Depends(_get_current_user)):
    if not user:
        return {"authenticated": False}
    return {"authenticated": True, "username": user.username, "is_admin": user.is_admin}


@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"ok": True}


def _reload_engine():
    """Force engine reload so new words are picked up."""
    lsp_engine_module._engine = None
    get_engine()


@app.post("/admin/words")
def admin_add_word(body: dict, user: UserModel = Depends(_require_admin)):
    word_id = body.get("word_id", "").strip()
    display_name = body.get("display", word_id).strip().upper()
    if not word_id:
        raise HTTPException(status_code=400, detail="word_id requerido")

    vendor_dir = Path(settings.lsp_vendor_dir)

    # Update words.json
    words_json = vendor_dir / "models" / "words.json"
    if words_json.exists():
        data = json.loads(words_json.read_text("utf-8"))
    else:
        data = {"word_ids": []}
    if word_id not in data["word_ids"]:
        data["word_ids"].append(word_id)
        words_json.write_text(json.dumps(data, ensure_ascii=False), "utf-8")

    # Update labels.json
    labels_json = vendor_dir.parent.parent / "data" / "models" / "labels.json"
    if labels_json.exists():
        labels_data = json.loads(labels_json.read_text("utf-8"))
    else:
        labels_data = {"word_ids": [], "display": {}}
    if word_id not in labels_data["word_ids"]:
        labels_data["word_ids"].append(word_id)
    labels_data["display"][word_id] = display_name
    labels_json.parent.mkdir(parents=True, exist_ok=True)
    labels_json.write_text(json.dumps(labels_data, ensure_ascii=False), "utf-8")

    # Update constants.py
    constants_path = vendor_dir / "constants.py"
    if constants_path.exists():
        const_text = constants_path.read_text("utf-8")
        entry = f'    "{word_id}": "{display_name}",'
        if f'"{word_id}"' not in const_text:
            const_text = const_text.rstrip()
            if const_text.endswith("}"):
                const_text = const_text[:-1].rstrip().rstrip(",") + ",\n" + entry + "\n}"
            constants_path.write_text(const_text, "utf-8")

    try:
        _reload_engine()
    except Exception as exc:
        logger.warning("Engine reload after word add: %s", exc)

    return {"word_id": word_id, "display": display_name, "ok": True}


@app.get("/admin/words")
def admin_list_words(user: UserModel = Depends(_require_admin)):
    engine = get_engine()
    labels = engine.get_labels()
    return {"words": labels}


@app.delete("/admin/words/{word_id}")
def admin_delete_word(word_id: str, user: UserModel = Depends(_require_admin)):
    word_id = word_id.strip()
    if not word_id:
        raise HTTPException(status_code=400, detail="word_id requerido")

    vendor_dir = Path(settings.lsp_vendor_dir)

    # 1. Update words.json
    words_json = vendor_dir / "models" / "words.json"
    if words_json.exists():
        try:
            data = json.loads(words_json.read_text("utf-8"))
            if word_id in data.get("word_ids", []):
                data["word_ids"].remove(word_id)
                words_json.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
        except Exception as e:
            logger.warning("Error updating words.json during delete: %s", e)

    # 2. Update labels.json
    labels_json = vendor_dir.parent.parent / "data" / "models" / "labels.json"
    if labels_json.exists():
        try:
            labels_data = json.loads(labels_json.read_text("utf-8"))
            if word_id in labels_data.get("word_ids", []):
                labels_data["word_ids"].remove(word_id)
            if word_id in labels_data.get("display", {}):
                labels_data["display"].pop(word_id)
            labels_json.write_text(json.dumps(labels_data, ensure_ascii=False), "utf-8")
        except Exception as e:
            logger.warning("Error updating labels.json during delete: %s", e)

    # 3. Update constants.py
    constants_path = vendor_dir / "constants.py"
    if constants_path.exists():
        try:
            const_text = constants_path.read_text("utf-8")
            lines = const_text.splitlines()
            new_lines = [line for line in lines if f'"{word_id}"' not in line]
            constants_path.write_text("\n".join(new_lines) + "\n", "utf-8")
        except Exception as e:
            logger.warning("Error updating constants.py during delete: %s", e)

    # 4. Delete frame_actions folder and keypoints .h5 file
    import shutil
    frame_actions_dir = vendor_dir / "frame_actions" / word_id
    if frame_actions_dir.exists() and frame_actions_dir.is_dir():
        try:
            shutil.rmtree(frame_actions_dir)
        except Exception as e:
            logger.warning("Error deleting frame_actions folder: %s", e)

    h5_file = vendor_dir.parent.parent / "data" / "keypoints" / f"{word_id}.h5"
    if h5_file.exists():
        try:
            h5_file.unlink()
        except Exception as e:
            logger.warning("Error deleting h5 file: %s", e)

    try:
        _reload_engine()
    except Exception as exc:
        logger.warning("Engine reload after word delete: %s", exc)

    return {"word_id": word_id, "ok": True}


@app.post("/capture/save")
def capture_save(body: dict, user: UserModel = Depends(_require_admin)):
    word_id = body.get("word_id")
    frames_b64 = body.get("frames", [])
    if not word_id or not frames_b64:
        raise HTTPException(status_code=400, detail="word_id y frames requeridos")

    vendor_dir = Path(settings.lsp_vendor_dir)
    sample_dir = vendor_dir / "frame_actions" / word_id / f"sample_{datetime.now().strftime('%y%m%d%H%M%S%f')}"
    sample_dir.mkdir(parents=True, exist_ok=True)

    import base64
    saved = 0
    for i, b64 in enumerate(frames_b64):
        try:
            if "," in b64:
                b64 = b64.split(",", 1)[-1]
            raw = base64.b64decode(b64)
            dst = sample_dir / f"{i + 1}.jpg"
            dst.write_bytes(raw)
            saved += 1
        except Exception as exc:
            logger.warning("Frame %d ignorado: %s", i, exc)

    return {"word_id": word_id, "sample_path": str(sample_dir), "frames_saved": saved}


@app.get("/capture/samples/{word_id}")
def capture_samples_list(word_id: str, user: UserModel = Depends(_require_admin)):
    vendor_dir = Path(settings.lsp_vendor_dir)
    samples_dir = vendor_dir / "frame_actions" / word_id
    if not samples_dir.is_dir():
        return {"word_id": word_id, "samples": []}
    samples = []
    for child in sorted(samples_dir.iterdir()):
        if child.is_dir() and child.name.startswith("sample_"):
            frames = sorted(child.glob("*"))
            samples.append({
                "name": child.name,
                "frames": len(frames),
                "path": str(child),
            })
    return {"word_id": word_id, "samples": samples}


@app.post("/train/start", response_model=TrainStatusResponse)
def train_start(user: UserModel = Depends(_require_admin)):
    global TRAINING_RUNNING, TRAINING_PROCESS, TRAINING_STARTED_AT, TRAINING_LOG
    with TRAINING_LOCK:
        if TRAINING_RUNNING:
            raise HTTPException(status_code=409, detail="Ya hay un entrenamiento en ejecución")

        vendor_dir = Path(settings.lsp_vendor_dir)
        python = str(
            Path(__file__).resolve().parents[2] / "backend" / ".venv" / "Scripts" / "python.exe"
        )
        script_dir = vendor_dir

        TRAINING_LOG = []
        TRAINING_STARTED_AT = datetime.now(timezone.utc).isoformat()
        TRAINING_RUNNING = True

        def _run():
            global TRAINING_RUNNING, TRAINING_PROCESS
            try:
                steps = [
                    ("normalize", "normalize_samples.py"),
                    ("create_keypoints", "create_keypoints.py"),
                    ("train", "training_transformer.py"),
                ]
                for stage, script in steps:
                    with TRAINING_LOCK:
                        if not TRAINING_RUNNING:
                            return
                    filepath = script_dir / script
                    TRAINING_LOG.append(f"[{stage}] Iniciando {script}...")
                    proc = subprocess.Popen(
                        [python, str(filepath)],
                        cwd=str(script_dir),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                    )
                    for line in proc.stdout:
                        TRAINING_LOG.append(line.rstrip())
                    proc.wait()
                    if proc.returncode != 0:
                        TRAINING_LOG.append(f"[{stage}] ERROR código {proc.returncode}")
                        break
                    TRAINING_LOG.append(f"[{stage}] OK")
                else:
                    TRAINING_LOG.append("Entrenamiento completado, recargando engine…")
                    _reload_engine()
            finally:
                with TRAINING_LOCK:
                    TRAINING_RUNNING = False
                    TRAINING_PROCESS = None

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return TrainStatusResponse(
            running=True,
            started_at=TRAINING_STARTED_AT,
            stage="iniciando",
            message="Entrenamiento iniciado",
        )


@app.get("/train/status", response_model=TrainStatusResponse)
def train_status(user: UserModel = Depends(_require_admin)):
    with TRAINING_LOCK:
        return TrainStatusResponse(
            running=TRAINING_RUNNING,
            started_at=TRAINING_STARTED_AT,
            message="\n".join(TRAINING_LOG[-50:]) if TRAINING_LOG else None,
        )


def _safe_engine():
    try:
        return get_engine()
    except Exception as exc:
        logger.exception("Error al inicializar motor LSP")
        raise exc


@app.on_event("startup")
def startup() -> None:
    init_db()
    logger.info("Base de datos inicializada")
    try:
        engine = get_engine()
        logger.info(
            "Motor LSP: model_loaded=%s path=%s",
            engine.model_loaded,
            engine.model_path,
        )
    except FileNotFoundError as exc:
        logger.warning("Vendor no disponible al arranque: %s", exc)
    except Exception as exc:
        logger.warning("Motor LSP no inicializado al arranque: %s", exc)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        engine = _safe_engine()
        return HealthResponse(
            status="ok",
            model_loaded=engine.model_loaded,
            model_type=getattr(engine, "model_type", None),
            model_path=str(engine.model_path) if engine.model_path else None,
            vendor_dir=str(engine.vendor_dir),
            labels_count=len(engine.word_ids),
            gpu_devices=getattr(engine, "gpu_devices", []) or [],
            mediapipe_complexity=settings.mediapipe_model_complexity,
            frame_max_width=settings.frame_max_width,
            message=None
            if engine.model_loaded
            else "API operativa; falta actions_15.keras (ver docs/LSP_REPOS.md)",
        )
    except FileNotFoundError as exc:
        return HealthResponse(
            status="degraded",
            model_loaded=False,
            model_path=None,
            vendor_dir=settings.lsp_vendor_dir,
            labels_count=0,
            message=str(exc),
        )
    except Exception as exc:
        return HealthResponse(
            status="degraded",
            model_loaded=False,
            model_path=str(settings.resolved_model_path()) if settings.resolved_model_path() else None,
            vendor_dir=settings.lsp_vendor_dir,
            labels_count=0,
            message=str(exc),
        )


@app.get("/labels", response_model=LabelsResponse)
def labels() -> LabelsResponse:
    try:
        engine = get_engine()
        items = [LabelItem(**item) for item in engine.get_labels()]
        return LabelsResponse(labels=items)
    except Exception as exc:
        logger.exception("Error al listar etiquetas")
        raise exc


@app.post("/predict/frame", response_model=PredictFrameResponse)
def predict_frame(body: PredictFrameRequest) -> PredictFrameResponse:
    engine = get_engine()
    result = engine.process_frame(
        body.image,
        session_id=body.session_id,
        threshold=body.threshold,
    )
    words = [WordPrediction(**w) for w in result["words"]]
    landmarks_raw = result.get("landmarks") or {}
    landmarks = HandLandmarks(
        left_hand=[LandmarkPoint(**p) for p in landmarks_raw.get("left_hand", [])],
        right_hand=[LandmarkPoint(**p) for p in landmarks_raw.get("right_hand", [])],
    )

    last_pred = result.get("last_prediction")
    if last_pred and last_pred.get("accepted"):
        db = next(get_db())
        try:
            session = get_or_create_session(db, body.session_id)
            save_prediction(
                db=db,
                session_id_fk=session.id,
                word=last_pred.get("word_id"),
                label=last_pred.get("label"),
                confidence=last_pred.get("confidence"),
                hands_detected=result["hands_detected"],
                model_loaded=result["model_loaded"],
                sentence=" · ".join(result["sentence"]) if result["sentence"] else None,
            )
        finally:
            db.close()

    return PredictFrameResponse(
        sentence=result["sentence"],
        words=words,
        hands_detected=result["hands_detected"],
        model_loaded=result["model_loaded"],
        landmarks=landmarks,
        message=result.get("message"),
    )


@app.post("/session/{session_id}/reset")
def reset_session(session_id: str) -> dict[str, str]:
    engine = get_engine()
    engine.reset_session(session_id)
    return {"status": "ok", "session_id": session_id}


@app.get("/history", response_model=HistoryResponse)
def history() -> HistoryResponse:
    db = next(get_db())
    try:
        sessions = get_all_sessions(db)
        items = [
            SessionItem(
                id=s.id,
                session_id=s.session_id,
                created_at=s.created_at,
                ended_at=s.ended_at,
                prediction_count=len(s.predictions),
            )
            for s in sessions
        ]
        return HistoryResponse(sessions=items)
    finally:
        db.close()


@app.get("/history/{session_id}", response_model=SessionDetail)
def history_detail(session_id: str) -> SessionDetail:
    db = next(get_db())
    try:
        session = get_session_history(db, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
        predictions = get_predictions_by_session(db, session.id)
        return SessionDetail(
            session=SessionItem(
                id=session.id,
                session_id=session.session_id,
                created_at=session.created_at,
                ended_at=session.ended_at,
                prediction_count=len(session.predictions),
            ),
            predictions=[
                PredictionItem(
                    id=p.id,
                    word=p.word,
                    label=p.label,
                    confidence=p.confidence,
                    hands_detected=p.hands_detected,
                    created_at=p.created_at,
                )
                for p in predictions
            ],
        )
    finally:
        db.close()


@app.post("/tts")
def text_to_speech(body: TtsRequest):
    try:
        from gtts import gTTS
        import base64
        import io

        tts = gTTS(text=body.text, lang=body.lang, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        audio_b64 = base64.b64encode(buf.read()).decode("utf-8")
        return {"audio": audio_b64, "format": "mp3"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/phrases", response_model=PhrasesResponse)
def phrases() -> PhrasesResponse:
    return PhrasesResponse(phrases=PHRASES)


@app.get("/agent/status", response_model=AgentStatusResponse)
def agent_status() -> AgentStatusResponse:
    engine = get_engine()
    return AgentStatusResponse(
        prolog_available=engine.prolog_agent.available,
        decision_engine=True,
        word_count=len(engine.word_ids),
    )


@app.post("/agent/orient", response_model=OrientResponse)
def agent_orient(body: OrientRequest) -> OrientResponse:
    engine = get_engine()
    if not engine.prolog_agent.available:
        return OrientResponse(available=False)
    result = engine.prolog_agent.process_signs(body.word_ids)
    orientations = [OrientationItem(**o) for o in result.get("orientations", [])]
    return OrientResponse(
        available=True,
        signs_asserted=result.get("signs_asserted", []),
        orientations=orientations,
    )


@app.websocket("/ws/detect")
async def websocket_detect(websocket: WebSocket) -> None:
    await websocket.accept()
    session_id = websocket.query_params.get("session_id", "ws-default")
    try:
        engine = get_engine()
        engine.reset_session(session_id)
    except FileNotFoundError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close()
        return

    try:
        while True:
            raw = await websocket.receive_text()
            payload = json.loads(raw)
            msg_type = payload.get("type", "frame")

            if msg_type == "reset":
                engine.reset_session(session_id)
                await websocket.send_json({"type": "reset", "session_id": session_id})
                continue

            if msg_type != "frame":
                await websocket.send_json({"type": "error", "message": "Tipo desconocido"})
                continue

            image = payload.get("image")
            if not image:
                await websocket.send_json({"type": "error", "message": "Falta campo image"})
                continue

            threshold = payload.get("threshold")
            if TRAINING_RUNNING:
                await websocket.send_json({
                    "type": "result",
                    "hands_detected": False,
                    "model_loaded": False,
                    "sentence": [],
                    "realtime_prediction": None,
                    "skipped": True,
                })
                continue

            result = engine.process_frame(
                image,
                session_id=session_id,
                threshold=float(threshold) if threshold is not None else None,
            )

            last_pred = result.get("last_prediction")
            if last_pred and last_pred.get("accepted"):
                db = next(get_db())
                try:
                    session = get_or_create_session(db, session_id)
                    save_prediction(
                        db=db,
                        session_id_fk=session.id,
                        word=last_pred.get("word_id"),
                        label=last_pred.get("label"),
                        confidence=last_pred.get("confidence"),
                        hands_detected=result["hands_detected"],
                        model_loaded=result["model_loaded"],
                        sentence=" · ".join(result["sentence"]) if result["sentence"] else None,
                    )
                finally:
                    db.close()

            await websocket.send_json(
                {
                    "type": "result",
                    "sentence": result["sentence"],
                    "words": result["words"],
                    "hands_detected": result["hands_detected"],
                    "model_loaded": result["model_loaded"],
                    "landmarks": result.get("landmarks"),
                    "last_prediction": result.get("last_prediction"),
                    "capture": result.get("capture"),
                    "message": result.get("message"),
                    "skipped": result.get("skipped", False),
                }
            )
    except WebSocketDisconnect:
        logger.info("WebSocket desconectado: %s", session_id)
    except json.JSONDecodeError:
        await websocket.send_json({"type": "error", "message": "JSON inválido"})
    except ConnectionError as exc:
        logger.warning("MediaPipe sin modelos pose: %s", exc)
        await websocket.send_json(
            {
                "type": "error",
                "message": (
                    "Faltan modelos MediaPipe (pose). Conecta internet y reinicia el backend, "
                    "o ejecuta: python scripts/ensure_mediapipe_assets.py"
                ),
            }
        )
    except Exception as exc:
        logger.exception("Error en WebSocket")
        await websocket.send_json({"type": "error", "message": str(exc)})
