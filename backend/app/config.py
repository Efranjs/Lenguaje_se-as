from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
VENDOR_LSP_DIR = ROOT_DIR / "vendors" / "modelo_lstm_lsp"
DATA_MODELS_DIR = ROOT_DIR / "data" / "models"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    lsp_vendor_dir: str = str(VENDOR_LSP_DIR)
    lsp_model_path: str = ""
    lsp_words_json_path: str = ""
    prediction_threshold: float = 0.7
    # Rendimiento: GPU (TensorFlow LSTM) + MediaPipe más ligero
    lsp_use_gpu: bool = True
    lsp_gpu_memory_growth: bool = True
    mediapipe_model_complexity: int = 1  # 0=rápido, 1=balance, 2=preciso
    frame_max_width: int = 400
    # Si true, descarta frames mientras MediaPipe procesa (rompe la secuencia de señas)
    inference_skip_if_busy: bool = False
    # Tras N frames con manos, traduce aunque no bajes las manos (como en evaluate_model TODO)
    max_sequence_frames: int = 20
    # Solo true si el navegador envía imagen espejada; el entrenamiento usó webcam normal
    mirror_webcam: bool = False

    def resolved_model_path(self) -> Path | None:
        if self.lsp_model_path:
            path = Path(self.lsp_model_path)
            if path.is_file():
                return path
        # Transformer (mayor precisión) tiene prioridad si existe
        candidates = [
            DATA_MODELS_DIR / "actions_15_transformer.keras",
            VENDOR_LSP_DIR / "models" / "actions_15_transformer.keras",
            DATA_MODELS_DIR / "actions_15.keras",
            VENDOR_LSP_DIR / "models" / "actions_15.keras",
        ]
        for candidate in candidates:
            if candidate.is_file():
                return candidate
        return None

    def resolved_words_json(self) -> Path:
        if self.lsp_words_json_path:
            return Path(self.lsp_words_json_path)
        custom = DATA_MODELS_DIR / "labels.json"
        if custom.is_file():
            return custom
        return VENDOR_LSP_DIR / "models" / "words.json"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
