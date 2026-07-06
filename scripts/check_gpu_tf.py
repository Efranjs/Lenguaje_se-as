"""Comprueba TensorFlow y GPUs (invocado desde check-gpu.ps1)."""
import os
import sys

# Menos ruido en consola (oneDNN, deprecations)
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

try:
    import tensorflow as tf
except ImportError:
    print("TensorFlow no instalado. Ejecuta: pip install -r backend/requirements.txt")
    sys.exit(1)

print("TensorFlow:", tf.__version__)
print("CUDA compilado:", tf.test.is_built_with_cuda())
gpus = tf.config.list_physical_devices("GPU")
print("Dispositivos GPU:", gpus)
if not gpus:
    print("Sin GPU para TensorFlow en este entorno.")
    if sys.platform == "win32" and not __import__("os").environ.get("WSL_DISTRO_NAME"):
        print("Windows nativo: TF 2.15 usa CPU. Para CUDA usa WSL2 (ver scripts/setup-gpu.ps1).")
else:
    for g in gpus:
        print(" ", g)
