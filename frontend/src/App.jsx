import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  ChevronLeft,
  History,
  Languages,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  RefreshCw,
  Settings,
  Shield,
  Video,
  VideoOff,
} from 'lucide-react';
import {
  captureFrameFromVideo,
  createDetectWebSocket,
  fetchHealth,
  fetchHistory,
  fetchLabels,
  fetchPhrases,
  fetchSessionDetail,
  fetchTrainStart,
  fetchTrainStatus,
  fetchTts,
  getApiBaseUrl,
  predictFrame,
} from './api/lspClient';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AdminPanel from './components/AdminPanel';
import { useHandOverlay } from './hooks/useHandOverlay';
import { useBrowserHandTracking } from './hooks/useBrowserHandTracking';

const VIEWS = {
  deteccion: {
    id: 'deteccion',
    title: 'Panel de Traducción',
    showLanguageSelector: true,
  },
  historial: {
    id: 'historial',
    title: 'Historial',
    showLanguageSelector: false,
  },
  lenguajes: {
    id: 'lenguajes',
    title: 'Lenguajes',
    showLanguageSelector: false,
  },
  frases: {
    id: 'frases',
    title: 'Frases comunes',
    showLanguageSelector: false,
  },
  vocabulario: {
    id: 'vocabulario',
    title: 'Vocabulario',
    showLanguageSelector: false,
  },
  configuracion: {
    id: 'configuracion',
    title: 'Configuración',
    showLanguageSelector: false,
  },
  admin: {
    id: 'admin',
    title: 'Admin',
    showLanguageSelector: false,
  },
  login: {
    id: 'login',
    title: 'Iniciar sesión',
    showLanguageSelector: false,
  },
};

const SETTINGS_STORAGE_KEY = 'signai-settings';

const DEFAULT_SETTINGS = {
  signLanguage: 'lsp',
  confidenceThreshold: 70,
  showDebugOverlay: false,
  showHandLandmarks: true,
  useLocalHandTracking: true,
  frameIntervalMs: 100,
  captureMaxWidth: 400,
  autoStartCamera: true,
  apiUrl: 'http://localhost:8000',
  useWebSocket: true,
};

