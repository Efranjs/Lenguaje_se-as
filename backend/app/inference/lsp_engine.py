"""Adaptador de inferencia LSP sobre vendors/modelo_lstm_lsp."""

from __future__ import annotations

import base64
import json
import logging
import os
import shutil
import sys
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.config import settings
from app.inference.decision_engine import DecisionEngine
from app.inference.mediapipe_fix import (
    ensure_pose_landmark_models,
    install_mediapipe_resource_patch,
    resolve_mediapipe_resource_root,
)
from app.inference.performance import configure_tensorflow_gpu, resize_frame_for_inference
from app.prolog.agent import get_agent as get_prolog_agent


_logger = logging.getLogger("signai.backend")


def _load_keras_model(model_path: Path):
    """Carga el modelo evitando rutas con caracteres no ASCII en Windows."""
    import tensorflow as tf  # noqa: WPS433

    try:
        return tf.keras.models.load_model(str(model_path))
    except UnicodeDecodeError:
        tmp_dir = Path(tempfile.gettempdir()) / "signai_lsp"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        tmp_file = tmp_dir / "actions_15.keras"
        shutil.copy2(model_path, tmp_file)
        _logger.info("Modelo copiado a ruta temporal para carga: %s", tmp_file)
        return tf.keras.models.load_model(str(tmp_file))


def _ensure_vendor_imports(vendor_dir: Path) -> None:
    vendor_str = str(vendor_dir.resolve())
    if vendor_str not in sys.path:
        sys.path.insert(0, vendor_str)

    import constants  # noqa: WPS433

    constants.ROOT_PATH = vendor_str
    constants.MODEL_FOLDER_PATH = os.path.join(vendor_str, "models")
    constants.MODEL_PATH = os.path.join(
        constants.MODEL_FOLDER_PATH, f"actions_{constants.MODEL_FRAMES}.keras"
    )
    constants.WORDS_JSON_PATH = os.path.join(constants.MODEL_FOLDER_PATH, "words.json")
    constants.FRAME_ACTIONS_PATH = os.path.join(vendor_str, "frame_actions")
    constants.DATA_PATH = os.path.join(vendor_str, "data")
    constants.KEYPOINTS_PATH = os.path.join(constants.DATA_PATH, "keypoints")


@dataclass
class SessionState:
    kp_seq: list = field(default_factory=list)
    sentence: list[str] = field(default_factory=list)
    words_log: list[dict[str, Any]] = field(default_factory=list)
    count_frame: int = 0
    fix_frames: int = 0
    recording: bool = False


