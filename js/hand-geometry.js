/**
 * Hand Geometry, Kinematics & Gesture/Activity Recognition Engine
 * Processes 21 3D hand landmarks (MediaPipe format) per hand.
 */

export const LANDMARK_NAMES = [
  'WRIST',
  'THUMB_CMC', 'THUMB_MCP', 'THUMB_IP', 'THUMB_TIP',
  'INDEX_MCP', 'INDEX_PIP', 'INDEX_DIP', 'INDEX_TIP',
  'MIDDLE_MCP', 'MIDDLE_PIP', 'MIDDLE_DIP', 'MIDDLE_TIP',
  'RING_MCP', 'RING_PIP', 'RING_DIP', 'RING_TIP',
  'PINKY_MCP', 'PINKY_PIP', 'PINKY_DIP', 'PINKY_TIP'
];

export const FINGER_CHAINS = {
  thumb:  [0, 1, 2, 3, 4],
  index:  [0, 5, 6, 7, 8],
  middle: [0, 9, 10, 11, 12],
  ring:   [0, 13, 14, 15, 16],
  pinky:  [0, 17, 18, 19, 20]
};

export const PALM_CONNECTIONS = [
  [0, 5], [5, 9], [9, 13], [13, 17], [17, 0], [0, 1], [1, 5]
];

export const ZONE_LABELS = [
  ['UL', 'UC', 'UR'],
  ['ML', 'MC', 'MR'],
  ['LL', 'LC', 'LR']
];

export const ZONE_NAMES = {
  UL: 'Upper Left', UC: 'Upper Center', UR: 'Upper Right',
  ML: 'Mid Left',   MC: 'Center Work',  MR: 'Mid Right',
  LL: 'Lower Left', LC: 'Lower Center', LR: 'Lower Right'
};

/**
 * 3D Euclidean distance between two landmarks
 */
export function dist3D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.hypot(dx, dy, dz);
}

/**
 * 2D Euclidean distance in normalized coordinates
 */
export function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Angle in degrees at vertex B formed by segments BA and BC
 */
export function angle3D(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.hypot(v1.x, v1.y, v1.z) || 1e-6;
  const mag2 = Math.hypot(v2.x, v2.y, v2.z) || 1e-6;
  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/**
 * Compute bounding box in normalized [0..1] coordinates with optional padding
 */
export function computeBoundingBox(landmarks, pad = 0.035) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  let sumX = 0, sumY = 0, sumZ = 0;

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (lm.x < minX) minX = lm.x;
    if (lm.y < minY) minY = lm.y;
    if (lm.x > maxX) maxX = lm.x;
    if (lm.y > maxY) maxY = lm.y;
    sumX += lm.x;
    sumY += lm.y;
    sumZ += (lm.z || 0);
  }

  const n = landmarks.length || 1;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(1, maxX + pad);
  maxY = Math.min(1, maxY + pad);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    area: (maxX - minX) * (maxY - minY),
    center: {
      x: sumX / n,
      y: sumY / n,
      z: sumZ / n
    }
  };
}

/**
 * Compute per-finger extension ratios [0..1] using 3D joint angles and tip-to-wrist distances.
 * 1.0 = fully straight/extended, 0.0 = tightly curled into palm.
 */
export function computeFingerExtensions(landmarks) {
  const wrist = landmarks[0];
  const palmSize = Math.max(0.05, dist3D(wrist, landmarks[9])); // Wrist to Middle MCP reference

  // Helper for 4-joint finger (MCP, PIP, DIP, TIP)
  function fingerExtension(mcpIdx, pipIdx, dipIdx, tipIdx) {
    const mcp = landmarks[mcpIdx];
    const pip = landmarks[pipIdx];
    const dip = landmarks[dipIdx];
    const tip = landmarks[tipIdx];

    // Straight finger has PIP and DIP angles near 180 deg; curled near 60-90 deg
    const pipAngle = angle3D(mcp, pip, dip);
    const dipAngle = angle3D(pip, dip, tip);
    const angleScore = Math.max(0, Math.min(1, ((pipAngle + dipAngle) / 2 - 85) / 85));

    // Tip distance from wrist vs MCP distance from wrist
    const tipWristDist = dist3D(tip, wrist);
    const mcpWristDist = dist3D(mcp, wrist);
    const distRatio = Math.max(0, Math.min(1, (tipWristDist - mcpWristDist * 0.85) / (palmSize * 0.95)));

    return Math.round((angleScore * 0.65 + distRatio * 0.35) * 100) / 100;
  }

  // Thumb extension uses CMC(1), MCP(2), IP(3), TIP(4) and distance from pinky MCP(17) / index MCP(5)
  const thumbMcpAngle = angle3D(landmarks[1], landmarks[2], landmarks[3]);
  const thumbIpAngle = angle3D(landmarks[2], landmarks[3], landmarks[4]);
  const thumbAngleScore = Math.max(0, Math.min(1, ((thumbMcpAngle + thumbIpAngle) / 2 - 115) / 55));
  const thumbPinkyDist = dist3D(landmarks[4], landmarks[17]) / (palmSize * 1.45);
  const thumbSpreadScore = Math.max(0, Math.min(1, (thumbPinkyDist - 0.55) / 0.55));
  const thumb = Math.round((thumbAngleScore * 0.45 + thumbSpreadScore * 0.55) * 100) / 100;

  const index  = fingerExtension(5, 6, 7, 8);
  const middle = fingerExtension(9, 10, 11, 12);
  const ring   = fingerExtension(13, 14, 15, 16);
  const pinky  = fingerExtension(17, 18, 19, 20);

  const openness = Math.round(((thumb + index + middle + ring + pinky) / 5) * 100);

  return {
    thumb,
    index,
    middle,
    ring,
    pinky,
    openness
  };
}

