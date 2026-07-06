"""Agente de razonamiento organizacional basado en Prolog.

Integra SWI-Prolog via PySwip para inferir orientaciones municipales
a partir de las señas detectadas por el modelo LSTM.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

_logger = logging.getLogger("signai.backend")

_KB_PATH = Path(__file__).parent / "knowledge_base.pl"


class PrologAgent:
    """Agente que razona sobre las señas detectadas usando Prolog."""

    def __init__(self) -> None:
        try:
            from pyswip import Prolog

            self._prolog = Prolog()
            self._prolog.consult(str(_KB_PATH))
            self._available = True
            _logger.info("Agente Prolog inicializado: %s", _KB_PATH)
        except Exception as exc:
            _logger.warning("Prolog no disponible: %s", exc)
            self._prolog = None
            self._available = False

    @property
    def available(self) -> bool:
        return self._available

    def clear_session(self) -> None:
        """Limpia las señas detectadas de la sesión anterior."""
        if not self._available:
            return
        try:
            list(self._prolog.query("limpiar_sesion."))
        except Exception as exc:
            _logger.warning("Error al limpiar sesión Prolog: %s", exc)

    def assert_sign(self, word_id: str) -> None:
        """Inserta un hecho dinámico: sena_detectada(<word_id>)."""
        if not self._available:
            return
        safe = word_id.strip().lower().replace("-", "_").replace(" ", "_")
        if not safe.isidentifier():
            _logger.warning("Identificador Prolog inválido: %s", word_id)
            return
        try:
            self._prolog.assertz(f"sena_detectada({safe})")
        except Exception as exc:
            _logger.warning("Error al assertar seña %s: %s", safe, exc)

    def query_orientation(self) -> list[dict[str, str]]:
        """Consulta todas las orientaciones que aplican a las señas actuales."""
        if not self._available:
            return []
        try:
            results = list(self._prolog.query("consultar_orientacion(Area, Mensaje)"))
            orientations: list[dict[str, str]] = []
            for r in results:
                area = str(r.get("Area", ""))
                mensaje = str(r.get("Mensaje", ""))
                if area and mensaje:
                    orientations.append({"area": area, "message": mensaje})
            return orientations
        except Exception as exc:
            _logger.warning("Error al consultar orientación: %s", exc)
            return []

    def process_signs(self, word_ids: list[str]) -> dict[str, Any]:
        """Flujo completo: limpia, asserta señas y consulta orientación."""
        if not self._available:
            return {"available": False, "orientations": []}

        self.clear_session()
        for wid in word_ids:
            self.assert_sign(wid)

        orientations = self.query_orientation()
        self.clear_session()

        return {
            "available": True,
            "signs_asserted": word_ids,
            "orientations": orientations,
        }


_agent: PrologAgent | None = None


def get_agent() -> PrologAgent:
    global _agent
    if _agent is None:
        _agent = PrologAgent()
    return _agent
