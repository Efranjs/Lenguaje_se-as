import subprocess
import json
import logging
import sys
from pathlib import Path
from typing import Any

_logger = logging.getLogger("signai.backend")

class PrologAgent:
    """Agente que razona sobre las señas detectadas ejecutando Prolog en un subproceso seguro."""

    def __init__(self) -> None:
        self._available = True
        self._python = sys.executable or "python"
        self._cli_path = Path(__file__).resolve().parent / "query_cli.py"
        _logger.info("Agente Prolog inicializado en modo subproceso seguro.")

    @property
    def available(self) -> bool:
        return self._available

    def clear_session(self) -> None:
        # No-op en modo subproceso síncrono, se limpia en cada llamada
        pass

    def assert_sign(self, word_id: str) -> None:
        # No-op en modo subproceso síncrono
        pass

    def query_orientation(self) -> list[dict[str, str]]:
        # No-op en modo subproceso síncrono
        return []

    def process_signs(self, word_ids: list[str]) -> dict[str, Any]:
        """Flujo completo: ejecuta el subproceso para evaluar las señas."""
        if not self._available or not word_ids:
            return {"available": self._available, "orientations": []}

        try:
            # Filtrar y limpiar identificadores válidos
            cleaned_words = []
            for wid in word_ids:
                safe = wid.strip().lower().replace("-", "_").replace(" ", "_")
                if safe.isidentifier():
                    cleaned_words.append(safe)

            if not cleaned_words:
                return {"available": True, "orientations": []}

            # Ejecutar el script CLI en un proceso independiente
            args = [self._python, str(self._cli_path), ",".join(cleaned_words)]
            proc = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=5.0,
            )
            if proc.returncode == 0:
                data = json.loads(proc.stdout)
                return {
                    "available": True,
                    "signs_asserted": word_ids,
                    "orientations": data.get("orientations", []),
                }
            else:
                _logger.warning("Prolog CLI falló con código %d: %s", proc.returncode, proc.stderr)
        except Exception as exc:
            _logger.warning("Error al ejecutar consulta Prolog en subproceso: %s", exc)

        return {"available": True, "orientations": []}


_agent: PrologAgent | None = None


def get_agent() -> PrologAgent:
    global _agent
    if _agent is None:
        _agent = PrologAgent()
    return _agent
