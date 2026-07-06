"""Configuración GPU y utilidades de rendimiento para inferencia."""

from __future__ import annotations

import logging
import os

import cv2
import numpy as np

_logger = logging.getLogger("signai.backend")


def configure_tensorflow_gpu(enable: bool = True, memory_growth: bool = True) -> list[str]:
    """Habilita GPU NVIDIA para TensorFlow si está disponible."""
    import sys

    import tensorflow as tf

    if enable and sys.platform == "win32" and not os.environ.get("WSL_DISTRO_NAME"):
        _logger.info(
            "Windows nativo: TensorFlow 2.15 usa CPU (tensorflow-intel). "
            "Para CUDA usa WSL2; ver scripts/setup-gpu.ps1."
        )
        enable = False

    gpus = tf.config.list_physical_devices("GPU")
    if not gpus:
        _logger.warning(
            "No hay GPU visible para TensorFlow. Usa scripts/setup-gpu.ps1 "
            "(pip install tensorflow[and-cuda]==2.15.1)."
        )
        return []

    if not enable:
        try:
            tf.config.set_visible_devices([], "GPU")
        except RuntimeError:
            pass
        _logger.info("GPU desactivada por configuración (LSP_USE_GPU=false)")
        return []

    if memory_growth:
        for gpu in gpus:
            try:
                tf.config.experimental.set_memory_growth(gpu, True)
            except RuntimeError as exc:
                _logger.debug("memory_growth: %s", exc)

    _logger.info("TensorFlow usando GPU: %s", [g.name for g in gpus])
    return [g.name for g in gpus]


def resize_frame_for_inference(frame: np.ndarray, max_width: int) -> np.ndarray:
    """Reduce resolución para acelerar MediaPipe (mantiene aspect ratio)."""
    if max_width <= 0:
        return frame
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    new_w = max_width
    new_h = int(h * scale)
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
