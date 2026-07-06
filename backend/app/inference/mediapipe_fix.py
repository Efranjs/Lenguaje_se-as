"""Workaround MediaPipe en Windows cuando site-packages está bajo rutas con caracteres no ASCII."""

from __future__ import annotations

import logging
import os
import shutil
import sys
import tempfile
from pathlib import Path

_logger = logging.getLogger("signai.backend")

_HOLISTIC_REL = Path("mediapipe/modules/holistic_landmark/holistic_landmark_cpu.binarypb")
_GCS_ASSETS = "https://storage.googleapis.com/mediapipe-assets/"
_POSE_TFLITE = {
    0: Path("mediapipe/modules/pose_landmark/pose_landmark_lite.tflite"),
    2: Path("mediapipe/modules/pose_landmark/pose_landmark_heavy.tflite"),
}


def _needs_ascii_mirror(site_packages: Path) -> bool:
    if sys.platform != "win32":
        return False
    try:
        str(site_packages).encode("ascii")
        return False
    except UnicodeEncodeError:
        return True


def _sync_mediapipe_tree(source_mp: Path, dest_mp: Path) -> None:
    """Copia al mirror ASCII cualquier archivo que falte o cambie (p. ej. .tflite descargados al venv)."""
    if not source_mp.is_dir():
        return
    for src_file in source_mp.rglob("*"):
        if not src_file.is_file():
            continue
        rel = src_file.relative_to(source_mp)
        dest_file = dest_mp / rel
        try:
            if dest_file.is_file() and dest_file.stat().st_size == src_file.stat().st_size:
                continue
        except OSError:
            pass
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_file, dest_file)


def _download_tflite_to(dest_file: Path) -> None:
    import urllib.error
    import urllib.request

    url = _GCS_ASSETS + dest_file.name
    dest_file.parent.mkdir(parents=True, exist_ok=True)
    _logger.info("Descargando modelo MediaPipe: %s", dest_file.name)
    try:
        with urllib.request.urlopen(url, timeout=120) as response, dest_file.open("wb") as out:
            if response.status != 200:
                raise ConnectionError(f"HTTP {response.status} al descargar {url}")
            shutil.copyfileobj(response, out)
    except urllib.error.URLError as exc:
        raise ConnectionError(
            f"No se pudo descargar {dest_file.name}. Revisa conexion a internet. Detalle: {exc}"
        ) from exc


def ensure_pose_landmark_models(resource_root: str, source_site: Path, model_complexity: int) -> None:
    """Holistic complexity 0/2 necesita .tflite en el mismo resource_root que el grafo."""
    rel = _POSE_TFLITE.get(model_complexity)
    if rel is None:
        return

    dest_file = Path(resource_root) / rel
    src_file = source_site / rel

    if dest_file.is_file():
        return
    if src_file.is_file():
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_file, dest_file)
        _logger.info("Modelo pose copiado al mirror: %s", dest_file.name)
        return

    _download_tflite_to(dest_file)


def resolve_mediapipe_resource_root() -> tuple[str, Path]:
    """Devuelve (resource_root, site_packages) para MediaPipe."""
    import mediapipe

    site_packages = Path(mediapipe.__file__).resolve().parent.parent
    source_mp = site_packages / "mediapipe"
    src_pb = site_packages / _HOLISTIC_REL

    if not src_pb.is_file():
        raise FileNotFoundError(f"No se encontró recurso MediaPipe: {src_pb}")

    if not _needs_ascii_mirror(site_packages):
        return str(site_packages), site_packages

    dest_site = Path(tempfile.gettempdir()) / "signai_lsp" / "mp_site"
    dest_mp = dest_site / "mediapipe"
    dest_pb = dest_site / _HOLISTIC_REL
    marker = dest_site / ".source_site"

    source_key = str(site_packages)
    needs_full_copy = (
        not dest_pb.is_file()
        or not marker.is_file()
        or marker.read_text(encoding="utf-8") != source_key
    )

    if needs_full_copy:
        if dest_site.is_dir():
            shutil.rmtree(dest_site, ignore_errors=True)
        dest_site.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source_mp, dest_mp, dirs_exist_ok=True)
        marker.write_text(source_key, encoding="utf-8")
        _logger.info("MediaPipe: recursos copiados a ruta ASCII %s", dest_site)
    else:
        _sync_mediapipe_tree(source_mp, dest_mp)

    return str(dest_site), site_packages


def install_mediapipe_resource_patch(resource_root: str) -> None:
    """Evita que SolutionBase derive root_path desde __file__ (ruta corrupta con ñ)."""
    import mediapipe.python.solution_base as solution_base
    from mediapipe.python._framework_bindings import resource_util

    if getattr(solution_base, "_signai_resource_root", None) == resource_root:
        return

    solution_base._signai_resource_root = resource_root

    def _patched_init(
        self,
        binary_graph_path: str | None = None,
        graph_config=None,
        calculator_params=None,
        graph_options=None,
        side_inputs=None,
        outputs=None,
        stream_type_hints=None,
    ) -> None:
        if bool(binary_graph_path) == bool(graph_config):
            raise ValueError(
                "Must provide exactly one of 'binary_graph_path' or 'graph_config'."
            )
        root_path = solution_base._signai_resource_root
        resource_util.set_resource_dir(root_path)
        validated_graph = solution_base.validated_graph_config.ValidatedGraphConfig()
        if binary_graph_path:
            validated_graph.initialize(
                binary_graph_path=os.path.join(root_path, binary_graph_path)
            )
        else:
            validated_graph.initialize(graph_config=graph_config)

        canonical_graph_config_proto = self._initialize_graph_interface(
            validated_graph, side_inputs, outputs, stream_type_hints
        )
        if calculator_params:
            self._modify_calculator_options(canonical_graph_config_proto, calculator_params)
        if graph_options:
            self._set_extension(canonical_graph_config_proto.graph_options, graph_options)

        self._graph = solution_base.calculator_graph.CalculatorGraph(
            graph_config=canonical_graph_config_proto
        )
        self._simulated_timestamp = 0
        self._graph_outputs = {}

        def callback(stream_name: str, output_packet) -> None:
            self._graph_outputs[stream_name] = output_packet

        for stream_name in self._output_stream_type_info.keys():
            self._graph.observe_output_stream(stream_name, callback, True)

        self._input_side_packets = {
            name: self._make_packet(self._side_input_type_info[name], data)
            for name, data in (side_inputs or {}).items()
        }
        self._graph.start_run(self._input_side_packets)

    solution_base.SolutionBase.__init__ = _patched_init
    solution_base._signai_patched = True
    _logger.debug("Parche MediaPipe SolutionBase instalado (root=%s)", resource_root)
