/**
 * Overlay solo con puntos (malla densa en cara + 21 puntos por mano).
 * Alineado con LSP: expresiones faciales y configuración de manos.
 */

const STYLE = {
  handDot: 'rgba(255, 255, 255, 0.82)',
  handRadius: 2.2,
  faceDot: 'rgba(255, 255, 255, 0.5)',
  faceRadius: 1.15,
};

/** Manos: más reactivas. Cara: un poco más suave (muchos puntos). */
const LERP_ALPHA_HAND = 0.88;
const LERP_ALPHA_FACE = 0.65;

function clonePoints(points) {
  return points.map((p) => ({ x: p.x, y: p.y }));
}

function lerpPoints(display, target, alpha) {
  if (!target.length) {
    return [];
  }
  if (!display.length || display.length !== target.length) {
    return clonePoints(target);
  }
  return display.map((p, i) => ({
    x: p.x + (target[i].x - p.x) * alpha,
    y: p.y + (target[i].y - p.y) * alpha,
  }));
}

function drawPointCloud(ctx, points, w, h, fillStyle, radius) {
  const px = (p) => p.x * w;
  const py = (p) => p.y * h;
  ctx.fillStyle = fillStyle;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(px(p), py(p), radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Manos + cara (478 puntos faciales), suavizado a 60 fps.
 */
export class HandOverlayRenderer {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.targetLeft = [];
    this.targetRight = [];
    this.targetFace = [];
    this.displayLeft = [];
    this.displayRight = [];
    this.displayFace = [];
    this.handsDetected = false;
    this.rafId = null;
  }

  setLandmarks(landmarks, handsDetected) {
    this.handsDetected = handsDetected;
    this.targetLeft = landmarks?.left_hand ?? [];
    this.targetRight = landmarks?.right_hand ?? [];
    this.targetFace = landmarks?.face ?? [];
  }

  start() {
    if (this.rafId != null) return;
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      this.displayLeft = lerpPoints(this.displayLeft, this.targetLeft, LERP_ALPHA_HAND);
      this.displayRight = lerpPoints(this.displayRight, this.targetRight, LERP_ALPHA_HAND);
      this.displayFace = lerpPoints(this.displayFace, this.targetFace, LERP_ALPHA_FACE);
      this.paint();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const ctx = this.canvas?.getContext('2d');
    if (ctx && this.canvas) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.displayLeft = [];
    this.displayRight = [];
    this.displayFace = [];
    this.targetLeft = [];
    this.targetRight = [];
    this.targetFace = [];
  }

  paint() {
    const { canvas, video } = this;
    if (!canvas || !video || video.videoWidth === 0) {
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    if (this.displayFace.length) {
      drawPointCloud(ctx, this.displayFace, w, h, STYLE.faceDot, STYLE.faceRadius);
    }
    if (this.displayLeft.length) {
      drawPointCloud(ctx, this.displayLeft, w, h, STYLE.handDot, STYLE.handRadius);
    }
    if (this.displayRight.length) {
      drawPointCloud(ctx, this.displayRight, w, h, STYLE.handDot, STYLE.handRadius);
    }
  }
}

/** Compatibilidad: dibujo directo sin suavizado. */
export function drawHandLandmarks(canvas, video, landmarks, handsDetected) {
  const renderer = new HandOverlayRenderer(canvas, video);
  renderer.setLandmarks(landmarks, handsDetected);
  renderer.paint();
}
