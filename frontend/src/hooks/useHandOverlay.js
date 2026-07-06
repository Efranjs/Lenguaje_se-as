import { useEffect, useRef, useCallback } from 'react';
import { HandOverlayRenderer } from '../utils/drawHandLandmarks';

/**
 * Bucle 60 fps que suaviza landmarks entre respuestas del backend.
 */
export function useHandOverlay({ enabled, videoRef, canvasRef, videoReady }) {
  const rendererRef = useRef(null);

  useEffect(() => {
    if (!enabled || !videoReady) {
      rendererRef.current?.stop();
      rendererRef.current = null;
      return undefined;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return undefined;
    }

    const renderer = new HandOverlayRenderer(canvas, video);
    rendererRef.current = renderer;
    renderer.start();

    return () => {
      renderer.stop();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
    };
  }, [enabled, videoReady, videoRef, canvasRef]);

  const pushLandmarks = useCallback((landmarks, detected) => {
    rendererRef.current?.setLandmarks(landmarks ?? {}, detected);
  }, []);

  return { pushLandmarks };
}