/**
 * Classify static hand gesture from 21 landmarks and finger extensions
 */
export function classifyGesture(landmarks, extensions) {
  const palmSize = Math.max(0.05, dist3D(landmarks[0], landmarks[9]));
  const pinchDistNorm = dist3D(landmarks[4], landmarks[8]) / palmSize;

  const isThumbExt  = extensions.thumb >= 0.55;
  const isIndexExt  = extensions.index >= 0.58;
  const isMiddleExt = extensions.middle >= 0.58;
  const isRingExt   = extensions.ring >= 0.55;
  const isPinkyExt  = extensions.pinky >= 0.55;

  const isIndexCurled  = extensions.index < 0.42;
  const isMiddleCurled = extensions.middle < 0.42;
  const isRingCurled   = extensions.ring < 0.42;
  const isPinkyCurled  = extensions.pinky < 0.42;

  // 1. Check Pinch / OK Sign first (Thumb tip #4 close to Index tip #8)
  if (pinchDistNorm < 0.34) {
    if (isMiddleExt && isRingExt && isPinkyExt) {
      return {
        id: 'OK_SIGN',
        name: 'OK Sign',
        icon: '👌',
        confidence: Math.min(0.99, 0.85 + (0.34 - pinchDistNorm) * 0.4),
        pinchDistNorm
      };
    }
    return {
      id: 'PINCH',
      name: 'Precision Pinch',
      icon: '🤏',
      confidence: Math.min(0.99, 0.88 + (0.34 - pinchDistNorm) * 0.35),
      pinchDistNorm
    };
  }

  // 2. Open Palm (all 5 fingers extended)
  if (isThumbExt && isIndexExt && isMiddleExt && isRingExt && isPinkyExt) {
    const avg = (extensions.thumb + extensions.index + extensions.middle + extensions.ring + extensions.pinky) / 5;
    return {
      id: 'OPEN_PALM',
      name: 'Open Palm',
      icon: '🖐️',
      confidence: Math.min(0.99, 0.75 + avg * 0.24),
      pinchDistNorm
    };
  }

  // 3. Fist / Grab (all 4 main fingers curled)
  if (isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled && !isThumbExt) {
    const curlScore = 1 - (extensions.index + extensions.middle + extensions.ring + extensions.pinky) / 4;
    return {
      id: 'FIST',
      name: 'Closed Fist / Grab',
      icon: '✊',
      confidence: Math.min(0.99, 0.78 + curlScore * 0.2),
      pinchDistNorm
    };
  }

  // 4. Thumbs Up / Thumbs Down (thumb extended, others curled)
  if (isThumbExt && isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled) {
    const thumbUpward = landmarks[4].y < landmarks[2].y - 0.03;
    const thumbDownward = landmarks[4].y > landmarks[2].y + 0.03;
    if (thumbUpward) {
      return {
        id: 'THUMBS_UP',
        name: 'Thumbs Up',
        icon: '👍',
        confidence: 0.93,
        pinchDistNorm
      };
    }
    if (thumbDownward) {
      return {
        id: 'THUMBS_DOWN',
        name: 'Thumbs Down',
        icon: '👎',
        confidence: 0.91,
        pinchDistNorm
      };
    }
  }

  // 5. Pointing (Index extended, Middle/Ring/Pinky curled)
  if (isIndexExt && isMiddleCurled && isRingCurled && isPinkyCurled) {
    return {
      id: 'POINTING',
      name: 'Index Point',
      icon: '☝️',
      confidence: Math.min(0.98, 0.8 + extensions.index * 0.18),
      pinchDistNorm
    };
  }

  // 6. Peace / Victory (Index + Middle extended, Ring + Pinky curled)
  if (isIndexExt && isMiddleExt && isRingCurled && isPinkyCurled) {
    return {
      id: 'PEACE',
      name: 'Peace / V-Sign',
      icon: '✌️',
      confidence: Math.min(0.98, 0.8 + ((extensions.index + extensions.middle) / 2) * 0.17),
      pinchDistNorm
    };
  }

  // 7. Rock / Horns (Index + Pinky extended, Middle + Ring curled)
  if (isIndexExt && isPinkyExt && isMiddleCurled && isRingCurled) {
    return {
      id: 'ROCK',
      name: 'Rock / Horns',
      icon: '🤘',
      confidence: 0.92,
      pinchDistNorm
    };
  }

  // 8. Three Fingers (Index + Middle + Ring extended, Pinky curled)
  if (isIndexExt && isMiddleExt && isRingExt && isPinkyCurled) {
    return {
      id: 'THREE_FINGERS',
      name: 'Three Fingers',
      icon: '3️⃣',
      confidence: 0.89,
      pinchDistNorm
    };
  }

  // 9. Four Fingers (Index + Middle + Ring + Pinky extended, Thumb tucked)
  if (!isThumbExt && isIndexExt && isMiddleExt && isRingExt && isPinkyExt) {
    return {
      id: 'FOUR_FINGERS',
      name: 'Four Fingers',
      icon: '4️⃣',
      confidence: 0.90,
      pinchDistNorm
    };
  }

  // Default: Neutral / Relaxed Pose
  return {
    id: 'RELAXED',
    name: 'Relaxed / Neutral',
    icon: '🤚',
    confidence: 0.82,
    pinchDistNorm
  };
}

