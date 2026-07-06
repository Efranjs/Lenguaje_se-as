import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminAddWord, fetchAdminDeleteWord, fetchAdminListWords, fetchCaptureSamples, fetchCaptureSave, fetchLabels, fetchTrainStart, fetchTrainStatus } from '../api/lspClient';

export default function AdminPanel({ apiUrl }) {
  // Train
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  // Capture
  const [words, setWords] = useState([]);
  const [selectedWord, setSelectedWord] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [samples, setSamples] = useState([]);
  const [captureMsg, setCaptureMsg] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const framesRef = useRef([]);
  const [camReady, setCamReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Add word
  const [showAddWord, setShowAddWord] = useState(false);
  const [newWordId, setNewWordId] = useState('');
  const [newWordDisplay, setNewWordDisplay] = useState('');
  const [addWordMsg, setAddWordMsg] = useState(null);
  const [addWordBusy, setAddWordBusy] = useState(false);

  useEffect(() => {
    fetchLabels(apiUrl).then(d => {
      setWords(d.labels || []);
      if (d.labels?.length && !selectedWord) setSelectedWord(d.labels[0].id);
    }).catch(() => {});
  }, [apiUrl, selectedWord]);

  const refreshWords = useCallback(async () => {
    const d = await fetchAdminListWords(apiUrl);
    setWords(d.words || []);
    return d.words || [];
  }, [apiUrl]);

  // Poll train status
  const pollStatus = useCallback(async () => {
    try {
      const data = await fetchTrainStatus(apiUrl);
      setStatus(data);
      if (data.message) {
        setLogs(prev => {
          const lines = data.message.split('\n');
          return prev.length === lines.length ? prev : lines;
        });
      }
      return data.running;
    } catch { return false; }
  }, [apiUrl]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const running = await pollStatus();
      if (!running) clearInterval(interval);
    }, 2000);
    pollStatus();
    return () => clearInterval(interval);
  }, [pollStatus]);

  const handleStart = async () => {
    setError(null); setLogs([]);
    try {
      const data = await fetchTrainStart(apiUrl);
      setStatus(data);
      setLogs(['Entrenamiento iniciado...']);
    } catch (err) { setError(err.message); }
  };

  const isRunning = status?.running;

  // Camera
  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCamReady(true);
      }
    } catch { setCaptureMsg('Error al abrir cámara'); }
  };

  const stopCam = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamReady(false);
    setRecording(false);
    setPreviewUrl(null);
  };

  useEffect(() => {
    if (capturing) { startCam(); } else { stopCam(); }
    return () => stopCam();
  }, [capturing]);

  const record = () => {
    if (!camReady || recording) return;
    framesRef.current = [];
    setFrameCount(0);
    setRecording(true);
    setPreviewUrl(null);
    recorderRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      framesRef.current.push(c.toDataURL('image/jpeg', 0.7).split(',')[1]);
      setFrameCount(framesRef.current.length);
    }, 100);
    setTimeout(() => stopRecord(), 5000);
  };

  const stopRecord = async () => {
    setRecording(false);
    clearInterval(recorderRef.current);
    recorderRef.current = null;
    const fr = framesRef.current;
    if (fr.length < 5) {
      setCaptureMsg('Muy pocos frames capturados (mín. 5)');
      framesRef.current = [];
      return;
    }
    setCaptureMsg(`Enviando ${fr.length} frames...`);
    try {
      const r = await fetchCaptureSave(selectedWord, fr, apiUrl);
      setCaptureMsg(`Muestra guardada: ${r.frames_saved} frames`);
      setPreviewUrl(`data:image/jpeg;base64,${fr[0]}`);
      framesRef.current = [];
      loadSamples();
    } catch (err) {
      setCaptureMsg(`Error: ${err.message}`);
    }
  };

  const loadSamples = useCallback(async () => {
    if (!selectedWord) return;
    const d = await fetchCaptureSamples(selectedWord, apiUrl);
    setSamples(d.samples || []);
  }, [selectedWord, apiUrl]);

  useEffect(() => { loadSamples(); }, [loadSamples]);

  // Add word
  const handleAddWord = async () => {
    const id = newWordId.trim().toLowerCase().replace(/\s+/g, '_');
    const display = newWordDisplay.trim().toUpperCase() || id;
    if (!id) { setAddWordMsg('Ingresá un nombre'); return; }
    setAddWordBusy(true);
    setAddWordMsg(null);
    try {
      await fetchAdminAddWord(id, display, apiUrl);
      setAddWordMsg(`Palabra "${display}" agregada`);
      setNewWordId('');
      setNewWordDisplay('');
      setShowAddWord(false);
      const updated = await refreshWords();
      if (updated.length) setSelectedWord(id);
    } catch (err) {
      setAddWordMsg(`Error: ${err.message}`);
    } finally {
      setAddWordBusy(false);
    }
  };

  const handleDeleteWord = async (wordId) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la seña "${wordId}"? Esto borrará todas sus muestras y archivos de datos.`)) {
      return;
    }
    setAddWordBusy(true);
    setAddWordMsg(null);
    try {
      await fetchAdminDeleteWord(wordId, apiUrl);
      setAddWordMsg(`Palabra "${wordId}" eliminada`);
      const updated = await refreshWords();
      if (updated.length) {
        setSelectedWord(updated[0].id);
      } else {
        setSelectedWord('');
      }
    } catch (err) {
      setAddWordMsg(`Error: ${err.message}`);
    } finally {
      setAddWordBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-canvas px-6 py-8">
      <div>
        <div className="flex items-center justify-between mb-6">
          <button type="button" onClick={() => setCapturing(!capturing)}
            className={`text-sm px-3 py-1.5 border rounded ${capturing ? 'bg-red-50 text-red-600 border-red-200' : 'text-text-secondary border-canvas-muted hover:text-text'}`}>
            {capturing ? 'Cerrar cámara' : 'Capturar muestras'}
          </button>
        </div>

        {/* Step 1: Add word */}
        <div className="bg-surface border border-canvas-muted rounded-xl p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text">1. Agregar palabra</h3>
            <button type="button" onClick={() => setShowAddWord(!showAddWord)}
              className="text-sm text-navy font-medium hover:underline">
              {showAddWord ? 'Cancelar' : '+ Nueva'}
            </button>
          </div>
          {showAddWord && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <input type="text" value={newWordId} onChange={e => setNewWordId(e.target.value)}
                  placeholder="Identificador (ej: hola_mundo)"
                  className="flex-1 text-sm text-text bg-canvas border border-canvas-muted rounded-lg px-3 py-2 outline-none focus:border-navy" />
                <input type="text" value={newWordDisplay} onChange={e => setNewWordDisplay(e.target.value)}
                  placeholder="Nombre visible (ej: HOLA MUNDO)"
                  className="flex-1 text-sm text-text bg-canvas border border-canvas-muted rounded-lg px-3 py-2 outline-none focus:border-navy" />
              </div>
              {addWordMsg && (
                <p className={`text-sm ${addWordMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{addWordMsg}</p>
              )}
              <button type="button" onClick={handleAddWord} disabled={addWordBusy || !newWordId.trim()}
                className="text-sm font-medium text-text-on-navy bg-navy hover:bg-navy-muted disabled:opacity-50 px-4 py-2 rounded-lg w-fit transition-colors">
                {addWordBusy ? 'Agregando…' : 'Agregar palabra'}
              </button>
            </div>
          )}
          <p className="text-xs text-text-secondary mt-2">Palabras disponibles: {words.length}</p>
          {words.length > 0 && (
            <div className="mt-4 border-t border-canvas-muted pt-4">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Eliminar señas</h4>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {words.map((w) => (
                  <div key={w.id} className="flex items-center gap-2 bg-canvas border border-canvas-muted rounded-lg pl-3 pr-2 py-1 text-xs">
                    <span className="text-text font-medium">{w.label}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteWord(w.id)}
                      className="text-red-500 hover:text-red-700 font-bold hover:bg-red-50 rounded px-1.5 py-0.5 ml-1"
                      title={`Eliminar ${w.label}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Capture */}
        <div className="bg-surface border border-canvas-muted rounded-xl p-6 mb-4">
          <h3 className="font-semibold text-text mb-3">2. Capturar muestras</h3>
          <div className="flex gap-3 mb-4">
            <select value={selectedWord} onChange={e => setSelectedWord(e.target.value)}
              className="flex-1 text-sm text-text bg-canvas border border-canvas-muted rounded-lg px-3 py-2 outline-none">
              {words.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
            {capturing && (
              <button type="button" onClick={record} disabled={!camReady || recording}
                className="text-sm font-medium text-text-on-navy bg-navy hover:bg-navy-muted disabled:opacity-50 px-4 py-2 rounded-lg transition-colors">
                {recording ? 'Grabando…' : 'Grabar (5s)'}
              </button>
            )}
          </div>

          {capturing && (
            <>
              <div className="relative bg-black rounded-lg overflow-hidden mb-3" style={{ aspectRatio: '4/3' }}>
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                {!camReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
                    Abriendo cámara…
                  </div>
                )}
                {recording && (
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    GRABANDO · {frameCount} frames
                  </div>
                )}
              </div>

              {captureMsg && (
                <p className={`text-sm mb-2 ${captureMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {captureMsg}
                </p>
              )}

              {previewUrl && (
                <div className="flex gap-2 mb-3">
                  <img src={previewUrl} alt="preview" className="w-16 h-12 object-cover rounded border border-canvas-muted" />
                  <span className="text-xs text-text-secondary self-center">Último frame capturado</span>
                </div>
              )}

              {samples.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">
                    Muestras capturadas ({samples.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {samples.map(s => (
                      <div key={s.name} className="text-xs bg-canvas border border-canvas-muted rounded px-3 py-1.5 text-text-secondary">
                        {s.frames} frames
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Step 3: Train */}
        <div className="bg-surface border border-canvas-muted rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-text mb-2">3. Entrenar modelo</h3>
          <p className="text-sm text-text-secondary mb-4">
            Normaliza las muestras, extrae keypoints y entrena el Transformer.
            El backend se reinicia automáticamente al terminar.
          </p>
          {error && (
            <p className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg">{error}</p>
          )}
          <button type="button" onClick={handleStart} disabled={isRunning}
            className="text-sm font-medium text-text-on-navy bg-navy hover:bg-navy-muted disabled:opacity-50 px-5 py-2.5 rounded-lg transition-colors">
            {isRunning ? 'Entrenando…' : 'Iniciar entrenamiento'}
          </button>
          {isRunning && (
            <div className="mt-4 flex items-center gap-2 text-sm text-navy">
              <span className="w-2 h-2 bg-navy rounded-full animate-pulse" />
              Pipeline en ejecución...
            </div>
          )}
        </div>

        {/* Logs */}
        {logs.length > 0 && (
          <div className="bg-surface border border-canvas-muted rounded-xl p-4">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">Logs</h4>
            <pre className="text-xs text-text-secondary font-mono max-h-80 overflow-y-auto whitespace-pre-wrap">
              {logs.map((line, i) => <div key={i}>{line}</div>)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
