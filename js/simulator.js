/**
 * Procedural 21-Point 3D Hand Skeleton Simulator
 * Generates realistic Left and Right hand landmark trajectories, finger articulation,
 * and interactive cursor-controlled hand poses for testing without or alongside a webcam.
 */

export const SIMULATION_MODES = {
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
export function buildHandSkeleton({
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

export class HandActivitySimulator {
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