const SIGN_LANGUAGES = [
  { id: 'lsp', label: 'Lengua de Señas Peruana (LSP)' },
  { id: 'lse', label: 'Lengua de Signos Española (LSE)' },
  { id: 'asl', label: 'American Sign Language (ASL)' },
];

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (merged.apiUrl && merged.apiUrl.includes('127.0.0.1')) {
      merged.apiUrl = merged.apiUrl.replace('127.0.0.1', 'localhost');
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function AppContent() {
  const [activeView, setActiveView] = useState('deteccion');
  const [settings, setSettings] = useState(loadSettings);
  const [isCameraOn, setIsCameraOn] = useState(settings.autoStartCamera);
  const [isMicOn, setIsMicOn] = useState(false);
  const [backendStatus, setBackendStatus] = useState(null);
  const { user, logout } = useAuth();

  const view = VIEWS[activeView];
  const apiUrl = settings.apiUrl || getApiBaseUrl();

  const refreshBackendStatus = useCallback(async () => {
    try {
      const health = await fetchHealth(apiUrl);
      setBackendStatus(health);
    } catch {
      setBackendStatus({ status: 'offline', model_loaded: false });
    }
  }, [apiUrl]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (settings.autoStartCamera && activeView === 'deteccion') {
      setIsCameraOn(true);
    }
  }, [settings.autoStartCamera, activeView]);

  useEffect(() => {
    refreshBackendStatus();
  }, [refreshBackendStatus]);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const selectedLanguage =
    SIGN_LANGUAGES.find((l) => l.id === settings.signLanguage) ?? SIGN_LANGUAGES[0];

  return (
    <div className="flex h-screen bg-canvas text-text font-sans overflow-hidden">
      {activeView !== 'login' && (
      <aside className="w-20 lg:w-64 bg-navy flex flex-col items-center lg:items-stretch shrink-0">
        <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 w-full border-b border-white/10">
          <span className="font-bold text-xl hidden lg:block tracking-tight text-text-on-navy uppercase">
            SignAI
          </span>
        </div>

        <nav className="flex-1 w-full py-8 flex flex-col gap-1.5 px-0 lg:px-4">
          <NavItem
            icon={<Video className="w-5 h-5" />}
            label="Detección"
            active={activeView === 'deteccion'}
            onClick={() => setActiveView('deteccion')}
          />
          <NavItem
            icon={<History className="w-5 h-5" />}
            label="Historial"
            active={activeView === 'historial'}
            onClick={() => setActiveView('historial')}
          />
          <NavItem
            icon={<Languages className="w-5 h-5" />}
            label="Lenguajes"
            active={activeView === 'lenguajes'}
            onClick={() => setActiveView('lenguajes')}
          />
          <NavItem
            icon={<MessageSquare className="w-5 h-5" />}
            label="Frases comunes"
            active={activeView === 'frases'}
            onClick={() => setActiveView('frases')}
          />
          <NavItem
            icon={<BookOpen className="w-5 h-5" />}
            label="Vocabulario"
            active={activeView === 'vocabulario'}
            onClick={() => setActiveView('vocabulario')}
          />
        </nav>

        <div className="w-full py-3 border-t border-white/10 lg:px-4 flex flex-col gap-1.5">
          {user && (
            <NavItem
              icon={<Shield className="w-5 h-5" />}
              label="Admin"
              active={activeView === 'admin'}
              onClick={() => setActiveView('admin')}
            />
          )}
          <NavItem
            icon={<Settings className="w-5 h-5" />}
            label="Configuración"
            active={activeView === 'configuracion'}
            onClick={() => setActiveView('configuracion')}
          />
        </div>

        {user && (
          <div className="w-full px-4 py-4 border-t border-white/10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted-on-navy/50 mb-1 hidden lg:block">
              Conectado
            </p>
            <span className="hidden lg:block text-sm font-medium text-text-on-navy truncate mb-3">
              {user.username}
            </span>
            <button
              type="button"
              onClick={() => { logout(); setActiveView('deteccion'); }}
              className="w-full text-xs font-semibold text-text-on-navy/80 hover:text-text-on-navy border border-white/15 hover:border-white/30 hover:bg-white/5 px-3 py-2 rounded-lg transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </aside>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-surface">
        {activeView !== 'login' && (
        <header className="h-16 flex items-center justify-between px-6 border-b border-canvas-muted bg-surface shrink-0">
          <div className="flex items-center gap-5">
            {activeView !== 'deteccion' && (
              <button
                type="button"
                onClick={() => setActiveView('deteccion')}
                className="lg:hidden text-text-secondary hover:text-navy p-1 -ml-1"
                aria-label="Volver a detección"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-lg font-semibold text-text tracking-tight">{view.title}</h1>
            {activeView === 'deteccion' && (
              <span
                className={`hidden sm:flex h-2 w-2 rounded-full ${
                  backendStatus?.status === 'ok' ? 'bg-navy' : 'bg-red-500'
                }`}
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <span className="text-xs font-semibold text-navy">
                {user.username}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setActiveView('login')}
                className="text-xs font-semibold text-text-on-navy bg-navy hover:bg-navy-muted px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
              >
                Iniciar sesión
              </button>
            )}
          </div>
        </header>
        )}

        {activeView === 'deteccion' && (
          <DetectionView
            isCameraOn={isCameraOn}
            setIsCameraOn={setIsCameraOn}
            isMicOn={isMicOn}
            setIsMicOn={setIsMicOn}
            showDebugOverlay={settings.showDebugOverlay}
            showHandLandmarks={settings.showHandLandmarks}
            useLocalHandTracking={settings.useLocalHandTracking}
            confidenceThreshold={settings.confidenceThreshold}
            apiUrl={apiUrl}
            useWebSocket={settings.useWebSocket}
            frameIntervalMs={settings.frameIntervalMs}
            captureMaxWidth={settings.captureMaxWidth}
            backendStatus={backendStatus}
            user={user}
            onNavigateAdmin={() => setActiveView('admin')}
          />
        )}

        {activeView === 'historial' && (
          <HistoryView apiUrl={apiUrl} />
        )}

        {activeView === 'lenguajes' && (
          <LanguagesView
            selectedId={settings.signLanguage}
            onSelect={(id) => {
              updateSetting('signLanguage', id);
            }}
          />
        )}

        {activeView === 'frases' && (
          <PhrasesView apiUrl={apiUrl} onTts={(text) => {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            fetchTts(text).then((data) => {
              const binary = atob(data.audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              audioCtx.decodeAudioData(bytes.buffer, (buffer) => {
                const source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.destination);
                source.start();
              });
            }).catch(() => {});
          }} />
        )}

        {activeView === 'vocabulario' && (
          <VocabularioView apiUrl={apiUrl} />
        )}

        {activeView === 'login' && !user && (
          <LoginView apiUrl={apiUrl} onLoginSuccess={() => setActiveView('deteccion')} onBack={() => setActiveView('deteccion')} />
        )}

        {activeView === 'admin' && user?.isAdmin && (
          <AdminPanel apiUrl={apiUrl} />
        )}

        {activeView === 'configuracion' && (
          <SettingsView
            settings={settings}
            onChange={updateSetting}
          />
        )}
      </main>
    </div>
  );
}

function DetectionView({
  isCameraOn,
  setIsCameraOn,
  isMicOn,
  setIsMicOn,
  showDebugOverlay,
  showHandLandmarks,
  useLocalHandTracking,
  confidenceThreshold,
  apiUrl,
  useWebSocket,
  frameIntervalMs,
  captureMaxWidth,
  backendStatus,
  user,
  onNavigateAdmin,
}) {
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [trainStatus, setTrainStatus] = useState(null);
  const [trainingLog, setTrainingLog] = useState([]);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const wsRef = useRef(null);
  const [sentence, setSentence] = useState([]);
  const [words, setWords] = useState([]);
  const [cameraError, setCameraError] = useState(null);
  const [handsDetected, setHandsDetected] = useState(false);
  const [hasLandmarks, setHasLandmarks] = useState(false);
  const [apiMessage, setApiMessage] = useState(null);
  const [captureHint, setCaptureHint] = useState(null);
  const [lastRejected, setLastRejected] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [localHandsDetected, setLocalHandsDetected] = useState(false);
  const [handTrackerStatus, setHandTrackerStatus] = useState({ phase: 'idle' });
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [orientations, setOrientations] = useState([]);
  const [decisionReasoning, setDecisionReasoning] = useState(null);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setCameras(videoDevices);
      if (videoDevices.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    });
  }, []);

  const localHandsEnabled = showHandLandmarks && useLocalHandTracking;

  const { pushLandmarks } = useHandOverlay({
    enabled: isCameraOn && showHandLandmarks,
    videoRef,
    canvasRef: overlayRef,
    videoReady,
  });

  const onLocalLandmarks = useCallback(
    (landmarks, detected) => {
      pushLandmarks(landmarks, detected);
      setLocalHandsDetected(detected);
      setHasLandmarks(
        (landmarks?.left_hand?.length ?? 0) > 0 ||
          (landmarks?.right_hand?.length ?? 0) > 0 ||
          (landmarks?.face?.length ?? 0) > 0
      );
    },
    [pushLandmarks]
  );

  useBrowserHandTracking({
    enabled: isCameraOn && localHandsEnabled && videoReady,
    videoRef,
    videoReady,
    onLandmarks: onLocalLandmarks,
    onStatus: setHandTrackerStatus,
  });

  const applyResult = useCallback(
    (data) => {
      if (data.sentence) setSentence(data.sentence);
      if (data.words) {
        const mapped = data.words.map((w) => ({
          word: w.label,
          confidence: w.confidence,
        }));
        setWords(mapped.filter((w) => w.confidence >= confidenceThreshold));
      }
      if (!localHandsEnabled) {
        const detected = Boolean(data.hands_detected);
        setHandsDetected(detected);
        const lm = data.landmarks;
        const anyPoints =
          (lm?.left_hand?.length ?? 0) > 0 || (lm?.right_hand?.length ?? 0) > 0;
        setHasLandmarks(anyPoints);
        if (showHandLandmarks) {
          pushLandmarks(lm, detected);
        }
      } else {
        setHandsDetected(localHandsDetected);
      }
      setApiMessage(data.message || null);
      setCaptureHint(data.capture?.hint ?? null);

      const lp = data.last_prediction;
      if (lp && lp.accepted === false) {
        setLastRejected(`${lp.label} (${lp.confidence}% — sube umbral o repite la seña)`);
      } else if (lp?.accepted) {
        setLastRejected(null);
      }
      if (lp?.orientations?.length) {
        setOrientations(lp.orientations);
      }
      if (lp?.reasoning) {
        setDecisionReasoning(lp.reasoning);
      }
    },
    [
      confidenceThreshold,
      localHandsDetected,
      localHandsEnabled,
      pushLandmarks,
      showHandLandmarks,
    ]
  );

  useEffect(() => {
    if (localHandsEnabled) {
      setHandsDetected(localHandsDetected);
    }
  }, [localHandsDetected, localHandsEnabled]);

  const sendFrameOverWs = useCallback(() => {
    const video = videoRef.current;
    const ws = wsRef.current;
    if (!video || !isCameraOn || !ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    const frame = captureFrameFromVideo(video, 0.48, captureMaxWidth);
    if (!frame) {
      return false;
    }
    ws.send(
      JSON.stringify({
        type: 'frame',
        image: frame,
        threshold: confidenceThreshold / 100,
      })
    );
    return true;
  }, [captureMaxWidth, confidenceThreshold, isCameraOn]);

  const sendFrameHttp = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isCameraOn) return false;

    const frame = captureFrameFromVideo(video, 0.48, captureMaxWidth);
    if (!frame) return false;

    try {
      const result = await predictFrame(frame, {
        apiUrl,
        sessionId: 'web-default',
        threshold: confidenceThreshold,
      });
      applyResult(result);
      return true;
    } catch (err) {
      setApiMessage(err.message);
      return false;
    }
  }, [apiUrl, applyResult, captureMaxWidth, confidenceThreshold, isCameraOn]);

  useEffect(() => {
    if (!isCameraOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
      setHasLandmarks(false);
      setVideoReady(false);
      const canvas = overlayRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return undefined;
    }

    let cancelled = false;

    async function startCamera() {
      try {
        const videoConstraints = selectedCameraId
          ? { deviceId: { exact: selectedCameraId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } };
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (videoRef.current.videoWidth > 0) {
            setVideoReady(true);
          }
        }
        setCameraError(null);
      } catch (err) {
        setCameraError('No se pudo acceder a la cámara. Revisa permisos del navegador.');
        setIsCameraOn(false);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [isCameraOn, setIsCameraOn, selectedCameraId]);

  useEffect(() => {
    if (!isCameraOn || backendStatus?.status !== 'ok') return undefined;

    let cancelled = false;
    let timerId;

    const scheduleNext = (delayMs = frameIntervalMs) => {
      if (cancelled) return;
      clearTimeout(timerId);
      timerId = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) {
        scheduleNext(150);
        return;
      }
      if (useWebSocket) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          if (!sendFrameOverWs()) {
            scheduleNext(150);
          }
        } else {
          scheduleNext(300);
        }
        return;
      }
      await sendFrameHttp();
      scheduleNext();
    };

    if (useWebSocket) {
      const ws = createDetectWebSocket({
        apiUrl,
        sessionId: 'web-default',
        onResult: (data) => {
          if (!data.skipped) {
            applyResult(data);
          }
          scheduleNext();
        },
        onError: (err) => setApiMessage(err.message),
        onOpen: () => scheduleNext(0),
      });
      wsRef.current = ws;
      return () => {
        cancelled = true;
        clearTimeout(timerId);
        ws.close();
        wsRef.current = null;
      };
    }

    scheduleNext(0);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [
    apiUrl,
    applyResult,
    backendStatus?.status,
    frameIntervalMs,
    isCameraOn,
    sendFrameHttp,
    sendFrameOverWs,
    useWebSocket,
  ]);

  const displayText =
    sentence.length > 0
      ? sentence.join(' · ')
      : captureHint || (handsDetected ? 'Detectando seña…' : 'Realiza una seña frente a la cámara');

  const filteredWords = words.filter((w) => w.confidence >= confidenceThreshold);

  const handTrackerStatusLabel =
    showHandLandmarks && handTrackerStatus.phase === 'loading' && localHandsEnabled
      ? 'Cargando modelos…'
      : showHandLandmarks && !hasLandmarks
        ? 'Sin rostro/manos'
        : '';

  const startTraining = async () => {
    setTrainingLog([]);
    try {
      const data = await fetchTrainStart(apiUrl);
      setTrainStatus(data);
      setTrainingLog(['Entrenamiento iniciado…']);
    } catch (err) {
      setTrainingLog([`Error: ${err.message}`]);
    }
  };

  useEffect(() => {
    if (!user?.isAdmin) return;
    const id = setInterval(async () => {
      try {
        const data = await fetchTrainStatus(apiUrl);
        setTrainStatus(data);
        if (data?.message) {
          const lines = data.message.split('\n');
          setTrainingLog(prev => (prev.length === lines.length ? prev : lines));
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(id);
  }, [user?.isAdmin, apiUrl]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
      <section className="flex-1 flex flex-col min-h-0 p-4 lg:p-6 gap-4 bg-canvas">
        <div className="flex-1 relative overflow-hidden bg-navy-deep flex items-center justify-center group min-h-[200px]">
          {cameras.length > 1 && (
            <select
              value={selectedCameraId || ''}
              onChange={(e) => {
                setSelectedCameraId(e.target.value);
                streamRef.current?.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
                setVideoReady(false);
              }}
              className="absolute top-4 right-4 z-20 text-xs text-text-on-navy bg-navy-deep/80 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 max-w-[200px] outline-none cursor-pointer"
              aria-label="Seleccionar cámara"
            >
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label || `Cámara ${cameras.indexOf(cam) + 1}`}
                </option>
              ))}
            </select>
          )}
          {isCameraOn ? (
            <>
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover -scale-x-100"
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  if (e.currentTarget.videoWidth > 0) setVideoReady(true);
                }}
              />
              {showHandLandmarks && (
                <canvas
                  ref={overlayRef}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none z-[5] -scale-x-100 will-change-transform"
                  aria-hidden
                />
              )}
              {handTrackerStatusLabel && (
                <div className="absolute bottom-20 left-4 z-10 flex items-center gap-2 px-2 py-1 text-xs font-mono uppercase tracking-wider text-text-muted-on-navy">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-white/30" />
                  {handTrackerStatusLabel}
                </div>
              )}
              <div className="absolute top-4 left-4 flex items-center gap-2 text-text-on-navy text-xs font-mono uppercase tracking-widest z-10">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                Rec
              </div>

              {showDebugOverlay && (
                <div className="absolute top-16 right-4 text-text-on-navy text-xs font-mono uppercase tracking-widest z-10 text-right max-w-[50%]">
                  <div>Umbral {confidenceThreshold}%</div>
                  <div>Manos: {handsDetected ? 'sí' : 'no'}</div>
                  <div>
                    Overlay:{' '}
                    {localHandsEnabled
                      ? handTrackerStatus.phase === 'ready'
                        ? `navegador ${handTrackerStatus.delegate ?? '—'}`
                        : handTrackerStatus.phase
                      : 'backend (lento)'}
                  </div>
                  <div>Señas API: ~{Math.round(1000 / frameIntervalMs)} fps</div>
                  <div>API: {backendStatus?.status ?? '—'}</div>
                  <div>Modelo LSTM: {backendStatus?.model_loaded ? 'sí' : 'no'}</div>
                  <div>GPU servidor: {(backendStatus?.gpu_devices?.length ?? 0) > 0 ? 'sí' : 'no (CPU)'}</div>
                </div>
              )}

              <div className="absolute top-12 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => (useWebSocket ? sendFrameOverWs() : sendFrameHttp())}
                  className="text-text-on-navy p-2 hover:bg-white/10 transition-colors"
                  aria-label="Enviar frame al backend"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-navy-deep to-transparent pointer-events-none" />
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 text-text-muted-on-navy px-6 text-center">
              <VideoOff className="w-16 h-16 opacity-50" />
              <p className="font-medium">{cameraError || 'Cámara apagada'}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 py-2">
          <button
            type="button"
            onClick={() => setIsCameraOn(!isCameraOn)}
            className={`p-4 rounded-full transition-colors ${
              isCameraOn
                ? 'bg-navy text-text-on-navy hover:bg-navy-muted'
                : 'text-red-600 ring-2 ring-red-200 bg-surface'
            }`}
            aria-label={isCameraOn ? 'Apagar cámara' : 'Encender cámara'}
          >
            {isCameraOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>

          <button
            type="button"
            onClick={async () => {
              if (ttsPlaying) return;
              const text = displayText.replace(' · ', ' ').split('(')[0].trim();
              if (!text || text === 'Realiza una seña frente a la cámara' || text === 'Detectando seña…') return;
              setTtsPlaying(true);
              try {
                const data = await fetchTts(text);
                const binary = atob(data.audio);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                audioCtx.decodeAudioData(bytes.buffer, (buffer) => {
                  const source = audioCtx.createBufferSource();
                  source.buffer = buffer;
                  source.connect(audioCtx.destination);
                  source.onended = () => { setTtsPlaying(false); audioCtx.close(); };
                  source.start();
                }, () => setTtsPlaying(false));
              } catch {
                setTtsPlaying(false);
              }
            }}
            className={`p-4 rounded-full transition-colors ${
              isMicOn || ttsPlaying
                ? 'bg-navy text-text-on-navy hover:bg-navy-muted'
                : 'bg-canvas-muted text-text-secondary hover:text-text'
            }`}
            aria-label={isMicOn ? 'Apagar micrófono' : 'Reproducir texto detectado'}
          >
            {isMicOn || ttsPlaying ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          {user?.isAdmin && (
            <div className="relative">
              {trainStatus?.running ? (
                <div className="flex items-center gap-2 text-xs text-navy font-medium px-3 py-2 bg-navy/5 rounded-lg">
                  <span className="w-2 h-2 bg-navy rounded-full animate-pulse" />
                  Entrenando…
                </div>
              ) : (
                <button type="button" onClick={startTraining}
                  className="text-xs font-medium text-text-on-navy bg-navy hover:bg-navy-muted px-3 py-2 rounded-lg transition-colors whitespace-nowrap">
                  Entrenar
                </button>
              )}
              {trainingLog.length > 0 && !trainStatus?.running && (
                <div className="absolute bottom-full right-0 mb-2 z-20 w-80 max-h-48 overflow-y-auto bg-surface border border-canvas-muted rounded-xl shadow-lg p-3">
                  <pre className="text-[11px] text-text-secondary font-mono whitespace-pre-wrap">
                    {trainingLog.map((l, i) => <div key={i}>{l}</div>)}
                  </pre>
                  <button type="button" onClick={() => setTrainingLog([])}
                    className="mt-2 text-xs text-text-secondary hover:text-text underline">
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="w-full lg:w-[22rem] flex flex-col shrink-0 border-t lg:border-t-0 lg:border-l border-canvas-muted bg-surface min-h-0">
        <section className="flex-1 flex flex-col min-h-0 px-6 py-5 overflow-y-auto">
          <div className="flex items-baseline justify-between gap-4 pb-4 border-b border-canvas-muted shrink-0">
            <h2 className="text-lg font-semibold text-text">Traducción</h2>
            <span className="text-xs font-mono uppercase tracking-widest text-navy">Live</span>
          </div>

          <div className="flex-1 flex flex-col pt-6 min-h-0">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">
              Texto detectado
            </p>
            <p className="text-2xl text-text font-medium leading-relaxed break-words">
              {displayText}
              {isCameraOn && backendStatus?.status === 'ok' && (
                <span className="inline-block w-0.5 h-7 ml-1 bg-navy animate-pulse align-middle" />
              )}
            </p>
            <div className="mt-auto" />
            {lastRejected && (
              <p className="text-xs text-amber-700 mt-3 leading-relaxed">{lastRejected}</p>
            )}
            {apiMessage && (
              <p className="text-xs text-text-secondary mt-3 leading-relaxed">{apiMessage}</p>
            )}
            {isCameraOn && backendStatus?.model_loaded && (
              <p className="text-xs text-text-secondary mt-3 leading-relaxed">
                Reconoce 14 señas (HOLA, gracias…). En LSP importan manos y expresiones faciales:
                haz la seña completa y baja las manos para confirmar.
              </p>
            )}
            {backendStatus?.status !== 'ok' && (
              <p className="text-xs text-red-600 mt-3">
                Inicia el backend: uvicorn app.main:app --reload (puerto 8000)
              </p>
            )}
            {orientations.length > 0 && (
              <div className="mt-4 p-4 bg-navy/5 border border-navy/15 rounded-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy mb-2">
                  Agente Prolog — Orientacion
                </p>
                {orientations.map((o, i) => (
                  <div key={i} className="mb-2 last:mb-0">
                    <p className="text-xs font-semibold text-navy uppercase tracking-wide">{o.area.replace(/_/g, ' ')}</p>
                    <p className="text-sm text-text leading-relaxed mt-0.5">{o.message}</p>
                  </div>
                ))}
              </div>
            )}
            {decisionReasoning && showDebugOverlay && (
              <p className="text-[10px] text-text-secondary/60 mt-3 font-mono leading-relaxed">
                {decisionReasoning}
              </p>
            )}
          </div>
        </section>

        <section className="shrink-0 px-6 py-5 border-t border-canvas-muted max-h-[40vh] overflow-y-auto">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-4">
            Palabras detectadas (confianza)
          </h3>
          {filteredWords.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {filteredWords.map(({ word, confidence }, index) => (
                <li
                  key={`${word}-${index}`}
                  className="flex items-baseline justify-between gap-4 text-sm border-b border-canvas-muted/80 pb-2 last:border-0"
                >
                  <span className="font-medium text-text">{word}</span>
                  <span className="tabular-nums text-text-secondary">{confidence}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary">
              {backendStatus?.model_loaded
                ? `Ninguna palabra supera el umbral (${confidenceThreshold}%).`
                : 'Carga actions_15.keras en data/models/ para activar predicciones.'}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

function SettingsView({ settings, onChange, backendStatus }) {
  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="px-6 py-8">
        <p className="text-text-secondary text-sm mb-8 leading-relaxed">
          Ajusta el comportamiento de la detección y del idioma. Los cambios se guardan automáticamente
          en este navegador.
        </p>

        <div className="bg-surface border-y border-canvas-muted divide-y divide-canvas-muted">
          <SettingRow label="WebSocket en vivo" hint="Menor latencia que HTTP por frame">
            <Toggle
              checked={settings.useWebSocket}
              onChange={(v) => onChange('useWebSocket', v)}
              label="Usar WebSocket /ws/detect"
            />
          </SettingRow>

          <SettingRow
            label="Lenguaje de señas"
            hint="Usado en detección y traducción"
          >
            <select
              value={settings.signLanguage}
              onChange={(e) => onChange('signLanguage', e.target.value)}
              className="w-full max-w-md text-sm text-text bg-canvas border-b-2 border-canvas-muted focus:border-navy outline-none py-2"
            >
              {SIGN_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            label="Umbral de confianza"
            hint={`Solo se listan palabras con al menos ${settings.confidenceThreshold}%`}
          >
            <div className="flex items-center gap-4 max-w-md">
              <input
                type="range"
                min={50}
                max={99}
                value={settings.confidenceThreshold}
                onChange={(e) => onChange('confidenceThreshold', Number(e.target.value))}
                className="flex-1 accent-navy"
              />
              <span className="text-sm font-medium tabular-nums text-navy w-10 text-right">
                {settings.confidenceThreshold}%
              </span>
            </div>
          </SettingRow>

          <SettingRow label="Iniciar cámara al abrir detección" hint="Activa el feed al entrar al panel principal">
            <Toggle
              checked={settings.autoStartCamera}
              onChange={(v) => onChange('autoStartCamera', v)}
              label="Iniciar cámara automáticamente"
            />
          </SettingRow>

          <SettingRow label="Superposición de depuración" hint="Muestra datos técnicos sobre el video">
            <Toggle
              checked={settings.showDebugOverlay}
              onChange={(v) => onChange('showDebugOverlay', v)}
              label="Mostrar overlay de debug"
            />
          </SettingRow>

          <SettingRow
            label="Puntos en las manos"
            hint="Malla de puntos en cara (~478) y manos (21 c/u) vía GPU del navegador"
          >
            <Toggle
              checked={settings.showHandLandmarks}
              onChange={(v) => onChange('showHandLandmarks', v)}
              label="Mostrar puntos de detección"
            />
          </SettingRow>

          <SettingRow
            label="Rastreo rápido en navegador"
            hint="Recomendado: manos a 60 fps locales; el servidor solo clasifica la seña (más lento)"
          >
            <Toggle
              checked={settings.useLocalHandTracking}
              onChange={(v) => onChange('useLocalHandTracking', v)}
              label="Usar GPU/CPU del navegador para manos"
            />
          </SettingRow>
        </div>

        <p className="mt-6 text-xs text-text-secondary">
          ¿Necesitas volver a traducir? Usa <strong className="font-medium text-text">Detección</strong> en
          el menú lateral.
        </p>
      </div>
    </div>
  );
}

function LanguagesView({ selectedId, onSelect }) {
  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-6 py-8">
      <p className="text-text-secondary text-sm mb-6">
        Elige el lenguaje de señas que quieres usar. La selección se sincroniza con Configuración.
      </p>
      <ul className="border-y border-canvas-muted bg-surface divide-y divide-canvas-muted">
        {SIGN_LANGUAGES.map((lang) => (
          <li key={lang.id}>
            <button
              type="button"
              onClick={() => onSelect(lang.id)}
              className={`w-full text-left px-5 py-4 flex items-center justify-between gap-4 transition-colors ${
                selectedId === lang.id
                  ? 'bg-canvas text-navy font-semibold border-l-[3px] border-navy'
                  : 'text-text hover:bg-canvas border-l-[3px] border-transparent'
              }`}
            >
              <span>{lang.label}</span>
              {selectedId === lang.id && (
                <span className="text-xs uppercase tracking-widest text-text-secondary">Activo</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryView({ apiUrl }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHistory(apiUrl);
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const openSession = async (sessionId) => {
    try {
      const data = await fetchSessionDetail(sessionId, apiUrl);
      setSelectedSession(data.session);
      setPredictions(data.predictions || []);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <p className="text-text-secondary">Cargando historial…</p>
      </div>
    );
  }

  if (selectedSession) {
    return (
      <div className="flex-1 overflow-y-auto bg-canvas px-6 py-8">
        <button
          type="button"
          onClick={() => { setSelectedSession(null); setPredictions([]); }}
          className="text-sm font-medium text-navy border-b-2 border-navy pb-0.5 mb-6"
        >
          ← Volver al historial
        </button>
        <h2 className="text-lg font-semibold text-text mb-1">
          Sesión {selectedSession.session_id.slice(0, 8)}…
        </h2>
        <p className="text-xs text-text-secondary mb-6">
          {new Date(selectedSession.created_at).toLocaleString()} · {predictions.length} predicciones
        </p>
        {predictions.length === 0 ? (
          <p className="text-text-secondary text-sm">Sin predicciones en esta sesión.</p>
        ) : (
          <ul className="border-y border-canvas-muted bg-surface divide-y divide-canvas-muted">
            {predictions.map((p) => (
              <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <span className="font-medium text-text">{p.label || p.word}</span>
                  {p.confidence != null && (
                    <span className="ml-2 text-xs text-text-secondary">{p.confidence}%</span>
                  )}
                </div>
                <span className="text-xs text-text-secondary">
                  {new Date(p.created_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-6 py-8">
      <p className="text-text-secondary text-sm mb-6">
        Sesiones de traducción guardadas en la base de datos.
      </p>
      {error && (
        <p className="text-red-600 text-sm mb-4">{error}</p>
      )}
      {sessions.length === 0 ? (
        <p className="text-text-secondary text-sm">
          No hay sesiones guardadas. Traduce algunas señas y vuelve aquí.
        </p>
      ) : (
        <ul className="border-y border-canvas-muted bg-surface divide-y divide-canvas-muted">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => openSession(s.session_id)}
                className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-canvas transition-colors"
              >
                <div>
                  <span className="font-medium text-text block">
                    {s.session_id.slice(0, 12)}…
                  </span>
                  <span className="text-xs text-text-secondary">
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </div>
                <span className="text-xs text-text-secondary">
                  {s.prediction_count} predicciones
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PhrasesView({ apiUrl, onTts }) {
  const [phrases, setPhrases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState({});
  const [activeCategory, setActiveCategory] = useState(null);

  useEffect(() => {
    fetchPhrases(apiUrl).then((data) => {
      const items = data.phrases || [];
      setPhrases(items);
      const cats = {};
      items.forEach((p) => {
        if (!cats[p.category]) cats[p.category] = [];
        cats[p.category].push(p);
      });
      setCategories(cats);
      const keys = Object.keys(cats);
      if (keys.length > 0) setActiveCategory(keys[0]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [apiUrl]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <p className="text-text-secondary">Cargando frases…</p>
      </div>
    );
  }

  const categoryLabels = {
    saludo: 'Saludos',
    cortesia: 'Cortesía',
    pregunta: 'Preguntas',
    estado: 'Estados',
    afirmacion: 'Afirmaciones',
    negacion: 'Negaciones',
    necesidad: 'Necesidades',
    expresion: 'Expresiones',
    celebracion: 'Celebraciones',
  };

  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-6 py-8">
      <p className="text-text-secondary text-sm mb-6">
        Toca una frase para escucharla con texto a voz.
      </p>
      <div className="flex gap-2 flex-wrap mb-6">
        {Object.keys(categories).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              activeCategory === cat
                ? 'bg-navy text-text-on-navy'
                : 'bg-surface text-text-secondary border border-canvas-muted hover:bg-canvas-muted'
            }`}
          >
            {categoryLabels[cat] || cat}
          </button>
        ))}
      </div>
      {activeCategory && categories[activeCategory] && (
        <ul className="border-y border-canvas-muted bg-surface divide-y divide-canvas-muted">
          {categories[activeCategory].map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onTts(p.text)}
                className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-canvas transition-colors"
              >
                <span className="font-medium text-text">{p.text}</span>
                <Mic className="w-4 h-4 text-text-secondary shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VocabularioView({ apiUrl }) {
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLabels(apiUrl).then((data) => {
      setLabels(data.labels || []);
    }).catch((err) => {
      setError(err.message);
    }).finally(() => setLoading(false));
  }, [apiUrl]);

  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-6 py-8">
      <p className="text-text-secondary text-sm mb-6">
        Palabras que el sistema reconoce actualmente ({labels.length} señas).
      </p>
      {loading ? (
        <p className="text-text-secondary text-sm">Cargando vocabulario…</p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : (
        <div className="border-y border-canvas-muted bg-surface divide-y divide-canvas-muted">
          {labels.map((item) => (
            <div key={item.id} className="px-5 py-4 flex items-center justify-between gap-4">
              <span className="font-medium text-text">{item.label}</span>
              <span className="text-xs font-mono text-text-secondary">{item.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceholderView({ title, description }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-canvas px-6 text-center">
      <h2 className="text-xl font-semibold text-text mb-2">{title}</h2>
      <p className="text-text-secondary text-sm max-w-md leading-relaxed">{description}</p>
    </div>
  );
}

function LoginView({ apiUrl, onLoginSuccess, onBack }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex min-h-0">
      {/* Panel de marca */}
      <div className="hidden lg:flex w-[42%] bg-navy relative overflow-hidden flex-col justify-between p-12 xl:p-16">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 80%, white 1px, transparent 1px)',
            backgroundSize: '48px 48px, 72px 72px',
          }}
        />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="relative z-10">
          <div className="text-text-on-navy font-bold text-2xl tracking-tight">SignAI</div>
          <div className="text-text-muted-on-navy text-[11px] font-semibold uppercase tracking-[0.22em] mt-1.5">
            Lengua de Señas Peruana
          </div>
        </div>

        <div className="relative z-10 max-w-sm">
          <h2 className="text-text-on-navy text-3xl xl:text-4xl font-bold leading-[1.15] tracking-tight">
            Traducción de señas en tiempo real
          </h2>
          <p className="text-text-muted-on-navy text-sm leading-relaxed mt-5">
            Plataforma de reconocimiento automático basada en visión por computadora
            y modelos de secuencia, diseñada para la comunidad sorda del Perú.
          </p>

          <div className="mt-10 space-y-4">
            {[
              'Gestión del vocabulario de señas',
              'Captura y entrenamiento de muestras',
              'Monitoreo de sesiones de traducción',
            ].map((item) => (
              <div key={item} className="flex items-baseline gap-3">
                <span className="w-1 h-1 rounded-full bg-text-muted-on-navy/50 shrink-0 translate-y-[-2px]" />
                <span className="text-text-on-navy/75 text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Panel de formulario */}
      <div className="flex-1 flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-text-secondary hover:text-navy transition-colors mb-8"
          >
            ← Volver
          </button>

          <div className="lg:hidden mb-10">
            <div className="font-bold text-text text-xl tracking-tight">SignAI</div>
            <div className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.22em] mt-1">
              Lengua de Señas Peruana
            </div>
          </div>

          <div className="mb-10">
            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-[0.18em] mb-3">
              Acceso restringido
            </p>
            <h1 className="text-2xl font-bold text-text tracking-tight">
              Panel de administración
            </h1>
            <p className="text-sm text-text-secondary mt-3 leading-relaxed">
              Ingresa tus credenciales para gestionar el vocabulario, capturar muestras
              y entrenar el modelo de reconocimiento.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-[0.14em] block mb-2">
                Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full text-sm text-text bg-canvas border border-canvas-muted rounded-xl px-4 py-3.5 focus:border-navy focus:bg-surface outline-none transition-colors"
                placeholder="admin"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-[0.14em] block mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm text-text bg-canvas border border-canvas-muted rounded-xl px-4 py-3.5 focus:border-navy focus:bg-surface outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !username || !password}
              className="w-full text-sm font-semibold text-text-on-navy bg-navy hover:bg-navy-muted disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3.5 rounded-xl transition-colors"
            >
              {busy ? 'Verificando…' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="mt-10 text-center text-[11px] text-text-secondary/40 tracking-wide">
            SignAI · Reconocimiento de LSP
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, hint, children }) {
  return (
    <div className="px-5 py-5 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-8">
      <div className="sm:w-48 shrink-0">
        <p className="font-medium text-text text-sm">{label}</p>
        {hint && <p className="text-xs text-text-secondary mt-1">{hint}</p>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-navy' : 'bg-canvas-muted'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center lg:px-4 py-3 lg:py-2.5 transition-colors border-l-4 lg:border-l-[3px] ${
        active
          ? 'border-white bg-white/10 text-text-on-navy'
          : 'border-transparent text-text-muted-on-navy hover:text-text-on-navy hover:bg-white/5'
      }`}
    >
      <div className="flex items-center justify-center w-5 h-5 shrink-0 mx-auto lg:mx-0">{icon}</div>
      <span className="ml-3 hidden lg:block font-medium text-left whitespace-nowrap">{label}</span>
    </button>
  );
}

function App() {
  const apiUrl = getApiBaseUrl();
  return (
    <AuthProvider apiUrl={apiUrl}>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
