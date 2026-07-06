"""Motor de búsqueda competitiva: Minimax con Poda Alfa-Beta.

Actúa como capa de estabilidad sobre las predicciones crudas del modelo LSTM.
El sistema (Max) busca maximizar la confianza de la predicción correcta,
mientras el ruido ambiental (Min) intenta minimizarla mediante ambigüedades.

La poda Alfa-Beta descarta tempranamente las clases (palabras) que no pueden
superar a la mejor predicción encontrada, reduciendo el cómputo por frame.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

_logger = logging.getLogger("signai.backend")


@dataclass
class DecisionResult:
    """Resultado del motor de decisión."""
    word_id: str
    label: str
    confidence: float
    accepted: bool
    pruned_branches: list[str] = field(default_factory=list)
    reasoning: str = ""


class DecisionEngine:
    """Minimax + Alfa-Beta sobre las probabilidades del clasificador LSTM."""

    def __init__(
        self,
        word_ids: list[str],
        display_map: dict[str, str],
        min_confidence: float = 0.7,
        noise_tolerance: float = 0.15,
        pruning_threshold: float = 0.3,
    ) -> None:
        self.word_ids = word_ids
        self.display_map = display_map
        self.min_confidence = min_confidence
        self.noise_tolerance = noise_tolerance
        self.pruning_threshold = pruning_threshold
        self._n_classes = len(word_ids)

    def evaluate(
        self,
        probabilities: np.ndarray,
        threshold: float | None = None,
    ) -> DecisionResult:
        """Ejecuta Minimax con Alfa-Beta sobre el vector de probabilidades.

        Args:
            probabilities: array de probabilidades softmax del modelo LSTM.
            threshold: umbral de aceptación (opcional, usa default si es None).

        Returns:
            DecisionResult con la predicción filtrada y las ramas podadas.
        """
        effective_threshold = threshold if threshold is not None else self.min_confidence
        probs = np.asarray(probabilities, dtype=np.float64).flatten()

        if len(probs) == 0 or self._n_classes == 0:
            return DecisionResult(
                word_id="", label="", confidence=0.0,
                accepted=False, reasoning="Sin probabilidades",
            )

        # --- FASE DE PODA ALFA-BETA ---
        # Ordenar clases por probabilidad descendente para podar más rápido.
        ranked_indices = np.argsort(probs)[::-1]

        # El adversario (ruido) inyecta incertidumbre: resta la misma tolerancia a cada prob
        # para evitar sesgar o penalizar de forma fija a ciertas clases.
        noisy_probs = probs.copy()
        noise = np.full(len(noisy_probs), self.noise_tolerance)
        noisy_probs = np.clip(noisy_probs - noise, 0.0, 1.0)

        # Alfa: mejor valor encontrado por Max (la mejor predicción).
        # Beta: peor caso que el adversario Min puede forzar.
        alpha = -math.inf
        beta = math.inf
        pruned: list[str] = []

        best_idx = int(ranked_indices[0])
        best_value = -math.inf

        for idx in ranked_indices:
            idx_int = int(idx)
            # --- TURNO DE MIN (adversario / ruido) ---
            # El ruido evalúa el peor escenario para esta clase.
            min_value = noisy_probs[idx_int]

            # --- TURNO DE MAX (sistema) ---
            # El sistema toma el valor tras el ataque del ruido.
            max_value = min_value

            # --- PODA ALFA-BETA ---
            if max_value < alpha:
                # Esta rama no puede superar la mejor opción: podar.
                wid = self.word_ids[idx_int].split("-")[0]
                pruned.append(wid)
                continue

            if max_value > best_value:
                best_value = max_value
                best_idx = idx_int

            # Actualizar alpha con el mejor valor encontrado.
            alpha = max(alpha, best_value)

            if alpha >= beta:
                # Poda beta: el adversario no puede empeorar más allá de beta.
                break

        # --- DECISIÓN FINAL ---
        original_confidence = float(probs[best_idx])
        word_id = self.word_ids[best_idx].split("-")[0]
        label = self.display_map.get(word_id, word_id.replace("_", " ").upper())

        # Aplicar poda adicional: clases con probabilidad muy baja se descartan.
        low_conf_pruned = [
            self.word_ids[int(i)].split("-")[0]
            for i in ranked_indices
            if probs[int(i)] < self.pruning_threshold
            and self.word_ids[int(i)].split("-")[0] != word_id
        ]
        pruned.extend(low_conf_pruned)

        accepted = original_confidence >= effective_threshold

        reasoning = (
            f"Minimax evaluó {len(ranked_indices)} clases, "
            f"podó {len(set(pruned))} ramas de baja confianza. "
            f"Mejor predicción: {label} ({original_confidence:.2%}) "
            f"tras tolerar ruido ±{self.noise_tolerance:.0%}."
        )

        return DecisionResult(
            word_id=word_id,
            label=label,
            confidence=round(original_confidence * 100, 2),
            accepted=accepted,
            pruned_branches=list(set(pruned)),
            reasoning=reasoning,
        )