/**
 * Determine 3x3 spatial zone from normalized (x, y) coordinates
 */
export function getSpatialZone(x, y) {
  const col = Math.max(0, Math.min(2, Math.floor(x * 3)));
  const row = Math.max(0, Math.min(2, Math.floor(y * 3)));
  const code = ZONE_LABELS[row][col];
  return {
    row,
    col,
    code,
    name: ZONE_NAMES[code]
  };
}

/**
 * Per-Hand Temporal Kinematic Tracker
 * Tracks velocity, acceleration, trajectory trail, finger oscillation, and dynamic activity state.
 */
export class HandKinematicTracker {
  constructor(handedness) {
    this.handedness = handedness; // 'Left' | 'Right'
    this.prevCenter = null;
    this.prevTimestamp = null;
    this.smoothedSpeed = 0; // normalized units per second
    this.velocityVec = { vx: 0, vy: 0 };
    this.trail = []; // Array of { x, y, speed, t }
    this.indexTrail = []; // Array of { x, y, pinched, t }
    this.opennessHistory = []; // Recent openness values for micro-motion/tapping detection
    this.currentGesture = null;
    this.gestureHoldStart = 0;
    this.totalDistanceNorm = 0;
  }

  update(landmarks, timestampMs) {
    const bbox = computeBoundingBox(landmarks);
    const extensions = computeFingerExtensions(landmarks);
    const gesture = classifyGesture(landmarks, extensions);
    const palmCenter = {
      x: (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5,
      y: (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5,
      z: (landmarks[0].z + landmarks[9].z) / 2
    };

    let instSpeed = 0;
    let dtSec = 0;

    if (this.prevCenter && this.prevTimestamp) {
      dtSec = Math.max(0.005, (timestampMs - this.prevTimestamp) / 1000);
      if (dtSec < 0.5) {
        const dx = palmCenter.x - this.prevCenter.x;
        const dy = palmCenter.y - this.prevCenter.y;
        const stepDist = Math.hypot(dx, dy);
        // Ignore microscopic sensor noise below 0.0018
        const filteredStep = stepDist > 0.0018 ? stepDist : 0;
        instSpeed = filteredStep / dtSec;
        this.totalDistanceNorm += filteredStep;

        this.velocityVec = {
          vx: this.velocityVec.vx * 0.65 + (dx / dtSec) * 0.35,
          vy: this.velocityVec.vy * 0.65 + (dy / dtSec) * 0.35
        };
        this.smoothedSpeed = this.smoothedSpeed * 0.72 + instSpeed * 0.28;
      } else {
        this.smoothedSpeed = 0;
        this.velocityVec = { vx: 0, vy: 0 };
      }
    }

    this.prevCenter = palmCenter;
    this.prevTimestamp = timestampMs;

    // Maintain palm trail (last 28 points)
    this.trail.push({
      x: palmCenter.x,
      y: palmCenter.y,
      speed: this.smoothedSpeed,
      t: timestampMs
    });
    if (this.trail.length > 28) this.trail.shift();

    // Maintain index fingertip trail (last 32 points)
    this.indexTrail.push({
      x: landmarks[8].x,
      y: landmarks[8].y,
      pinched: gesture.id === 'PINCH' || gesture.id === 'OK_SIGN',
      t: timestampMs
    });
    if (this.indexTrail.length > 32) this.indexTrail.shift();

    // Track finger openness variance for repetitive finger activity
    this.opennessHistory.push({ v: extensions.openness, i: extensions.index, t: timestampMs });
    while (this.opennessHistory.length > 20) {
      this.opennessHistory.shift();
    }

    // Track gesture hold duration
    if (!this.currentGesture || this.currentGesture !== gesture.id) {
      this.currentGesture = gesture.id;
      this.gestureHoldStart = timestampMs;
    }
    const gestureHoldSec = Math.max(0, (timestampMs - this.gestureHoldStart) / 1000);

    // Classify dynamic Hand Activity State
    const activity = this.classifyActivity(gesture, extensions, this.smoothedSpeed, gestureHoldSec);
    const zone = getSpatialZone(palmCenter.x, palmCenter.y);

    // Orientation angle (Wrist #0 to Middle MCP #9 in degrees)
    const orientationDeg = Math.round(
      (Math.atan2(landmarks[9].y - landmarks[0].y, landmarks[9].x - landmarks[0].x) * 180) / Math.PI + 90
    );

    return {
      handedness: this.handedness,
      landmarks,
      bbox,
      palmCenter,
      extensions,
      gesture,
      gestureHoldSec,
      activity,
      zone,
      speedNorm: this.smoothedSpeed,
      speedPxPerSec: Math.round(this.smoothedSpeed * 1280),
      velocityVec: this.velocityVec,
      orientationDeg,
      trail: this.trail,
      indexTrail: this.indexTrail,
      totalDistanceNorm: this.totalDistanceNorm,
      dtSec
    };
  }

  classifyActivity(gesture, extensions, speedNorm, gestureHoldSec) {
    // Compute finger articulation oscillation over recent frames
    let fingerDeltaSum = 0;
    for (let i = 1; i < this.opennessHistory.length; i++) {
      fingerDeltaSum += Math.abs(this.opennessHistory[i].i - this.opennessHistory[i - 1].i);
    }

    if (speedNorm > 0.72) {
      return {
        id: 'RAPID_TRAVERSAL',
        name: 'Rapid Swipe / Reach',
        intensity: 'HIGH',
        color: '#f59e0b'
      };
    }

    if (gesture.id === 'PINCH' || gesture.id === 'OK_SIGN') {
      if (speedNorm > 0.12) {
        return {
          id: 'PRECISION_DRAG',
          name: 'Pinch & Drag Manipulation',
          intensity: 'ACTIVE',
          color: '#00f0ff'
        };
      }
      return {
        id: 'FINE_MANIPULATION',
        name: 'Fine Pinch Hold',
        intensity: 'MODERATE',
        color: '#38bdf8'
      };
    }

    if (fingerDeltaSum > 0.85 && speedNorm < 0.45) {
      return {
        id: 'REPETITIVE_ARTICULATION',
        name: 'Finger Articulation / Tapping',
        intensity: 'ACTIVE',
        color: '#a855f7'
      };
    }

    if (speedNorm > 0.22) {
      return {
        id: 'ACTIVE_MOVEMENT',
        name: 'Spatial Hand Movement',
        intensity: 'MODERATE',
        color: '#10b981'
      };
    }

    if (gesture.id !== 'RELAXED' && gestureHoldSec >= 0.6) {
      return {
        id: 'GESTURE_HOLD',
        name: `Holding ${gesture.name}`,
        intensity: 'LOW',
        color: '#6366f1'
      };
    }

    if (speedNorm < 0.045) {
      return {
        id: 'STATIONARY',
        name: 'Stationary / Resting',
        intensity: 'IDLE',
        color: '#64748b'
      };
    }

    return {
      id: 'HOVERING',
      name: 'Poised / Hovering',
      intensity: 'LOW',
      color: '#94a3b8'
    };
  }
}

