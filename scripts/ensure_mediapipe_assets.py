"""Pre-descarga/copia modelos MediaPipe al mirror ASCII (Windows + ruta con ñ)."""
from __future__ import annotations

import sys
from pathlib import Path

backend = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(backend))

from app.config import settings  # noqa: E402
from app.inference.mediapipe_fix import (  # noqa: E402
    ensure_pose_landmark_models,
    resolve_mediapipe_resource_root,
)


def main() -> int:
    root, site = resolve_mediapipe_resource_root()
    complexity = settings.mediapipe_model_complexity
    print(f"resource_root={root}")
    print(f"model_complexity={complexity}")
    ensure_pose_landmark_models(root, site, complexity)
    rel = {
        0: "mediapipe/modules/pose_landmark/pose_landmark_lite.tflite",
        2: "mediapipe/modules/pose_landmark/pose_landmark_heavy.tflite",
    }.get(complexity)
    if rel:
        path = Path(root) / rel
        print(f"OK: {path} ({path.stat().st_size if path.is_file() else 0} bytes)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConnectionError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print(
            "Conecta internet y vuelve a ejecutar, o copia el .tflite desde "
            "backend\\.venv\\Lib\\site-packages\\mediapipe\\modules\\pose_landmark\\ "
            "a %TEMP%\\signai_lsp\\mp_site\\mediapipe\\modules\\pose_landmark\\",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc
