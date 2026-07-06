/**
 * Convierte salida de @mediapipe/tasks-vision al formato del overlay.
 */
export function handLandmarksFromDetector(handResult, faceResult) {
  const out = { left_hand: [], right_hand: [], face: [] };

  const hands = handResult?.landmarks;
  if (hands?.length) {
    const handednessList = handResult.handednesses ?? handResult.handedness ?? [];
    for (let i = 0; i < hands.length; i += 1) {
      const label = handLabelAt(handednessList, i);
      const points = hands[i].map((lm) => ({ x: lm.x, y: lm.y }));
      if (label === 'left') {
        out.left_hand = points;
      } else {
        out.right_hand = points;
      }
    }
  }

  const facePts = faceResult?.faceLandmarks?.[0];
  if (facePts?.length) {
    out.face = facePts.map((lm) => ({ x: lm.x, y: lm.y }));
  }

  return out;
}

function handLabelAt(handednessList, index) {
  const entry = handednessList[index];
  const cat = Array.isArray(entry) ? entry[0] : entry;
  const name = String(cat?.categoryName ?? cat?.displayName ?? '').toLowerCase();
  if (name.includes('left')) {
    return 'left';
  }
  if (name.includes('right')) {
    return 'right';
  }
  return index === 0 ? 'right' : 'left';
}
