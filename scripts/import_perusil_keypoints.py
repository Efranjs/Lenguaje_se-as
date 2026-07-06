#!/usr/bin/env python3
"""
Importa keypoints de PeruSIL / videos externos al formato HDF5 del motor LSP.

Ejemplos:
  python scripts/import_perusil_keypoints.py --from-pkl data/datasets/PeruSIL/Keypoints/pkl/Segmented_gestures
  python scripts/import_perusil_keypoints.py --from-videos data/datasets/PeruSIL/videos --dry-run
  python scripts/import_perusil_keypoints.py --augment-only 2
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendors" / "modelo_lstm_lsp"
sys.path.insert(0, str(VENDOR))

from constants import KEYPOINTS_PATH, WORDS_JSON_PATH  # noqa: E402
from helpers import get_word_ids  # noqa: E402
from ml.keypoint_io import (  # noqa: E402
    import_pkl_directory,
    import_videos_directory,
    load_gloss_map,
    merge_augmented_copies,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Importar keypoints LSP (PeruSIL / videos)")
    parser.add_argument(
        "--from-pkl",
        type=Path,
        help="Raíz de .pkl (estructura: glosa/video.pkl como en PeruvianSignLanguage)",
    )
    parser.add_argument(
        "--from-videos",
        type=Path,
        help="Raíz de videos: subcarpeta por glosa, archivos .mp4/.avi",
    )
    parser.add_argument(
        "--gloss-map",
        type=Path,
        default=ROOT / "data" / "perusil_gloss_map.json",
    )
    parser.add_argument(
        "--keypoints-dir",
        type=Path,
        default=Path(KEYPOINTS_PATH),
    )
    parser.add_argument(
        "--augment-only",
        type=int,
        metavar="N",
        help="Solo duplicar muestras existentes con augmentación (N copias por muestra)",
    )
    parser.add_argument("--no-body-center", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    gloss_map = load_gloss_map(args.gloss_map)
    videolsp = {}
    if args.gloss_map.is_file():
        raw = json.loads(args.gloss_map.read_text(encoding="utf-8"))
        videolsp = raw.get("videolsp10_folder_map", {})
        for folder, wid in videolsp.items():
            gloss_map[folder.upper()] = wid

    if args.dry_run:
        print("Mapa de glosas (muestra):")
        for k, v in list(gloss_map.items())[:20]:
            print(f"  {k} → {v}")
        print(f"… total {len(gloss_map)} entradas")
        print(f"Destino HDF5: {args.keypoints_dir}")
        return 0

    if args.augment_only:
        word_ids = get_word_ids(str(WORDS_JSON_PATH))
        merge_augmented_copies(args.keypoints_dir, word_ids, copies_per_sample=args.augment_only)
        print(f"Augmentación aplicada ({args.augment_only} copias/muestra).")
        return 0

    if not args.from_pkl and not args.from_videos:
        parser.error("Indica --from-pkl, --from-videos o --augment-only")

    body_center = not args.no_body_center
    total: dict[str, int] = {}

    if args.from_pkl:
        print(f"Importando PKL desde {args.from_pkl}…")
        stats = import_pkl_directory(
            args.from_pkl,
            args.keypoints_dir,
            gloss_map,
            body_center=body_center,
        )
        total.update(stats)

    if args.from_videos:
        print(f"Importando videos desde {args.from_videos}…")
        stats = import_videos_directory(
            args.from_videos,
            args.keypoints_dir,
            gloss_map,
            body_center=body_center,
        )
        total.update(stats)

    if not total:
        print(
            "No se importó ninguna muestra. Verifica rutas y nombres de carpetas "
            "(deben coincidir con perusil_gloss_map.json)."
        )
        return 1

    print("Importación completada:")
    for word_id, n in sorted(total.items()):
        print(f"  {word_id}: +{n} muestras")
    print(f"\nSiguiente paso: cd vendors\\modelo_lstm_lsp && python training_transformer.py --augment 2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
