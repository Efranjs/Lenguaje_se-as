const DEFAULT_API_URL = 'http://localhost:8000';

export function getApiBaseUrl() {
  return (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
}

export async function fetchHealth(apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/health`);
  if (!res.ok) {
    throw new Error(`Health check falló (${res.status})`);
  }
  return res.json();
}

export async function fetchLabels(apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/labels`);
  if (!res.ok) {
    throw new Error(`No se pudieron cargar etiquetas (${res.status})`);
  }
  return res.json();
}

export async function predictFrame(imageBase64, options = {}) {
  const {
    apiUrl = getApiBaseUrl(),
    sessionId = 'default',
    threshold,
  } = options;

  const body = {
    image: imageBase64,
    session_id: sessionId,
  };
  if (threshold != null) {
    body.threshold = threshold / 100;
  }

  const res = await fetch(`${apiUrl}/predict/frame`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Predicción falló (${res.status})`);
  }
  return res.json();
}

export function createDetectWebSocket(options = {}) {
  const {
    apiUrl = getApiBaseUrl(),
    sessionId = 'default',
    onResult,
    onError,
    onOpen,
  } = options;

  const wsBase = apiUrl.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsBase}/ws/detect?session_id=${encodeURIComponent(sessionId)}`);

  ws.onopen = () => onOpen?.();
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'error') {
        onError?.(new Error(data.message || 'Error WebSocket'));
        return;
      }
      if (data.type === 'result') {
        onResult?.(data);
      }
    } catch (err) {
      onError?.(err);
    }
  };
  ws.onerror = () => onError?.(new Error('Error de conexión WebSocket'));
  return ws;
}

export function captureFrameFromVideo(videoEl, quality = 0.55, maxWidth = 480) {
  if (!videoEl || videoEl.videoWidth === 0) {
    return null;
  }
  let w = videoEl.videoWidth;
  let h = videoEl.videoHeight;
  if (maxWidth > 0 && w > maxWidth) {
    h = Math.round((h * maxWidth) / w);
    w = maxWidth;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function fetchHistory(apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/history`);
  if (!res.ok) throw new Error(`Historial falló (${res.status})`);
  return res.json();
}

export async function fetchSessionDetail(sessionId, apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/history/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`Sesión no encontrada (${res.status})`);
  return res.json();
}

export async function fetchAdminAddWord(wordId, display, apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/admin/words`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: CREDS,
    body: JSON.stringify({ word_id: wordId, display }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Error al agregar palabra');
  }
  return res.json();
}

export async function fetchAdminListWords(apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/admin/words`, { credentials: CREDS });
  if (!res.ok) return { words: [] };
  return res.json();
}

export async function fetchPhrases(apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/phrases`);
  if (!res.ok) throw new Error(`Frases falló (${res.status})`);
  return res.json();
}

export async function fetchTts(text, lang = 'es', apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) throw new Error(`TTS falló (${res.status})`);
  return res.json();
}

const CREDS = 'include';

export async function fetchLogin(username, password, apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: CREDS,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Login falló');
  }
  return res.json();
}

export async function fetchLogout(apiUrl = getApiBaseUrl()) {
  await fetch(`${apiUrl}/auth/logout`, {
    method: 'POST',
    credentials: CREDS,
  });
}

export async function fetchAuthMe(apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/auth/me`, { credentials: CREDS });
  if (!res.ok) return { authenticated: false };
  return res.json();
}

export async function fetchTrainStart(apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/train/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: CREDS,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Error al iniciar entrenamiento');
  }
  return res.json();
}

export async function fetchCaptureSave(wordId, frames, apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/capture/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: CREDS,
    body: JSON.stringify({ word_id: wordId, frames }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Error al guardar captura');
  }
  return res.json();
}

export async function fetchCaptureSamples(wordId, apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/capture/samples/${encodeURIComponent(wordId)}`, {
    credentials: CREDS,
  });
  if (!res.ok) return { samples: [] };
  return res.json();
}

export async function fetchTrainStatus(apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/train/status`, { credentials: CREDS });
  if (!res.ok) return { running: false };
  return res.json();
}

export async function fetchAgentStatus(apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/agent/status`);
  if (!res.ok) return { prolog_available: false, decision_engine: false, word_count: 0 };
  return res.json();
}

export async function fetchAgentOrient(wordIds, apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/agent/orient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word_ids: wordIds }),
  });
  if (!res.ok) return { available: false, orientations: [] };
  return res.json();
}

export async function fetchAdminDeleteWord(wordId, apiUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiUrl}/admin/words/${encodeURIComponent(wordId)}`, {
    method: 'DELETE',
    credentials: CREDS,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Error al eliminar palabra');
  }
  return res.json();
}
