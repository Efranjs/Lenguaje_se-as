-- =====================================================
-- SignAI - Script de inicialización de la base de datos
-- Se ejecuta automáticamente la primera vez que
-- Docker crea el volumen de PostgreSQL.
-- =====================================================

-- Extensión para UUIDs (recomendado para IDs de sesión)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- TABLA: sesiones de detección
-- Guarda cada sesión de uso de la cámara
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at    TIMESTAMPTZ,
    user_agent  TEXT
);

-- ─────────────────────────────────────────────
-- TABLA: predicciones por frame
-- Guarda el historial de lo que el modelo detectó
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sentence        TEXT,
    word            TEXT,
    confidence      FLOAT,
    hands_detected  BOOLEAN,
    model_loaded    BOOLEAN
);

-- ─────────────────────────────────────────────
-- TABLA: imágenes capturadas (opcional)
-- Guarda referencia a imágenes o el base64/ruta
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS captured_frames (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  UUID REFERENCES sessions(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Guarda la ruta del archivo o el base64 del frame
    image_path  TEXT,
    image_b64   TEXT,
    label       TEXT   -- etiqueta de la seña en ese frame
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_predictions_session ON predictions(session_id);
CREATE INDEX IF NOT EXISTS idx_frames_session ON captured_frames(session_id);
CREATE INDEX IF NOT EXISTS idx_predictions_word ON predictions(word);
