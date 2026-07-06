import { useEffect, useRef, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { handLandmarksFromDetector } from '../utils/handLandmarksFromDetector';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
/** La cara es costosa (~478 puntos); no hace falta en cada frame de cámara. */
const FACE_DETECT_EVERY_N_FRAMES = 3;

/**
 * Manos + cara en el navegador (WebGL/GPU si está disponible).
 */
export function useBrowserHandTracking({ enabled, videoRef, videoReady, onLandmarks, onStatus }) {
  const handRef = useRef(null);
  const faceRef = useRef(null);
  const rafRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const videoFrameCountRef = useRef(0);
  const lastFaceLandmarksRef = useRef([]);
  const inferBusyRef = useRef(false);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopLoop();
      handRef.current?.close();
      faceRef.current?.close();
      handRef.current = null;
      faceRef.current = null;
      return undefined;
    }

    let cancelled = false;

    async function init() {
      onStatus?.({ phase: 'loading' });
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

        const createWithDelegate = async (delegate) => {
          const hand = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.45,
            minHandPresenceConfidence: 0.45,
            minTrackingConfidence: 0.45,
          });
          const face = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL, delegate },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.45,
            minFacePresenceConfidence: 0.45,
            minTrackingConfidence: 0.45,
          });
          return { hand, face };
        };

        let models;
        let delegate = 'GPU';
        try {
          models = await createWithDelegate('GPU');
        } catch {
          delegate = 'CPU';
          models = await createWithDelegate('CPU');
        }

        if (cancelled) {
          models.hand.close();
          models.face.close();
          return;
        }

        handRef.current = models.hand;
        faceRef.current = models.face;
        onStatus?.({ phase: 'ready', delegate });
      } catch (err) {
        onStatus?.({ phase: 'error', message: err?.message ?? String(err) });
      }
    }

    init();

    return () => {
      cancelled = true;
      stopLoop();
      handRef.current?.close();
      faceRef.current?.close();
      handRef.current = null;
      faceRef.current = null;
      videoFrameCountRef.current = 0;
      lastFaceLandmarksRef.current = [];
      inferBusyRef.current = false;
    };
  }, [enabled, onStatus, stopLoop]);

  useEffect(() => {
    if (!enabled || !videoReady) {
      stopLoop();
      return undefined;
    }

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const video = videoRef.current;
      const handLm = handRef.current;
      const faceLm = faceRef.current;
      if (!video || !handLm || !faceLm || video.videoWidth === 0) {
        return;
      }
      if (video.currentTime === lastVideoTimeRef.current) {
        return;
      }
      if (inferBusyRef.current) {
        return;
      }
      lastVideoTimeRef.current = video.currentTime;
      videoFrameCountRef.current += 1;

      inferBusyRef.current = true;
      try {
        const t = performance.now();
        const handResult = handLm.detectForVideo(video, t);
        const runFace =
          videoFrameCountRef.current % FACE_DETECT_EVERY_N_FRAMES === 0;
        let faceLandmarks = lastFaceLandmarksRef.current;
        if (runFace) {
          const faceResult = faceLm.detectForVideo(video, t + 0.001);
          faceLandmarks = faceResult.faceLandmarks?.[0] ?? [];
          lastFaceLandmarksRef.current = faceLandmarks;
        }
        const landmarks = handLandmarksFromDetector(handResult, {
          faceLandmarks: faceLandmarks.length ? [faceLandmarks] : [],
        });
        const detected =
          (handResult.landmarks?.length ?? 0) > 0 || faceLandmarks.length > 0;
        onLandmarks?.(landmarks, detected);
      } catch {
        /* frame inválido */
      } finally {
        inferBusyRef.current = false;
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return stopLoop;
  }, [enabled, videoReady, videoRef, onLandmarks, stopLoop]);

  return { isActive: Boolean(handRef.current) };
}
