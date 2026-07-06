from datetime import datetime

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_type: str | None = None
    model_path: str | None = None
    vendor_dir: str
    labels_count: int = 0
    gpu_devices: list[str] = []
    mediapipe_complexity: int = 0
    frame_max_width: int = 480
    message: str | None = None


class LabelItem(BaseModel):
    id: str
    label: str
    trained: bool = False
    samples_count: int = 0


class LabelsResponse(BaseModel):
    labels: list[LabelItem]


class PredictFrameRequest(BaseModel):
    image: str = Field(..., description="Imagen JPEG/PNG en base64")
    session_id: str = "default"
    threshold: float | None = None


class WordPrediction(BaseModel):
    word_id: str
    label: str
    confidence: float


class LandmarkPoint(BaseModel):
    x: float
    y: float


class HandLandmarks(BaseModel):
    left_hand: list[LandmarkPoint] = []
    right_hand: list[LandmarkPoint] = []


class PredictFrameResponse(BaseModel):
    sentence: list[str]
    words: list[WordPrediction]
    hands_detected: bool
    model_loaded: bool
    landmarks: HandLandmarks | None = None
    message: str | None = None


class PredictionItem(BaseModel):
    id: int
    word: str | None
    label: str | None
    confidence: float | None
    hands_detected: bool | None
    created_at: datetime


class SessionItem(BaseModel):
    id: int
    session_id: str
    created_at: datetime
    ended_at: datetime | None
    prediction_count: int = 0


class SessionDetail(BaseModel):
    session: SessionItem
    predictions: list[PredictionItem]


class HistoryResponse(BaseModel):
    sessions: list[SessionItem]


class TtsRequest(BaseModel):
    text: str
    lang: str = "es"


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    is_admin: bool = True


class TrainStatusResponse(BaseModel):
    running: bool
    pid: int | None = None
    started_at: str | None = None
    stage: str | None = None
    message: str | None = None


class PhraseItem(BaseModel):
    id: str
    text: str
    category: str


class PhrasesResponse(BaseModel):
    phrases: list[PhraseItem]


class OrientationItem(BaseModel):
    area: str
    message: str


class OrientRequest(BaseModel):
    word_ids: list[str]


class OrientResponse(BaseModel):
    available: bool
    signs_asserted: list[str] = []
    orientations: list[OrientationItem] = []


class AgentStatusResponse(BaseModel):
    prolog_available: bool
    decision_engine: bool
    word_count: int
