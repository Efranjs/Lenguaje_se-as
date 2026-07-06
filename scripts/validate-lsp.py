#!/usr/bin/env python3
"""Smoke test del vendor modelo_lstm_lsp y del backend SignAI."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendors" / "modelo_lstm_lsp"
MODEL_CANDIDATES = [
    ROOT / "data" / "models" / "actions_15.keras",
    VENDOR / "models" / "actions_15.keras",
]


def main() -> int:
    print("=== Validación LSP ===\n")
    errors = []

    if not VENDOR.is_dir():
        errors.append(f"Falta vendor: {VENDOR}\n  Ejecuta: scripts/clone-lsp-repos.ps1")
    else:
        print(f"[OK] Vendor: {VENDOR}")

    words = ROOT / "data" / "models" / "labels.json"
    vendor_words = VENDOR / "models" / "words.json"
    if words.is_file():
        print(f"[OK] Etiquetas: {words}")
    elif vendor_words.is_file():
        print(f"[OK] Etiquetas (vendor): {vendor_words}")
    else:
        errors.append("No se encontró labels.json ni words.json")

    model_found = None
    for candidate in MODEL_CANDIDATES:
        if candidate.is_file():
            model_found = candidate
            break

    if model_found:
        print(f"[OK] Modelo: {model_found}")
    else:
        print("[AVISO] Sin actions_15.keras — la API funcionará sin predicción hasta entrenar.")
        print("  Entrenar: cd vendors/modelo_lstm_lsp && python training_model.py")
        print("  Copiar a: data/models/actions_15.keras")

    try:
        import cv2  # noqa: F401
        import mediapipe  # noqa: F401
        import numpy  # noqa: F401

        print("[OK] Dependencias base (cv2, mediapipe, numpy)")
    except ImportError as exc:
        errors.append(f"Dependencias faltantes: {exc}\n  pip install -r backend/requirements.txt")

    if model_found:
        try:
            sys.path.insert(0, str(ROOT / "backend"))
            from app.inference.lsp_engine import _load_keras_model

            _load_keras_model(model_found)
            print("[OK] Modelo Keras cargable")
        except Exception as exc:
            errors.append(f"No se pudo cargar el modelo: {exc}")

    sys.path.insert(0, str(ROOT / "backend"))
    try:
        from app.config import settings

        print(f"[OK] Config backend — vendor: {settings.lsp_vendor_dir}")
    except Exception as exc:
        errors.append(f"Config backend: {exc}")

    print()
    if errors:
        for err in errors:
            print(f"[ERROR] {err}")
        return 1

    print("Validación completada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
