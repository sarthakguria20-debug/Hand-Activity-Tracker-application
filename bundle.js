/**
 * Hand Activity Tracker - Standalone Self-Contained Bundle
 * Works in all environments: file:// (direct double-click), http://localhost, and GitHub Pages.
 */
(() => {
'use strict';

// --- MODULE: Hand Geometry & Kinematics ---
/**
 * Hand Geometry, Kinematics & Gesture/Activity Recognition Engine
 * Processes 21 3D hand landmarks (MediaPipe format) per hand.
 */

const LANDMARK_NAMES = [
  'WRIST',
  'THUMB_CMC', 'THUMB_MCP', 'THUMB_IP', 'THUMB_TIP',
  'INDEX_MCP', 'INDEX_PIP', 'INDEX_DIP', 'INDEX_TIP',
  'MIDDLE_MCP', 'MIDDLE_PIP', 'MIDDLE_DIP', 'MIDDLE_TIP',
  'RING_MCP', 'RING_PIP', 'RING_DIP', 'RING_TIP',
  'PINKY_MCP', 'PINKY_PIP', 'PINKY_DIP', 'PINKY_TIP'
];

const FINGER_CHAINS = {
  thumb:  [0, 1, 2, 3, 4],
  index:  [0, 5, 6, 7, 8],
  middle: [0, 9, 10, 11, 12],
  ring:   [0, 13, 14, 15, 16],
  pinky:  [0, 17, 18, 19, 20]
};

const PALM_CONNECTIONS = [
  [0, 5], [5, 9], [9, 13], [13, 17], [17, 0], [0, 1], [1, 5]
];

const ZONE_LABELS = [
  ['UL', 'UC', 'UR'],
  ['ML', 'MC', 'MR'],
  ['LL', 'LC', 'LR']
];

const ZONE_NAMES = {
  UL: 'Upper Left', UC: 'Upper Center', UR: 'Upper Right',
  ML: 'Mid Left',   MC: 'Center Work',  MR: 'Mid Right',
  LL: 'Lower Left', LC: 'Lower Center', LR: 'Lower Right'
};

/**
 * 3D Euclidean distance between two landmarks
 */
function dist3D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.hypot(dx, dy, dz);
}

/**
 * 2D Euclidean distance in normalized coordinates
 */
function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Angle in degrees at vertex B formed by segments BA and BC
 */
function angle3D(a, b, c) {
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
function computeBoundingBox(landmarks, pad = 0.035) {
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
function computeFingerExtensions(landmarks) {
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
function classifyGesture(landmarks, extensions) {
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
function getSpatialZone(x, y) {
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
class HandKinematicTracker {
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



// --- MODULE: 3D Hand Simulator ---
/**
 * Procedural 21-Point 3D Hand Skeleton Simulator
 * Generates realistic Left and Right hand landmark trajectories, finger articulation,
 * and interactive cursor-controlled hand poses for testing without or alongside a webcam.
 */

const SIMULATION_MODES = {
  DUAL_WORKFLOW: {
    id: 'DUAL_WORKFLOW',
    label: 'Dual-Hand Ergonomic Workflow',
    description: 'Left & Right hands performing coordinated spatial reaches, pinches, and gesture transitions'
  },
  GESTURE_SHOWCASE: {
    id: 'GESTURE_SHOWCASE',
    label: 'Gesture Cycle Showcase',
    description: 'Cycles through Open Palm, Pinch, Fist, Pointing, Peace, Thumbs Up, OK Sign, and Rock'
  },
  RAPID_SWIPE: {
    id: 'RAPID_SWIPE',
    label: 'High-Velocity Zone Traversal',
    description: 'Fast multi-zone sweeps across all 9 spatial sectors to test velocity and zone heatmaps'
  },
  INTERACTIVE_CURSOR: {
    id: 'INTERACTIVE_CURSOR',
    label: 'Interactive Mouse / Trackpad Control',
    description: 'Move mouse over canvas to position Right Hand; hold click to Pinch; press 1-5 to toggle fingers'
  }
};

/**
 * Build a 21-landmark 3D hand skeleton given:
 * - wristPos: { x, y, z }
 * - handedness: 'Left' | 'Right'
 * - scale: palm size in normalized coords (~0.11)
 * - rollAngle: palm rotation in radians
 * - fingerCurl: { thumb, index, middle, ring, pinky } where 0 = straight, 1 = curled
 * - pinchFactor: [0..1] pulls thumb tip #4 and index tip #8 together
 */
function buildHandSkeleton({
  wristPos,
  handedness = 'Right',
  scale = 0.115,
  rollAngle = 0,
  fingerCurl = { thumb: 0.1, index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1 },
  pinchFactor = 0,
  aspect = 16 / 9
}) {
  const dir = handedness === 'Left' ? -1 : 1; // Left hand thumb on right side in mirrored view, or anatomical
  const cosR = Math.cos(rollAngle);
  const sinR = Math.sin(rollAngle);

  function transformLocal(lx, ly, lz) {
    // Rotate in 2D plane and adjust for canvas aspect ratio so hands aren't stretched horizontally
    const rx = lx * cosR - ly * sinR;
    const ry = lx * sinR + ly * cosR;
    return {
      x: Math.max(0.02, Math.min(0.98, wristPos.x + (rx * scale) / (aspect * 0.72))),
      y: Math.max(0.02, Math.min(0.98, wristPos.y + ry * scale)),
      z: (wristPos.z || 0) + lz * scale
    };
  }

  const landmarks = new Array(21);
  // 0: WRIST
  landmarks[0] = { x: wristPos.x, y: wristPos.y, z: wristPos.z || 0 };

  // Thumb chain (1: CMC, 2: MCP, 3: IP, 4: TIP)
  const tc = fingerCurl.thumb;
  const thumbAngles = [
    { x: -0.36 * dir, y: -0.28, z: -0.04 },
    { x: (-0.68 + tc * 0.22) * dir, y: -0.56 + tc * 0.08, z: -0.08 - tc * 0.05 },
    { x: (-0.92 + tc * 0.48) * dir, y: -0.82 + tc * 0.22, z: -0.12 - tc * 0.08 },
    { x: (-1.12 + tc * 0.78) * dir, y: -1.06 + tc * 0.36, z: -0.15 - tc * 0.11 }
  ];
  for (let i = 0; i < 4; i++) {
    landmarks[1 + i] = transformLocal(thumbAngles[i].x, thumbAngles[i].y, thumbAngles[i].z);
  }

  // 4 Main Fingers configuration: [mcpX, mcpY, baseLen, indices]
  const fingerSpecs = [
    { key: 'index',  mcpX: -0.36 * dir, mcpY: -0.88, spread: -0.10 * dir, len: 0.96, indices: [5, 6, 7, 8] },
    { key: 'middle', mcpX: -0.10 * dir, mcpY: -0.95, spread: -0.02 * dir, len: 1.06, indices: [9, 10, 11, 12] },
    { key: 'ring',   mcpX:  0.16 * dir, mcpY: -0.90, spread:  0.06 * dir, len: 0.98, indices: [13, 14, 15, 16] },
    { key: 'pinky',  mcpX:  0.40 * dir, mcpY: -0.78, spread:  0.15 * dir, len: 0.78, indices: [17, 18, 19, 20] }
  ];

  for (const spec of fingerSpecs) {
    const curl = Math.max(0, Math.min(1, fingerCurl[spec.key] ?? 0.1));
    const [mcpIdx, pipIdx, dipIdx, tipIdx] = spec.indices;

    // MCP joint
    const mcpLocal = { x: spec.mcpX, y: spec.mcpY, z: -0.02 };
    landmarks[mcpIdx] = transformLocal(mcpLocal.x, mcpLocal.y, mcpLocal.z);

    // Segment lengths
    const s1 = 0.42 * spec.len;
    const s2 = 0.30 * spec.len;
    const s3 = 0.24 * spec.len;

    // When curl=0, segments continue upward (negative y); when curl=1, segments fold back down toward palm
    const pipLocal = {
      x: mcpLocal.x + spec.spread * 0.35 * (1 - curl * 0.6),
      y: mcpLocal.y - s1 * Math.cos(curl * 1.15),
      z: mcpLocal.z - s1 * Math.sin(curl * 1.15) * 0.65
    };
    const dipLocal = {
      x: pipLocal.x + spec.spread * 0.35 * (1 - curl * 0.8),
      y: pipLocal.y - s2 * Math.cos(curl * 2.15),
      z: pipLocal.z - s2 * Math.sin(curl * 2.15) * 0.65
    };
    const tipLocal = {
      x: dipLocal.x + spec.spread * 0.3 * (1 - curl),
      y: dipLocal.y - s3 * Math.cos(curl * 2.85),
      z: dipLocal.z - s3 * Math.sin(curl * 2.85) * 0.55
    };

    landmarks[pipIdx] = transformLocal(pipLocal.x, pipLocal.y, pipLocal.z);
    landmarks[dipIdx] = transformLocal(dipLocal.x, dipLocal.y, dipLocal.z);
    landmarks[tipIdx] = transformLocal(tipLocal.x, tipLocal.y, tipLocal.z);
  }

  // Apply pinch attraction between Thumb Tip (#4) and Index Tip (#8) if pinchFactor > 0
  if (pinchFactor > 0.01) {
    const p = Math.max(0, Math.min(1, pinchFactor));
    const midX = (landmarks[4].x + landmarks[8].x) * 0.5;
    const midY = (landmarks[4].y + landmarks[8].y) * 0.5;
    const midZ = (landmarks[4].z + landmarks[8].z) * 0.5 - 0.015;

    landmarks[4] = {
      x: landmarks[4].x * (1 - p * 0.88) + midX * (p * 0.88),
      y: landmarks[4].y * (1 - p * 0.88) + midY * (p * 0.88),
      z: landmarks[4].z * (1 - p * 0.88) + midZ * (p * 0.88)
    };
    landmarks[8] = {
      x: landmarks[8].x * (1 - p * 0.88) + midX * (p * 0.88),
      y: landmarks[8].y * (1 - p * 0.88) + midY * (p * 0.88),
      z: landmarks[8].z * (1 - p * 0.88) + midZ * (p * 0.88)
    };
    // Also slightly pull DIP(#7) and IP(#3)
    landmarks[7].x = landmarks[7].x * (1 - p * 0.35) + midX * (p * 0.35);
    landmarks[7].y = landmarks[7].y * (1 - p * 0.25) + (midY - 0.03) * (p * 0.25);
  }

  return landmarks;
}

/**
 * Named gesture presets for smooth interpolation
 */
const GESTURE_PRESETS = [
  { name: 'OPEN_PALM',  curl: { thumb: 0.04, index: 0.04, middle: 0.04, ring: 0.05, pinky: 0.05 }, pinch: 0.0, roll: 0.0 },
  { name: 'PINCH',      curl: { thumb: 0.35, index: 0.42, middle: 0.65, ring: 0.75, pinky: 0.82 }, pinch: 0.96, roll: 0.08 },
  { name: 'POINTING',   curl: { thumb: 0.65, index: 0.03, middle: 0.88, ring: 0.92, pinky: 0.94 }, pinch: 0.0, roll: -0.05 },
  { name: 'PEACE',      curl: { thumb: 0.72, index: 0.03, middle: 0.04, ring: 0.90, pinky: 0.92 }, pinch: 0.0, roll: 0.02 },
  { name: 'OK_SIGN',    curl: { thumb: 0.32, index: 0.40, middle: 0.05, ring: 0.06, pinky: 0.06 }, pinch: 0.95, roll: 0.05 },
  { name: 'FIST',       curl: { thumb: 0.82, index: 0.92, middle: 0.94, ring: 0.95, pinky: 0.95 }, pinch: 0.0, roll: 0.0 },
  { name: 'ROCK',       curl: { thumb: 0.70, index: 0.04, middle: 0.90, ring: 0.92, pinky: 0.04 }, pinch: 0.0, roll: -0.04 },
  { name: 'THUMBS_UP',  curl: { thumb: 0.02, index: 0.92, middle: 0.94, ring: 0.95, pinky: 0.95 }, pinch: 0.0, roll: 0.15 }
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function interpolatePose(poseA, poseB, t) {
  const s = smoothstep(t);
  return {
    curl: {
      thumb:  lerp(poseA.curl.thumb,  poseB.curl.thumb,  s),
      index:  lerp(poseA.curl.index,  poseB.curl.index,  s),
      middle: lerp(poseA.curl.middle, poseB.curl.middle, s),
      ring:   lerp(poseA.curl.ring,   poseB.curl.ring,   s),
      pinky:  lerp(poseA.curl.pinky,  poseB.curl.pinky,  s)
    },
    pinch: lerp(poseA.pinch, poseB.pinch, s),
    roll:  lerp(poseA.roll,  poseB.roll,  s)
  };
}

class HandActivitySimulator {
  constructor() {
    this.mode = 'DUAL_WORKFLOW';
    this.cursorPos = { x: 0.68, y: 0.58 };
    this.cursorDown = false;
    this.manualPresetIdx = 0;
  }

  setMode(modeId) {
    if (SIMULATION_MODES[modeId]) {
      this.mode = modeId;
    }
  }

  setCursorState(x, y, isDown) {
    this.cursorPos.x = Math.max(0.08, Math.min(0.92, x));
    this.cursorPos.y = Math.max(0.15, Math.min(0.92, y));
    if (typeof isDown === 'boolean') {
      this.cursorDown = isDown;
    }
  }

  cycleManualPreset() {
    this.manualPresetIdx = (this.manualPresetIdx + 1) % GESTURE_PRESETS.length;
  }

  /**
   * Generate synthetic MediaPipe-compatible multi-hand results at time tMs
   */
  generateFrame(tMs, aspect = 16 / 9) {
    const t = tMs / 1000;

    if (this.mode === 'INTERACTIVE_CURSOR') {
      // Left hand gently rests/monitors in Mid-Left while Right hand follows user's cursor!
      const leftPose = GESTURE_PRESETS[0]; // Open Palm
      const leftLm = buildHandSkeleton({
        wristPos: {
          x: 0.24 + Math.sin(t * 0.9) * 0.03,
          y: 0.68 + Math.cos(t * 1.1) * 0.025,
          z: -0.02
        },
        handedness: 'Left',
        scale: 0.115,
        rollAngle: Math.sin(t * 0.7) * 0.08,
        fingerCurl: leftPose.curl,
        pinchFactor: 0,
        aspect
      });

      const baseRight = GESTURE_PRESETS[this.manualPresetIdx];
      const rightLm = buildHandSkeleton({
        wristPos: {
          x: this.cursorPos.x,
          y: Math.min(0.94, this.cursorPos.y + 0.09),
          z: this.cursorDown ? -0.06 : -0.02
        },
        handedness: 'Right',
        scale: this.cursorDown ? 0.122 : 0.116,
        rollAngle: (this.cursorPos.x - 0.5) * 0.35,
        fingerCurl: this.cursorDown
          ? { thumb: 0.32, index: 0.38, middle: 0.45, ring: 0.55, pinky: 0.65 }
          : baseRight.curl,
        pinchFactor: this.cursorDown ? 0.96 : baseRight.pinch,
        aspect
      });

      return {
        multiHandLandmarks: [leftLm, rightLm],
        multiHandedness: [
          { label: 'Left', score: 0.992 },
          { label: 'Right', score: 0.996 }
        ]
      };
    }

    if (this.mode === 'GESTURE_SHOWCASE') {
      const cycleDur = 2.6; // seconds per gesture
      const totalIdx = t / cycleDur;
      const idxA = Math.floor(totalIdx) % GESTURE_PRESETS.length;
      const idxB = (idxA + 1) % GESTURE_PRESETS.length;
      const localPhase = totalIdx - Math.floor(totalIdx);
      const blendT = localPhase > 0.72 ? (localPhase - 0.72) / 0.28 : 0;

      const rightPose = interpolatePose(GESTURE_PRESETS[idxA], GESTURE_PRESETS[idxB], blendT);
      const leftIdxA = (idxA + 3) % GESTURE_PRESETS.length;
      const leftIdxB = (leftIdxA + 1) % GESTURE_PRESETS.length;
      const leftPose = interpolatePose(GESTURE_PRESETS[leftIdxA], GESTURE_PRESETS[leftIdxB], blendT);

      const leftLm = buildHandSkeleton({
        wristPos: {
          x: 0.30 + Math.sin(t * 1.1) * 0.07,
          y: 0.64 + Math.cos(t * 0.85) * 0.06,
          z: -0.02
        },
        handedness: 'Left',
        scale: 0.12,
        rollAngle: leftPose.roll + Math.sin(t * 1.2) * 0.08,
        fingerCurl: leftPose.curl,
        pinchFactor: leftPose.pinch,
        aspect
      });

      const rightLm = buildHandSkeleton({
        wristPos: {
          x: 0.70 + Math.cos(t * 1.05) * 0.07,
          y: 0.62 + Math.sin(t * 0.9) * 0.06,
          z: -0.03
        },
        handedness: 'Right',
        scale: 0.122,
        rollAngle: rightPose.roll + Math.cos(t * 1.1) * 0.08,
        fingerCurl: rightPose.curl,
        pinchFactor: rightPose.pinch,
        aspect
      });

      return {
        multiHandLandmarks: [leftLm, rightLm],
        multiHandedness: [
          { label: 'Left', score: 0.988 },
          { label: 'Right', score: 0.994 }
        ]
      };
    }

    if (this.mode === 'RAPID_SWIPE') {
      // High-velocity Lissajous figure-8 across all 9 spatial zones
      const lx = 0.34 + Math.sin(t * 2.4) * 0.24;
      const ly = 0.56 + Math.sin(t * 3.6) * 0.26;
      const rx = 0.66 + Math.cos(t * 2.6) * 0.24;
      const ry = 0.54 + Math.cos(t * 1.8) * 0.26;

      const leftLm = buildHandSkeleton({
        wristPos: { x: lx, y: ly, z: -0.02 },
        handedness: 'Left',
        scale: 0.112,
        rollAngle: Math.cos(t * 2.4) * 0.28,
        fingerCurl: { thumb: 0.06, index: 0.05, middle: 0.06, ring: 0.08, pinky: 0.10 },
        pinchFactor: 0,
        aspect
      });

      const rightLm = buildHandSkeleton({
        wristPos: { x: rx, y: ry, z: -0.03 },
        handedness: 'Right',
        scale: 0.115,
        rollAngle: -Math.sin(t * 2.6) * 0.28,
        fingerCurl: { thumb: 0.55, index: 0.03, middle: 0.88, ring: 0.92, pinky: 0.94 },
        pinchFactor: 0,
        aspect
      });

      return {
        multiHandLandmarks: [leftLm, rightLm],
        multiHandedness: [
          { label: 'Left', score: 0.979 },
          { label: 'Right', score: 0.985 }
        ]
      };
    }

    // Default: DUAL_WORKFLOW (ergonomic reaches, precision pinches, tapping, and gesture holds)
    const phaseL = (t * 0.42) % GESTURE_PRESETS.length;
    const lA = Math.floor(phaseL);
    const lB = (lA + 1) % GESTURE_PRESETS.length;
    const lBlend = (phaseL - lA) > 0.65 ? ((phaseL - lA) - 0.65) / 0.35 : 0;
    const leftPose = interpolatePose(GESTURE_PRESETS[lA], GESTURE_PRESETS[lB], lBlend);

    const phaseR = ((t + 3.2) * 0.48) % GESTURE_PRESETS.length;
    const rA = Math.floor(phaseR);
    const rB = (rA + 1) % GESTURE_PRESETS.length;
    const rBlend = (phaseR - rA) > 0.65 ? ((phaseR - rA) - 0.65) / 0.35 : 0;
    const rightPose = interpolatePose(GESTURE_PRESETS[rA], GESTURE_PRESETS[rB], rBlend);

    // Add realistic micro-articulation when in pointing/open states
    const tapWave = Math.max(0, Math.sin(t * 7.5)) * 0.22;

    const leftLm = buildHandSkeleton({
      wristPos: {
        x: 0.29 + Math.sin(t * 0.85) * 0.14 + Math.cos(t * 1.7) * 0.04,
        y: 0.63 + Math.cos(t * 0.65) * 0.15,
        z: Math.sin(t * 0.9) * 0.03
      },
      handedness: 'Left',
      scale: 0.116,
      rollAngle: leftPose.roll + Math.sin(t * 0.85) * 0.14,
      fingerCurl: leftPose.curl,
      pinchFactor: leftPose.pinch,
      aspect
    });

    const rightLm = buildHandSkeleton({
      wristPos: {
        x: 0.71 + Math.cos(t * 0.95) * 0.15 - Math.sin(t * 1.9) * 0.04,
        y: 0.60 + Math.sin(t * 0.75) * 0.16,
        z: Math.cos(t * 0.8) * 0.03
      },
      handedness: 'Right',
      scale: 0.118,
      rollAngle: rightPose.roll + Math.cos(t * 0.95) * 0.15,
      fingerCurl: {
        ...rightPose.curl,
        index: Math.min(0.95, rightPose.curl.index + (rightPose.pinch < 0.2 ? tapWave * 0.3 : 0))
      },
      pinchFactor: rightPose.pinch,
      aspect
    });

    return {
      multiHandLandmarks: [leftLm, rightLm],
      multiHandedness: [
        { label: 'Left', score: 0.991 + Math.sin(t * 2) * 0.006 },
        { label: 'Right', score: 0.994 + Math.cos(t * 2.3) * 0.004 }
      ]
    };
  }
}



// --- MODULE: Studio Canvas Renderer ---
/**
 * Studio-Grade High-FPS Canvas Renderer
 * Renders 21-point 3D hand skeletons, bounding boxes, spatial zone heatmaps,
 * velocity vectors, motion trails, and pinch caliper diagnostics.
 */


// Color themes per hand
const HAND_THEMES = {
  Left: {
    primary: '#00f0ff',
    primaryAlpha: 'rgba(0, 240, 255, 0.25)',
    glow: 'rgba(0, 240, 255, 0.75)',
    boxBg: 'rgba(2, 20, 36, 0.82)',
    boxBorder: '#00f0ff',
    badgeBg: '#0284c7',
    badgeText: '#e0f2fe',
    tag: 'LEFT'
  },
  Right: {
    primary: '#10b981',
    primaryAlpha: 'rgba(16, 185, 129, 0.25)',
    glow: 'rgba(16, 185, 129, 0.75)',
    boxBg: 'rgba(2, 32, 22, 0.82)',
    boxBorder: '#10b981',
    badgeBg: '#059669',
    badgeText: '#d1fae5',
    tag: 'RIGHT'
  }
};

// Anatomical finger bone colors
const FINGER_COLORS = {
  thumb:  '#22c55e', // Green
  index:  '#06b6d4', // Cyan
  middle: '#3b82f6', // Blue
  ring:   '#a855f7', // Purple
  pinky:  '#ec4899', // Pink
  palm:   '#f59e0b'  // Amber
};

class TelemetryRenderer {
  constructor(canvas, videoElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = videoElement;

    // Viewport layers & display options
    this.options = {
      mirror: true,
      showSkeleton: true,
      showBBox: true,
      showZones: true,
      showTrails: true,
      showVectors: true,
      showPinchCaliper: true,
      showLandmarkLabels: false,
      videoOpacity: 0.88,
      dimVideo: false
    };

    // Zone dwell accumulation for spatial heatmap
    this.zoneDwell = {
      UL: 0, UC: 0, UR: 0,
      ML: 0, MC: 0, MR: 0,
      LL: 0, LC: 0, LR: 0
    };
    this.totalDwell = 0;
  }

  setOption(key, value) {
    if (key in this.options) {
      this.options[key] = value;
    }
  }

  resetZoneHeatmap() {
    for (const k of Object.keys(this.zoneDwell)) {
      this.zoneDwell[k] = 0;
    }
    this.totalDwell = 0;
  }

  recordZoneDwell(zoneCode, dt = 1) {
    if (zoneCode in this.zoneDwell) {
      this.zoneDwell[zoneCode] += dt;
      this.totalDwell += dt;
    }
  }

  getZonePercentages() {
    const total = Math.max(1e-4, this.totalDwell);
    const result = {};
    for (const [k, v] of Object.entries(this.zoneDwell)) {
      result[k] = Math.round((v / total) * 100);
    }
    return result;
  }

  /**
   * Main render loop invocation
   */
  renderFrame({ handResults = [], isSimulated = false }) {
    const { canvas, ctx } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 1. Draw Video / Background Layer
    if (this.video && this.video.readyState >= 2 && !isSimulated) {
      ctx.save();
      if (this.options.mirror) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = this.options.videoOpacity;
      if (this.options.dimVideo) {
        ctx.filter = 'brightness(0.55) contrast(1.15)';
      }
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.restore();
    } else {
      // Dark cyber-grid studio backdrop for simulator or camera standby
      this.renderBackdrop(w, h, isSimulated);
    }

    // 2. Spatial 3x3 Reach Zones Overlay
    if (this.options.showZones) {
      this.renderZones(w, h, handResults);
    }

    // 3. Motion Trails
    if (this.options.showTrails) {
      for (const hand of handResults) {
        this.renderTrails(w, h, hand);
      }
    }

    // 4. 21-point 3D Skeleton & Calipers
    for (const hand of handResults) {
      const theme = HAND_THEMES[hand.handedness] || HAND_THEMES.Right;

      if (this.options.showSkeleton) {
        this.renderSkeleton(w, h, hand, theme);
      }

      if (this.options.showPinchCaliper) {
        this.renderPinchCaliper(w, h, hand, theme);
      }

      if (this.options.showVectors) {
        this.renderVelocityVector(w, h, hand, theme);
      }

      if (this.options.showBBox) {
        this.renderBoundingBox(w, h, hand, theme);
      }
    }

    // 5. Watermark / Camera Status overlay
    this.renderTelemetryHUD(w, h, handResults.length, isSimulated);

    ctx.restore();
  }

  renderBackdrop(w, h, isSimulated) {
    const { ctx } = this;
    // Dark radial gradient
    const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
    ctx.lineWidth = 1;
    const step = 48;
    ctx.beginPath();
    for (let x = 0; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    if (isSimulated) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('SYNTHETIC 3D SKELETON SIMULATOR MODE ACTIVE', 18, h - 22);
    }
  }

  renderZones(w, h, handResults) {
    const { ctx } = this;
    const colW = w / 3;
    const rowH = h / 3;

    // Get active zones in current frame
    const activeZones = new Set(handResults.map(h => h.zone.code));
    const percentages = this.getZonePercentages();

    ctx.save();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const code = ZONE_LABELS[r][c];
        const isActive = activeZones.has(code);
        const pct = percentages[code] || 0;
        const x = c * colW;
        const y = r * rowH;

        // Dwell heat fill
        if (pct > 0 || isActive) {
          const heatAlpha = Math.min(0.25, (pct / 100) * 0.4 + (isActive ? 0.08 : 0));
          ctx.fillStyle = isActive ? `rgba(0, 240, 255, ${heatAlpha + 0.08})` : `rgba(59, 130, 246, ${heatAlpha})`;
          ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
        }

        // Zone borders
        ctx.strokeStyle = isActive ? 'rgba(0, 240, 255, 0.45)' : 'rgba(100, 116, 139, 0.18)';
        ctx.lineWidth = isActive ? 1.5 : 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x + 1, y + 1, colW - 2, rowH - 2);
        ctx.setLineDash([]);

        // Zone Badge
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = isActive ? '#00f0ff' : 'rgba(148, 163, 184, 0.65)';
        ctx.fillText(`${code} • ${pct}%`, x + 8, y + 16);
      }
    }
    ctx.restore();
  }

  renderTrails(w, h, hand) {
    const { ctx } = this;
    const theme = HAND_THEMES[hand.handedness] || HAND_THEMES.Right;

    // 1. Palm velocity trail
    if (hand.trail && hand.trail.length > 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < hand.trail.length; i++) {
        const p0 = hand.trail[i - 1];
        const p1 = hand.trail[i];
        const alpha = (i / hand.trail.length) * 0.45;
        const thickness = 2 + (i / hand.trail.length) * 3.5;

        ctx.strokeStyle = theme.primary;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(p0.x * w, p0.y * h);
        ctx.lineTo(p1.x * w, p1.y * h);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Index fingertip precision trail
    if (hand.indexTrail && hand.indexTrail.length > 2) {
      ctx.save();
      for (let i = 1; i < hand.indexTrail.length; i++) {
        const p0 = hand.indexTrail[i - 1];
        const p1 = hand.indexTrail[i];
        const alpha = (i / hand.indexTrail.length) * 0.75;
        ctx.strokeStyle = p1.pinched ? '#f59e0b' : '#38bdf8';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = p1.pinched ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(p0.x * w, p0.y * h);
        ctx.lineTo(p1.x * w, p1.y * h);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  renderSkeleton(w, h, hand, theme) {
    const { ctx } = this;
    const lms = hand.landmarks;

    ctx.save();

    // 1. Draw Palm connections
    ctx.strokeStyle = FINGER_COLORS.palm;
    ctx.lineWidth = 2.8;
    ctx.shadowBlur = 8;
    ctx.shadowColor = FINGER_COLORS.palm;
    ctx.beginPath();
    for (const [a, b] of PALM_CONNECTIONS) {
      ctx.moveTo(lms[a].x * w, lms[a].y * h);
      ctx.lineTo(lms[b].x * w, lms[b].y * h);
    }
    ctx.stroke();

    // 2. Draw Finger Chains
    for (const [finger, chain] of Object.entries(FINGER_CHAINS)) {
      const color = FINGER_COLORS[finger];
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 9;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      for (let i = 0; i < chain.length - 1; i++) {
        const idxA = chain[i];
        const idxB = chain[i + 1];
        ctx.moveTo(lms[idxA].x * w, lms[idxA].y * h);
        ctx.lineTo(lms[idxB].x * w, lms[idxB].y * h);
      }
      ctx.stroke();
    }

    // 3. Draw 21 Landmark Nodes with 3D Depth scaling
    ctx.shadowBlur = 0;
    for (let i = 0; i < lms.length; i++) {
      const lm = lms[i];
      const px = lm.x * w;
      const py = lm.y * h;
      const z = lm.z || 0;

      // Base radius scaled by z depth (closer = larger)
      const baseR = Math.max(3.2, Math.min(8.5, 5.0 - z * 24));
      const isTip = [4, 8, 12, 16, 20].includes(i);
      const isWrist = i === 0;

      // Outer glow ring for fingertips and wrist
      if (isTip || isWrist) {
        ctx.strokeStyle = isWrist ? theme.primary : '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(px, py, baseR + 3.2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Joint core circle
      ctx.fillStyle = isTip ? '#ffffff' : theme.primary;
      ctx.beginPath();
      ctx.arc(px, py, baseR, 0, Math.PI * 2);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.5, baseR * 0.42), 0, Math.PI * 2);
      ctx.fill();

      // Optional landmark index number
      if (this.options.showLandmarkLabels) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillText(i.toString(), px + baseR + 2, py - 2);
      }
    }

    ctx.restore();
  }

  renderPinchCaliper(w, h, hand, theme) {
    const { ctx } = this;
    const lms = hand.landmarks;
    const thumbTip = lms[4];
    const indexTip = lms[8];
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const pixelDist = Math.hypot(dx * w, dy * h);
    const midX = ((thumbTip.x + indexTip.x) / 2) * w;
    const midY = ((thumbTip.y + indexTip.y) / 2) * h;
    const isPinched = hand.gesture.id === 'PINCH' || hand.gesture.id === 'OK_SIGN';

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isPinched ? '#f59e0b' : 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = isPinched ? 2.5 : 1.5;

    ctx.beginPath();
    ctx.moveTo(thumbTip.x * w, thumbTip.y * h);
    ctx.lineTo(indexTip.x * w, indexTip.y * h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Caliper distance tag pill
    const tagText = `${Math.round(pixelDist)}px`;
    ctx.font = '10px ui-monospace, monospace';
    const tagW = ctx.measureText(tagText).width + 10;
    ctx.fillStyle = isPinched ? 'rgba(245, 158, 11, 0.92)' : 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = isPinched ? '#fde047' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(midX - tagW / 2, midY - 9, tagW, 16, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isPinched ? '#000000' : '#e2e8f0';
    ctx.fillText(tagText, midX - tagW / 2 + 5, midY + 3);
    ctx.restore();
  }

  renderVelocityVector(w, h, hand, theme) {
    const { ctx } = this;
    const pc = hand.palmCenter;
    const v = hand.velocityVec;
    const speed = hand.speedNorm;

    if (speed < 0.08) return;

    const startX = pc.x * w;
    const startY = pc.y * h;
    const scale = 55; // Pixels per normalized unit velocity
    const endX = startX + v.vx * scale;
    const endY = startY + v.vy * scale;

    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(endY - startY, endX - startX);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 8 * Math.cos(angle - Math.PI / 6), endY - 8 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(endX - 8 * Math.cos(angle + Math.PI / 6), endY - 8 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  renderBoundingBox(w, h, hand, theme) {
    const { ctx } = this;
    const { minX, minY, width, height } = hand.bbox;
    const bx = minX * w;
    const by = minY * h;
    const bw = width * w;
    const bh = height * h;
    const corner = Math.min(24, Math.min(bw, bh) * 0.28);

    ctx.save();

    // Subtle background tint inside bounding box
    ctx.fillStyle = theme.primaryAlpha;
    ctx.fillRect(bx, by, bw, bh);

    // Corner brackets
    ctx.strokeStyle = theme.boxBorder;
    ctx.lineWidth = 2.5;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(bx, by + corner);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + corner, by);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(bx + bw - corner, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + corner);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(bx, by + bh - corner);
    ctx.lineTo(bx, by + bh);
    ctx.lineTo(bx + corner, by + bh);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(bx + bw - corner, by + bh);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw, by + bh - corner);
    ctx.stroke();

    // Telemetry Header Card above/inside bounding box
    const cardY = Math.max(14, by - 36);
    const badgeText = `${theme.tag} HAND`;
    const gestureText = `${hand.gesture.icon} ${hand.gesture.name}`;
    const activityText = `${hand.activity.name}`;
    const speedText = `${hand.speedPxPerSec} px/s`;

    ctx.font = 'bold 11px system-ui, sans-serif';
    const tagW = ctx.measureText(badgeText).width + 12;

    ctx.font = '11px system-ui, sans-serif';
    const gestW = ctx.measureText(gestureText).width + 12;
    const totalW = Math.max(bw, tagW + gestW + 8);

    // Header bar background
    ctx.fillStyle = theme.boxBg;
    ctx.strokeStyle = theme.boxBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, cardY, totalW, 30, 4);
    ctx.fill();
    ctx.stroke();

    // Handedness pill
    ctx.fillStyle = theme.badgeBg;
    ctx.beginPath();
    ctx.roundRect(bx + 4, cardY + 5, tagW, 20, 3);
    ctx.fill();
    ctx.fillStyle = theme.badgeText;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(badgeText, bx + 10, cardY + 19);

    // Gesture Name
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(gestureText, bx + tagW + 10, cardY + 19);

    // Sub-bar with Activity State and Speed
    const subY = by + bh + 4;
    if (subY + 22 < h) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
      ctx.beginPath();
      ctx.roundRect(bx, subY, bw, 20, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = hand.activity.color;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`• ${activityText}`, bx + 6, subY + 14);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px ui-monospace, monospace';
      const speedW = ctx.measureText(speedText).width;
      ctx.fillText(speedText, bx + bw - speedW - 6, subY + 14);
    }

    ctx.restore();
  }

  renderTelemetryHUD(w, h, handCount, isSimulated) {
    const { ctx } = this;
    ctx.save();
    // Top-left live status indicator
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(14, 14, 185, 28, 6);
    ctx.fill();
    ctx.stroke();

    // Glowing status dot
    const statusColor = handCount > 0 ? '#10b981' : (isSimulated ? '#00f0ff' : '#f59e0b');
    ctx.fillStyle = statusColor;
    ctx.shadowColor = statusColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(26, 28, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 11px system-ui, sans-serif';
    const statusMsg = handCount > 0
      ? `TRACKING (${handCount} HAND${handCount > 1 ? 'S' : ''})`
      : (isSimulated ? 'SIMULATOR ACTIVE' : 'LOOKING FOR HANDS');
    ctx.fillText(statusMsg, 38, 32);

    ctx.restore();
  }
}

/**
 * 60-Second Real-Time Kinematic Chart Canvas
 */
class KinematicSparklineChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.historyLength = 90;
    this.leftSpeedHistory = new Array(this.historyLength).fill(0);
    this.rightSpeedHistory = new Array(this.historyLength).fill(0);
    this.pinchDistHistory = new Array(this.historyLength).fill(0);
  }

  pushSample(leftSpeed = 0, rightSpeed = 0, pinchDist = 0) {
    this.leftSpeedHistory.shift();
    this.leftSpeedHistory.push(leftSpeed);

    this.rightSpeedHistory.shift();
    this.rightSpeedHistory.push(rightSpeed);

    this.pinchDistHistory.shift();
    this.pinchDistHistory.push(pinchDist);
  }

  render() {
    const { canvas, ctx } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background & grid
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.moveTo(0, h * 0.25);
    ctx.lineTo(w, h * 0.25);
    ctx.moveTo(0, h * 0.75);
    ctx.lineTo(w, h * 0.75);
    ctx.stroke();

    const maxSpeed = 1.6; // normalized speed ceiling

    // Draw Left Hand Speed (Cyan)
    this.drawLine(this.leftSpeedHistory, maxSpeed, '#00f0ff', 'rgba(0, 240, 255, 0.12)', w, h);

    // Draw Right Hand Speed (Emerald)
    this.drawLine(this.rightSpeedHistory, maxSpeed, '#10b981', 'rgba(16, 185, 129, 0.12)', w, h);

    // Draw Pinch Proximity (Gold dashed)
    this.drawPinchLine(this.pinchDistHistory, '#f59e0b', w, h);
  }

  drawLine(data, maxVal, strokeColor, fillColor, w, h) {
    const { ctx } = this;
    const n = data.length;
    const dx = w / (n - 1);

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < n; i++) {
      const val = Math.min(maxVal, data[i]);
      const x = i * dx;
      const y = h - (val / maxVal) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Area fill
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.restore();
  }

  drawPinchLine(data, strokeColor, w, h) {
    const { ctx } = this;
    const n = data.length;
    const dx = w / (n - 1);

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    for (let i = 0; i < n; i++) {
      const val = Math.max(0, Math.min(1, data[i]));
      const x = i * dx;
      const y = h - val * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}



// --- MODULE: Main Application Controller ---
/**
 * Hand Activity Tracker - Main Application Controller
 * Orchestrates MediaPipe Hands webcam pipeline, 3D simulation fallback,
 * UI telemetry cards, spatial heatmap, event stream, and session data exports.
 */


class HandActivityTrackerApp {
  constructor() {
    this.video = document.getElementById('webcamVideo');
    this.canvas = document.getElementById('outputCanvas');
    this.chartCanvas = document.getElementById('sparklineCanvas');

    // Subsystems
    this.renderer = new TelemetryRenderer(this.canvas, this.video);
    this.chart = new KinematicSparklineChart(this.chartCanvas);
    this.simulator = new HandActivitySimulator();
    this.leftTracker = new HandKinematicTracker('Left');
    this.rightTracker = new HandKinematicTracker('Right');

    // Run-state
    this.mode = 'SIMULATOR'; // 'WEBCAM' | 'SIMULATOR'
    this.cameraInstance = null;
    this.handsDetector = null;
    this.isMediaPipeReady = false;
    this.isTrackingRunning = false;
    this.lastFrameTime = performance.now();
    this.fpsCounter = 0;
    this.fpsTimer = performance.now();
    this.currentFps = 60;
    this.inferenceLatencyMs = 12;

    // Session Metrics
    this.sessionStartTime = performance.now();
    this.activeTimeMs = 0;
    this.idleTimeMs = 0;
    this.peakSpeedPx = 0;
    this.gestureChangeCount = 0;
    this.lastObservedGestures = { Left: null, Right: null };

    // Telemetry log for CSV / JSON export
    this.telemetryRecords = [];
    this.eventLogStream = [];
    this.maxLogItems = 60;

    // Mouse control bindings for simulator
    this.setupMouseControl();
    this.bindUIEvents();
  }

  async init() {
    this.resizeCanvases();
    window.addEventListener('resize', () => this.resizeCanvases());

    // Populate simulation mode dropdown
    this.populateSimulationModes();

    // Check if MediaPipe is available in global scope
    if (typeof window.Hands === 'function') {
      await this.initMediaPipe();
      this.populateCameraDevices();
    } else {
      console.warn('MediaPipe Hands script not detected or blocked; starting in 3D Simulator mode.');
      this.setMode('SIMULATOR');
    }

    // Start render / processing loop
    this.isTrackingRunning = true;
    requestAnimationFrame(t => this.mainLoop(t));
    this.addEventLog('SYSTEM', 'Hand Activity Tracker initialized and operational', '#00f0ff');
  }

  resizeCanvases() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const aspect = 16 / 9;
    let w = rect.width;
    let h = rect.width / aspect;

    if (h > rect.height && rect.height > 200) {
      h = rect.height;
      w = h * aspect;
    }

    this.canvas.width = Math.round(w);
    this.canvas.height = Math.round(h);

    if (this.chartCanvas) {
      this.chartCanvas.width = this.chartCanvas.parentElement.clientWidth || 340;
      this.chartCanvas.height = 72;
    }
  }

  populateSimulationModes() {
    const sel = document.getElementById('simPresetSelect');
    if (!sel) return;
    sel.innerHTML = '';
    for (const [key, info] of Object.entries(SIMULATION_MODES)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = info.label;
      sel.appendChild(opt);
    }
    sel.value = this.simulator.mode;
    sel.addEventListener('change', e => {
      this.simulator.setMode(e.target.value);
      this.addEventLog('SIMULATOR', `Switched to ${SIMULATION_MODES[e.target.value].label}`, '#94a3b8');
    });
  }

  async populateCameraDevices() {
    const select = document.getElementById('cameraSelect');
    if (!select || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      select.innerHTML = '';
      if (videoDevices.length === 0) {
        select.innerHTML = '<option value="">Default Camera</option>';
        return;
      }
      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        select.appendChild(option);
      });
    } catch (e) {
      console.warn('Could not enumerate cameras:', e);
    }
  }

  async initMediaPipe() {
    try {
      this.handsDetector = new window.Hands({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.handsDetector.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65
      });

      this.handsDetector.onResults(results => this.onMediaPipeResults(results));
      this.isMediaPipeReady = true;
      console.log('MediaPipe Hands initialized successfully.');
    } catch (err) {
      console.error('Failed to initialize MediaPipe Hands:', err);
      this.isMediaPipeReady = false;
    }
  }

  async startWebcam(deviceId = null) {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Webcam access is not supported by your browser or environment.');
      return;
    }

    try {
      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = stream;
      await this.video.play();

      if (window.Camera && this.handsDetector) {
        if (this.cameraInstance) {
          try { this.cameraInstance.stop(); } catch (_) {}
        }
        this.cameraInstance = new window.Camera(this.video, {
          onFrame: async () => {
            if (this.mode === 'WEBCAM' && this.handsDetector) {
              const t0 = performance.now();
              await this.handsDetector.send({ image: this.video });
              this.inferenceLatencyMs = Math.round(performance.now() - t0);
            }
          },
          width: 1280,
          height: 720
        });
        this.cameraInstance.start();
      }

      this.setMode('WEBCAM');
      this.addEventLog('WEBCAM', 'Webcam stream online at 1280x720', '#10b981');
    } catch (err) {
      console.error('Webcam initialization error:', err);
      alert(`Could not start webcam: ${err.message}. Staying in 3D Simulator mode.`);
      this.setMode('SIMULATOR');
    }
  }

  stopWebcam() {
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }
    if (this.cameraInstance) {
      try { this.cameraInstance.stop(); } catch (_) {}
      this.cameraInstance = null;
    }
  }

  setMode(newMode) {
    this.mode = newMode;
    const badge = document.getElementById('trackingStatusBadge');
    const simControls = document.getElementById('simControlsRow');

    if (newMode === 'WEBCAM') {
      if (badge) {
        badge.textContent = 'LIVE WEBCAM';
        badge.className = 'status-badge live';
      }
      if (simControls) simControls.style.display = 'none';
      document.getElementById('btnStartWebcam')?.classList.add('active');
      document.getElementById('btnStartSimulator')?.classList.remove('active');
    } else {
      if (badge) {
        badge.textContent = '3D SIMULATOR';
        badge.className = 'status-badge sim';
      }
      if (simControls) simControls.style.display = 'flex';
      document.getElementById('btnStartSimulator')?.classList.add('active');
      document.getElementById('btnStartWebcam')?.classList.remove('active');
    }
  }

  setupMouseControl() {
    // Allows interactive positioning in simulator mode
    const handleMove = e => {
      if (this.mode !== 'SIMULATOR' || this.simulator.mode !== 'INTERACTIVE_CURSOR') return;
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      this.simulator.setCursorState(x, y);
    };

    const handleDown = () => {
      if (this.mode === 'SIMULATOR') this.simulator.setCursorState(undefined, undefined, true);
    };

    const handleUp = () => {
      if (this.mode === 'SIMULATOR') this.simulator.setCursorState(undefined, undefined, false);
    };

    this.canvas.addEventListener('mousemove', handleMove);
    this.canvas.addEventListener('mousedown', handleDown);
    window.addEventListener('mouseup', handleUp);

    // Click canvas in simulator to cycle manual gesture preset
    this.canvas.addEventListener('click', () => {
      if (this.mode === 'SIMULATOR' && this.simulator.mode === 'INTERACTIVE_CURSOR') {
        this.simulator.cycleManualPreset();
      }
    });
  }

  /**
   * Main Render & Telemetry Loop
   */
  mainLoop(timestamp) {
    if (!this.isTrackingRunning) return;

    // Calculate FPS
    const dt = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    this.fpsCounter++;
    if (timestamp - this.fpsTimer >= 500) {
      this.currentFps = Math.round((this.fpsCounter * 1000) / (timestamp - this.fpsTimer));
      this.fpsCounter = 0;
      this.fpsTimer = timestamp;
      document.getElementById('fpsValue').textContent = `${this.currentFps} FPS`;
      document.getElementById('latencyValue').textContent = `${this.inferenceLatencyMs} ms`;
    }

    if (this.mode === 'SIMULATOR') {
      const aspect = this.canvas.width / (this.canvas.height || 1);
      const simResults = this.simulator.generateFrame(timestamp, aspect);
      this.processHandsResults(simResults, timestamp, true);
    }

    requestAnimationFrame(t => this.mainLoop(t));
  }

  onMediaPipeResults(results) {
    if (this.mode !== 'WEBCAM') return;
    this.processHandsResults(results, performance.now(), false);
  }

  processHandsResults(results, timestamp, isSimulated) {
    const rawLandmarks = results.multiHandLandmarks || [];
    const rawHandedness = results.multiHandedness || [];
    const processedHands = [];

    // Track active dt
    const frameDtSec = Math.min(0.1, (timestamp - (this.lastProcessTime || timestamp)) / 1000);
    this.lastProcessTime = timestamp;

    for (let i = 0; i < rawLandmarks.length; i++) {
      const landmarks = rawLandmarks[i];
      let handednessLabel = rawHandedness[i]?.label || (i === 0 ? 'Left' : 'Right');

      // Adjust for mirror setting if using webcam
      if (this.renderer.options.mirror && !isSimulated) {
        handednessLabel = handednessLabel === 'Left' ? 'Right' : 'Left';
      }

      const tracker = handednessLabel === 'Left' ? this.leftTracker : this.rightTracker;
      const handData = tracker.update(landmarks, timestamp);
      processedHands.push(handData);

      // Record spatial zone dwell
      this.renderer.recordZoneDwell(handData.zone.code, frameDtSec);

      // Check for gesture state transitions
      this.checkGestureTransition(handData);

      // Track peak speed
      if (handData.speedPxPerSec > this.peakSpeedPx) {
        this.peakSpeedPx = handData.speedPxPerSec;
        document.getElementById('peakSpeedVal').textContent = `${this.peakSpeedPx} px/s`;
      }
    }

    // Update active vs idle session timers
    if (processedHands.length > 0) {
      this.activeTimeMs += frameDtSec * 1000;
    } else {
      this.idleTimeMs += frameDtSec * 1000;
    }

    // Render Canvas
    this.renderer.renderFrame({
      handResults: processedHands,
      isSimulated
    });

    // Update Sparkline Chart
    const leftHand = processedHands.find(h => h.handedness === 'Left');
    const rightHand = processedHands.find(h => h.handedness === 'Right');
    const leftSpeed = leftHand ? leftHand.speedNorm : 0;
    const rightSpeed = rightHand ? rightHand.speedNorm : 0;
    const pinchAperture = rightHand
      ? (1 - Math.min(1, rightHand.gesture.pinchDistNorm || 1))
      : (leftHand ? (1 - Math.min(1, leftHand.gesture.pinchDistNorm || 1)) : 0);

    this.chart.pushSample(leftSpeed, rightSpeed, pinchAperture);
    this.chart.render();

    // Update Telemetry Cards & Session Metrics
    this.updateTelemetryDOM(processedHands);
    this.updateSessionStatsDOM();
    this.updateSpatialHeatmapDOM();

    // Sample telemetry log every ~250ms if active
    if (processedHands.length > 0 && (!this.lastSampleTime || timestamp - this.lastSampleTime >= 250)) {
      this.lastSampleTime = timestamp;
      this.sampleTelemetry(processedHands, timestamp);
    }
  }

  checkGestureTransition(hand) {
    const prev = this.lastObservedGestures[hand.handedness];
    if (prev !== hand.gesture.id) {
      this.lastObservedGestures[hand.handedness] = hand.gesture.id;
      this.gestureChangeCount++;
      document.getElementById('gestureCountVal').textContent = this.gestureChangeCount;

      this.addEventLog(
        hand.handedness.toUpperCase(),
        `${hand.gesture.icon} ${hand.gesture.name} (${hand.activity.name}) in ${hand.zone.code}`,
        hand.handedness === 'Left' ? '#00f0ff' : '#10b981'
      );
    }
  }

  updateTelemetryDOM(hands) {
    const leftHand = hands.find(h => h.handedness === 'Left');
    const rightHand = hands.find(h => h.handedness === 'Right');

    this.updateSingleHandCard('Left', leftHand);
    this.updateSingleHandCard('Right', rightHand);
  }

  updateSingleHandCard(side, hand) {
    const prefix = side.toLowerCase();
    const card = document.getElementById(`${prefix}HandCard`);
    if (!card) return;

    if (!hand) {
      card.classList.add('dimmed');
      document.getElementById(`${prefix}StatusText`).textContent = 'NO HAND DETECTED';
      document.getElementById(`${prefix}GestureBadge`).textContent = '---';
      document.getElementById(`${prefix}ActivityBadge`).textContent = 'Idle';
      return;
    }

    card.classList.remove('dimmed');
    document.getElementById(`${prefix}StatusText`).textContent = 'ACTIVE TRACKING';
    document.getElementById(`${prefix}GestureBadge`).textContent = `${hand.gesture.icon} ${hand.gesture.name}`;
    document.getElementById(`${prefix}ActivityBadge`).textContent = hand.activity.name;
    document.getElementById(`${prefix}ActivityBadge`).style.color = hand.activity.color;

    // Wrist Coordinates
    document.getElementById(`${prefix}CoordX`).textContent = hand.landmarks[0].x.toFixed(2);
    document.getElementById(`${prefix}CoordY`).textContent = hand.landmarks[0].y.toFixed(2);
    document.getElementById(`${prefix}CoordZ`).textContent = (hand.landmarks[0].z || 0).toFixed(2);

    // Speed & Zone
    document.getElementById(`${prefix}SpeedVal`).textContent = `${hand.speedPxPerSec} px/s`;
    document.getElementById(`${prefix}ZoneVal`).textContent = `${hand.zone.code} (${hand.zone.name})`;
    document.getElementById(`${prefix}OpennessVal`).textContent = `${hand.extensions.openness}%`;

    // Finger Extension Bars
    const ext = hand.extensions;
    this.setBarWidth(`${prefix}ThumbBar`, ext.thumb * 100);
    this.setBarWidth(`${prefix}IndexBar`, ext.index * 100);
    this.setBarWidth(`${prefix}MiddleBar`, ext.middle * 100);
    this.setBarWidth(`${prefix}RingBar`, ext.ring * 100);
    this.setBarWidth(`${prefix}PinkyBar`, ext.pinky * 100);
  }

  setBarWidth(id, pct) {
    const bar = document.getElementById(id);
    if (bar) bar.style.width = `${Math.max(4, Math.min(100, pct))}%`;
  }

  updateSessionStatsDOM() {
    const formatTime = ms => {
      const totalSec = Math.floor(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    document.getElementById('activeTimeVal').textContent = formatTime(this.activeTimeMs);
    document.getElementById('idleTimeVal').textContent = formatTime(this.idleTimeMs);

    const totalDistance = Math.round((this.leftTracker.totalDistanceNorm + this.rightTracker.totalDistanceNorm) * 1280);
    document.getElementById('totalDistanceVal').textContent = `${totalDistance} px`;
  }

  updateSpatialHeatmapDOM() {
    const percentages = this.renderer.getZonePercentages();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const code = ZONE_LABELS[r][c];
        const cell = document.getElementById(`zoneCell_${code}`);
        if (cell) {
          const pct = percentages[code] || 0;
          cell.textContent = `${code} ${pct}%`;
          const intensity = Math.min(1, pct / 35);
          cell.style.backgroundColor = `rgba(0, 240, 255, ${intensity * 0.45})`;
          cell.style.borderColor = pct > 0 ? '#00f0ff' : 'rgba(51, 65, 85, 0.5)';
        }
      }
    }
  }

  addEventLog(source, message, color = '#f8fafc') {
    const timeStr = new Date().toTimeString().split(' ')[0];
    this.eventLogStream.unshift({ time: timeStr, source, message, color });
    if (this.eventLogStream.length > this.maxLogItems) {
      this.eventLogStream.pop();
    }

    const container = document.getElementById('eventLogList');
    if (!container) return;

    container.innerHTML = this.eventLogStream
      .map(
        item => `
        <div class="log-entry">
          <span class="log-time">${item.time}</span>
          <span class="log-source" style="color: ${item.color}">[${item.source}]</span>
          <span class="log-msg">${item.message}</span>
        </div>
      `
      )
      .join('');
  }

  sampleTelemetry(hands, timestamp) {
    for (const h of hands) {
      this.telemetryRecords.push({
        timestamp: new Date().toISOString(),
        relTimeMs: Math.round(timestamp - this.sessionStartTime),
        hand: h.handedness,
        gesture: h.gesture.name,
        activity: h.activity.name,
        speedPxPerSec: h.speedPxPerSec,
        zone: h.zone.code,
        openness: h.extensions.openness,
        wristX: h.landmarks[0].x.toFixed(4),
        wristY: h.landmarks[0].y.toFixed(4),
        wristZ: (h.landmarks[0].z || 0).toFixed(4),
        thumbExt: h.extensions.thumb,
        indexExt: h.extensions.index,
        middleExt: h.extensions.middle,
        ringExt: h.extensions.ring,
        pinkyExt: h.extensions.pinky
      });
    }
  }

  exportCSV() {
    if (this.telemetryRecords.length === 0) {
      alert('No telemetry records captured yet. Allow tracking to run for a few seconds.');
      return;
    }

    const headers = Object.keys(this.telemetryRecords[0]);
    const csvRows = [headers.join(',')];

    for (const row of this.telemetryRecords) {
      const values = headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`);
      csvRows.push(values.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand-activity-telemetry-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.addEventLog('EXPORT', `Saved ${this.telemetryRecords.length} records to CSV`, '#f59e0b');
  }

  exportJSON() {
    if (this.telemetryRecords.length === 0) {
      alert('No telemetry records captured yet.');
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      summary: {
        activeTimeMs: Math.round(this.activeTimeMs),
        idleTimeMs: Math.round(this.idleTimeMs),
        peakSpeedPx: this.peakSpeedPx,
        gestureTransitions: this.gestureChangeCount,
        zoneHeatmap: this.renderer.getZonePercentages()
      },
      records: this.telemetryRecords
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand-activity-session-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.addEventLog('EXPORT', 'Session exported as JSON archive', '#f59e0b');
  }

  captureSnapshot() {
    const dataUrl = this.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `hand-activity-snapshot-${Date.now()}.png`;
    a.click();
    this.addEventLog('SNAPSHOT', 'Captured PNG snapshot of telemetry viewport', '#a855f7');
  }

  resetSession() {
    this.telemetryRecords = [];
    this.eventLogStream = [];
    this.activeTimeMs = 0;
    this.idleTimeMs = 0;
    this.peakSpeedPx = 0;
    this.gestureChangeCount = 0;
    this.leftTracker = new HandKinematicTracker('Left');
    this.rightTracker = new HandKinematicTracker('Right');
    this.renderer.resetZoneHeatmap();
    this.updateSessionStatsDOM();
    this.updateSpatialHeatmapDOM();
    this.addEventLog('SYSTEM', 'Session statistics and telemetry buffer reset', '#00f0ff');
  }

  bindUIEvents() {
    // Mode toggles
    document.getElementById('btnStartWebcam')?.addEventListener('click', () => {
      const deviceId = document.getElementById('cameraSelect')?.value;
      this.startWebcam(deviceId);
    });

    document.getElementById('btnStartSimulator')?.addEventListener('click', () => {
      this.stopWebcam();
      this.setMode('SIMULATOR');
      this.addEventLog('SYSTEM', 'Switched to 3D Landmark Simulator', '#00f0ff');
    });

    document.getElementById('cameraSelect')?.addEventListener('change', e => {
      if (this.mode === 'WEBCAM') {
        this.startWebcam(e.target.value);
      }
    });

    // Viewport Display Layer Checkboxes
    const layerBindings = [
      ['chkSkeleton', 'showSkeleton'],
      ['chkBBox', 'showBBox'],
      ['chkZones', 'showZones'],
      ['chkTrails', 'showTrails'],
      ['chkVectors', 'showVectors'],
      ['chkPinchCaliper', 'showPinchCaliper'],
      ['chkLandmarkLabels', 'showLandmarkLabels'],
      ['chkMirror', 'mirror'],
      ['chkDimVideo', 'dimVideo']
    ];

    for (const [id, optKey] of layerBindings) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', e => {
          this.renderer.setOption(optKey, e.target.checked);
        });
      }
    }

    // Action buttons
    document.getElementById('btnExportCSV')?.addEventListener('click', () => this.exportCSV());
    document.getElementById('btnExportJSON')?.addEventListener('click', () => this.exportJSON());
    document.getElementById('btnSnapshot')?.addEventListener('click', () => this.captureSnapshot());
    document.getElementById('btnResetSession')?.addEventListener('click', () => this.resetSession());

    // Fullscreen button
    document.getElementById('btnFullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }
}

// Bootstrap once DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new HandActivityTrackerApp();
  window.app.init();
});



})();