class LspEngine:
    def __init__(self) -> None:
        self.vendor_dir = Path(settings.lsp_vendor_dir)
        if not self.vendor_dir.is_dir():
            raise FileNotFoundError(f"No existe el vendor LSP: {self.vendor_dir}")

        _ensure_vendor_imports(self.vendor_dir)

        from constants import (  # noqa: WPS433
            MIN_LENGTH_FRAMES,
            MODEL_FRAMES,
            words_text,
        )
        from helpers import (  # noqa: WPS433
            extract_keypoints,
            get_word_ids,
            mediapipe_detection,
            there_hand,
        )
        from mediapipe.python.solutions.holistic import Holistic  # noqa: WPS433

        self.mp_resource_root, self._mp_site_packages = resolve_mediapipe_resource_root()
        install_mediapipe_resource_patch(self.mp_resource_root)

        self.min_length_frames = MIN_LENGTH_FRAMES
        self.model_frames = int(MODEL_FRAMES)
        self.words_text = words_text
        self.normalize_keypoints = _normalize_keypoints
        self.extract_keypoints = extract_keypoints
        self.mediapipe_detection = mediapipe_detection
        self.there_hand = there_hand
        self.get_word_ids = get_word_ids
        self.holistic_class = Holistic

        self.words_path = settings.resolved_words_json()
        self.word_ids = self._load_word_ids(self.words_path)
        self.display_map = self._load_display_map()

        self.gpu_devices = configure_tensorflow_gpu(
            enable=settings.lsp_use_gpu,
            memory_growth=settings.lsp_gpu_memory_growth,
        )

        self.model_path = settings.resolved_model_path()
        self.model_type = self._detect_model_type(self.model_path)
        self.model = None
        self._predict_batch = None
        if self.model_path:
            self.model = _load_keras_model(self.model_path)
            self._predict_batch = self._build_predict_fn(self.model)

        self.holistic: Any | None = None
        self._holistic_kwargs = {
            "model_complexity": settings.mediapipe_model_complexity,
            "smooth_landmarks": True,
            "refine_face_landmarks": False,
            "min_detection_confidence": 0.5,
            "min_tracking_confidence": 0.5,
        }
        self.frame_max_width = settings.frame_max_width
        self.skip_if_busy = settings.inference_skip_if_busy
        self.max_sequence_frames = settings.max_sequence_frames
        self.mirror_webcam = settings.mirror_webcam
        self._infer_lock = threading.Lock()
        self._last_snapshot: dict[str, Any] | None = None

        # Pre-cargar .tflite en el mirror ASCII (complexity 0) antes del primer frame
        try:
            ensure_pose_landmark_models(
                self.mp_resource_root,
                self._mp_site_packages,
                self._holistic_kwargs.get("model_complexity", 1),
            )
        except ConnectionError as exc:
            _logger.warning("Modelos pose no listos al arranque: %s", exc)

        self.sessions: dict[str, SessionState] = {}
        self.margin_frame = 1
        self.delay_frames = 3
        self._min_capture_frames = self.min_length_frames + self.margin_frame
        self.default_threshold = settings.prediction_threshold

        # Motor de decisión: Minimax + Poda Alfa-Beta
        self.decision_engine = DecisionEngine(
            word_ids=self.word_ids,
            display_map=self.display_map,
            min_confidence=self.default_threshold,
            noise_tolerance=0.15,
            pruning_threshold=0.3,
        )

        # Agente de razonamiento: Prolog
        self.prolog_agent = get_prolog_agent()

    @staticmethod
    def _detect_model_type(model_path: Path | None) -> str:
        if not model_path:
            return "none"
        meta_path = Path(str(model_path).replace(".keras", ".meta.json"))
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                return str(meta.get("model_type", "transformer"))
            except (json.JSONDecodeError, OSError):
                pass
        name = model_path.name.lower()
        if "transformer" in name:
            return "transformer"
        return "lstm"

    @staticmethod
    def _build_predict_fn(model):
        import tensorflow as tf  # noqa: WPS433

        @tf.function(jit_compile=False)
        def _run(x):
            return model(x, training=False)

        return _run

    @staticmethod
    def _load_word_ids(words_path: Path) -> list[str]:
        data = json.loads(words_path.read_text(encoding="utf-8"))
        word_ids = data.get("word_ids", [])
        if not word_ids:
            raise ValueError(f"word_ids vacío en {words_path}")
        return word_ids

    def _load_display_map(self) -> dict[str, str]:
        try:
            data = json.loads(self.words_path.read_text(encoding="utf-8"))
            if isinstance(data.get("display"), dict):
                return {str(k): str(v) for k, v in data["display"].items()}
        except (json.JSONDecodeError, OSError):
            pass
        return dict(self.words_text)

    @property
    def model_loaded(self) -> bool:
        return self.model is not None

    def get_labels(self) -> list[dict[str, str]]:
        labels = []
        for word_id in self.word_ids:
            base_id = word_id.split("-")[0]
            label = self.display_map.get(base_id, base_id.replace("_", " ").upper())
            labels.append({"id": word_id, "label": label})
        return labels

    def _get_session(self, session_id: str) -> SessionState:
        if session_id not in self.sessions:
            self.sessions[session_id] = SessionState()
        return self.sessions[session_id]

    @staticmethod
    def _hand_landmarks_from_results(results) -> dict[str, list[dict[str, float]]]:
        """Coordenadas normalizadas (0–1) para dibujar en el frontend."""

        def _to_list(landmarks) -> list[dict[str, float]]:
            if landmarks is None:
                return []
            return [{"x": float(lm.x), "y": float(lm.y)} for lm in landmarks.landmark]

        return {
            "left_hand": _to_list(results.left_hand_landmarks),
            "right_hand": _to_list(results.right_hand_landmarks),
        }

    def _decode_image(self, image_b64: str) -> np.ndarray:
        raw = image_b64.split(",", 1)[-1]
        padding = "=" * (-len(raw) % 4)
        data = base64.b64decode(raw + padding)
        arr = np.frombuffer(data, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("No se pudo decodificar la imagen")
        return frame

    def _ensure_holistic(self) -> None:
        if self.holistic is None:
            ensure_pose_landmark_models(
                self.mp_resource_root,
                self._mp_site_packages,
                self._holistic_kwargs.get("model_complexity", 1),
            )
            self.holistic = self.holistic_class(**self._holistic_kwargs)

    def process_frame(
        self,
        image_b64: str,
        session_id: str = "default",
        threshold: float | None = None,
    ) -> dict[str, Any]:
        if self.skip_if_busy and not self._infer_lock.acquire(blocking=False):
            if self._last_snapshot is not None:
                return {**self._last_snapshot, "skipped": True}
            return {
                "sentence": [],
                "words": [],
                "hands_detected": False,
                "model_loaded": self.model_loaded,
                "landmarks": {"left_hand": [], "right_hand": []},
                "last_prediction": None,
                "message": None,
                "skipped": True,
            }

        try:
            return self._process_frame_impl(image_b64, session_id, threshold)
        finally:
            if self._infer_lock.locked():
                self._infer_lock.release()

    def _process_frame_impl(
        self,
        image_b64: str,
        session_id: str,
        threshold: float | None,
    ) -> dict[str, Any]:
        threshold = threshold if threshold is not None else self.default_threshold
        state = self._get_session(session_id)
        frame = self._decode_image(image_b64)
        frame = resize_frame_for_inference(frame, self.frame_max_width)
        if self.mirror_webcam:
            frame = cv2.flip(frame, 1)
        self._ensure_holistic()
        results = self.mediapipe_detection(frame, self.holistic)
        hands = self.there_hand(results)
        last_word: dict[str, Any] | None = None

        if hands or state.recording:
            state.recording = False
            state.count_frame += 1
            if state.count_frame > self.margin_frame:
                state.kp_seq.append(self.extract_keypoints(results))
            if state.count_frame >= self.max_sequence_frames:
                last_word = self._finalize_sequence(state, threshold, trim_delay=True)
        else:
            if state.count_frame >= self._min_capture_frames:
                state.fix_frames += 1
                if state.fix_frames < self.delay_frames:
                    state.recording = True
                else:
                    last_word = self._finalize_sequence(state, threshold, trim_delay=True)
            if not state.recording:
                state.fix_frames = 0
                state.count_frame = 0
                state.kp_seq = []

        payload = {
            "sentence": list(state.sentence),
            "words": list(state.words_log),
            "hands_detected": bool(hands),
            "model_loaded": self.model_loaded,
            "landmarks": self._hand_landmarks_from_results(results),
            "last_prediction": last_word,
            "capture": self._capture_status(state, hands),
            "message": None
            if self.model_loaded
            else "Modelo no cargado. Entrena y copia actions_15.keras a data/models/",
            "skipped": False,
        }
        self._last_snapshot = payload
        if last_word is not None:
            _logger.info(
                "Seña session=%s aceptada=%s etiqueta=%s confianza=%s",
                session_id,
                last_word.get("accepted"),
                last_word.get("label"),
                last_word.get("confidence"),
            )
        return payload

    def _capture_status(self, state: SessionState, hands: bool) -> dict[str, Any]:
        frames = state.count_frame
        min_f = self._min_capture_frames
        if not hands and frames == 0:
            hint = "Haz la seña con ambas manos visibles en el cuadro"
        elif hands and frames < min_f:
            hint = f"Sostén la seña ({frames}/{min_f} frames)…"
        elif hands and frames >= min_f:
            hint = "Baja las manos del cuadro para traducir (o espera un momento)"
        elif state.recording:
            hint = "Confirmando seña…"
        else:
            hint = "Listo para la siguiente seña"
        return {
            "frames": frames,
            "min_frames": min_f,
            "recording": state.recording,
            "hint": hint,
        }

    def _finalize_sequence(
        self,
        state: SessionState,
        threshold: float,
        *,
        trim_delay: bool,
    ) -> dict[str, Any] | None:
        tail = (self.margin_frame + self.delay_frames) if trim_delay else self.margin_frame
        kp_seq = state.kp_seq[: -tail] if len(state.kp_seq) > tail else list(state.kp_seq)
        last_word = self._predict_kp_sequence(kp_seq, state, threshold)
        state.recording = False
        state.fix_frames = 0
        state.count_frame = 0
        state.kp_seq = []
        return last_word

    def _predict_kp_sequence(
        self,
        kp_seq: list,
        state: SessionState,
        threshold: float,
    ) -> dict[str, Any] | None:
        if not self.model or len(kp_seq) < self.min_length_frames:
            return None

        kp_normalized = self.normalize_keypoints(kp_seq, self.model_frames)
        batch = np.expand_dims(kp_normalized, axis=0).astype(np.float32)
        if self._predict_batch is not None:
            res = self._predict_batch(batch)[0].numpy()
        else:
            res = self.model.predict(batch, verbose=0)[0]

        # --- MOTOR DE DECISIÓN: Minimax + Poda Alfa-Beta ---
        decision = self.decision_engine.evaluate(res, threshold=threshold)

        if not decision.accepted:
            return {
                "word_id": decision.word_id,
                "label": decision.label,
                "confidence": decision.confidence,
                "accepted": False,
                "pruned_branches": decision.pruned_branches,
                "reasoning": decision.reasoning,
            }

        if decision.label not in state.sentence:
            state.sentence.insert(0, decision.label)

        # --- AGENTE PROLOG: razonamiento organizacional ---
        orientations: list[dict[str, str]] = []
        if self.prolog_agent.available:
            prolog_result = self.prolog_agent.process_signs(
                [w["word_id"] for w in state.words_log] + [decision.word_id]
            )
            orientations = prolog_result.get("orientations", [])

        entry = {
            "word_id": decision.word_id,
            "label": decision.label,
            "confidence": decision.confidence,
            "accepted": True,
            "pruned_branches": decision.pruned_branches,
            "reasoning": decision.reasoning,
            "orientations": orientations,
        }
        state.words_log.insert(0, entry)
        return entry

    def _predict_sequence(self, state: SessionState, threshold: float) -> dict[str, Any] | None:
        return self._predict_kp_sequence(state.kp_seq, state, threshold)

    def reset_session(self, session_id: str = "default") -> None:
        self.sessions.pop(session_id, None)

    def close(self) -> None:
        if self.holistic is not None:
            self.holistic.close()
            self.holistic = None


def _interpolate_keypoints(keypoints: list, target_length: int = 15) -> list:
    current_length = len(keypoints)
    if current_length == target_length:
        return keypoints

    indices = np.linspace(0, current_length - 1, target_length)
    interpolated_keypoints = []
    for i in indices:
        lower_idx = int(np.floor(i))
        upper_idx = int(np.ceil(i))
        weight = i - lower_idx
        if lower_idx == upper_idx:
            interpolated_keypoints.append(keypoints[lower_idx])
        else:
            interpolated_point = (1 - weight) * np.array(keypoints[lower_idx]) + weight * np.array(
                keypoints[upper_idx]
            )
            interpolated_keypoints.append(interpolated_point.tolist())
    return interpolated_keypoints


def _normalize_keypoints(keypoints: list, target_length: int = 15) -> list:
    current_length = len(keypoints)
    if current_length < target_length:
        return _interpolate_keypoints(keypoints, target_length)
    if current_length > target_length:
        step = current_length / target_length
        indices = np.arange(0, current_length, step).astype(int)[:target_length]
        return [keypoints[i] for i in indices]
    return keypoints


_engine: LspEngine | None = None


def get_engine() -> LspEngine:
    global _engine
    if _engine is None:
        _engine = LspEngine()
    return _engine
