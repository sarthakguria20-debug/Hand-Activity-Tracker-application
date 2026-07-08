import { Landmark, ActivityType, ClassifierState } from '../types';

interface FrameState {
  timestamp: number;
  faceLandmarks?: Landmark[];
  leftHandLandmarks?: Landmark[];
  rightHandLandmarks?: Landmark[];
}

export class ActivityClassifier {
  private history: FrameState[] = [];
  private maxHistoryFrames = 30; // ~1 second at 30fps
  private lastActivity: ActivityType = 'Resting (Idle)';
  private lastActivityTime = Date.now();
  private activityDuration = 0;
  private clapCooldown = false;
  private nodCooldown = false;
  private shakeCooldown = false;
  private smileCooldown = false;
  private surpriseCooldown = false;
  private waveCooldown = false;

  // Smoothing weights
  private confidenceBuffer: { activity: ActivityType; confidence: number }[] = [];
  private readonly bufferSize = 10;

  constructor() {}

  /**
   * Add a frame to history and compute the current activity
   */
  public update(
    faceLandmarks?: Landmark[],
    leftHandLandmarks?: Landmark[],
    rightHandLandmarks?: Landmark[]
  ): ClassifierState {
    const now = Date.now();
    
    // Add to history
    this.history.push({
      timestamp: now,
      faceLandmarks,
      leftHandLandmarks,
      rightHandLandmarks,
    });

    if (this.history.length > this.maxHistoryFrames) {
      this.history.shift();
    }

    // Compute instantaneous scores
    const { activity, confidence, metrics } = this.analyzeCurrentFrame(
      faceLandmarks,
      leftHandLandmarks,
      rightHandLandmarks
    );

    // Apply smoothing to prevent flickering
    this.confidenceBuffer.push({ activity, confidence });
    if (this.confidenceBuffer.length > this.bufferSize) {
      this.confidenceBuffer.shift();
    }

    // Aggregate smoothed prediction
    const smoothed = this.getSmoothedActivity();

    // Track active durations
    if (smoothed.activity === this.lastActivity) {
      this.activityDuration = now - this.lastActivityTime;
    } else {
      this.lastActivity = smoothed.activity;
      this.lastActivityTime = now;
      this.activityDuration = 0;
    }

    return {
      currentActivity: smoothed.activity,
      confidence: smoothed.confidence,
      metrics,
    };
  }

  /**
   * Reset the classifier state
   */
  public reset(): void {
    this.history = [];
    this.confidenceBuffer = [];
    this.lastActivity = 'Resting (Idle)';
    this.lastActivityTime = Date.now();
    this.activityDuration = 0;
  }

  /**
   * Get cooldown statuses to trigger event counters
   */
  public checkEventsTriggered(): {
    clap: boolean;
    wave: boolean;
    nod: boolean;
    shake: boolean;
    smile: boolean;
    surprise: boolean;
  } {
    const events = {
      clap: false,
      wave: false,
      nod: false,
      shake: false,
      smile: false,
      surprise: false,
    };

    const current = this.lastActivity;

    // Clap Trigger (on entry)
    if (current === 'Clapping Hands') {
      if (!this.clapCooldown) {
        events.clap = true;
        this.clapCooldown = true;
      }
    } else {
      this.clapCooldown = false;
    }

    // Wave Trigger
    if (current === 'Waving Hand') {
      if (!this.waveCooldown) {
        events.wave = true;
        this.waveCooldown = true;
      }
    } else {
      this.waveCooldown = false;
    }

    // Nod Trigger
    if (current === 'Nodding Head') {
      if (!this.nodCooldown) {
        events.nod = true;
        this.nodCooldown = true;
      }
    } else {
      this.nodCooldown = false;
    }

    // Shake Trigger
    if (current === 'Shaking Head') {
      if (!this.shakeCooldown) {
        events.shake = true;
        this.shakeCooldown = true;
      }
    } else {
      this.shakeCooldown = false;
    }

    // Smile Trigger
    if (current === 'Smiling Face') {
      if (!this.smileCooldown) {
        events.smile = true;
        this.smileCooldown = true;
      }
    } else {
      this.smileCooldown = false;
    }

    // Surprise Trigger
    if (current === 'Surprised Face') {
      if (!this.surpriseCooldown) {
        events.surprise = true;
        this.surpriseCooldown = true;
      }
    } else {
      this.surpriseCooldown = false;
    }

    return events;
  }

  private analyzeCurrentFrame(
    face?: Landmark[],
    leftHand?: Landmark[],
    rightHand?: Landmark[]
  ): { activity: ActivityType; confidence: number; metrics: any } {
    // 1. Calculate base metrics
    const faceMetrics = this.analyzeFace(face);
    const handMetrics = this.analyzeHands(leftHand, rightHand);
    const temporalMetrics = this.analyzeTemporalMotion();

    // 2. Aggregate metrics for classification decision
    const metrics = {
      handDistance: handMetrics.interHandDistance,
      handSpeed: Math.max(temporalMetrics.leftHandVelocity, temporalMetrics.rightHandVelocity),
      headPitchVelocity: temporalMetrics.headPitchVelocity,
      headYawVelocity: temporalMetrics.headYawVelocity,
      smileRatio: faceMetrics.smileRatio,
      surpriseRatio: faceMetrics.surpriseRatio,
    };

    // 3. Determine the activity based on hierarchical rules
    let activity: ActivityType = 'Resting (Idle)';
    let confidence = 1.0;

    // Check hand gestures first as they are highly deliberate
    const leftGesture = leftHand ? this.classifyHandGesture(leftHand) : null;
    const rightGesture = rightHand ? this.classifyHandGesture(rightHand) : null;

    const activeGesture = rightGesture || leftGesture;

    // Periodic actions (Waving, Clapping)
    if (leftHand && rightHand && handMetrics.isClapping) {
      activity = 'Clapping Hands';
      confidence = Math.min(1.0, handMetrics.clapConfidence);
    } else if (temporalMetrics.isWaving) {
      activity = 'Waving Hand';
      confidence = Math.min(1.0, temporalMetrics.waveConfidence);
    }
    // Specific hand shape gestures
    else if (activeGesture && activeGesture !== 'Unknown') {
      activity = activeGesture as ActivityType;
      confidence = 0.9;
    }
    // Head Movements
    else if (temporalMetrics.isNodding) {
      activity = 'Nodding Head';
      confidence = Math.min(1.0, temporalMetrics.nodConfidence);
    } else if (temporalMetrics.isShakingHead) {
      activity = 'Shaking Head';
      confidence = Math.min(1.0, temporalMetrics.shakeConfidence);
    }
    // Face Expressions
    else if (faceMetrics.isSurprised) {
      activity = 'Surprised Face';
      confidence = Math.min(1.0, faceMetrics.surpriseRatio * 3.5);
    } else if (faceMetrics.isSmiling) {
      activity = 'Smiling Face';
      confidence = Math.min(1.0, faceMetrics.smileRatio * 1.5);
    }

    return { activity, confidence, metrics };
  }

  private analyzeFace(face?: Landmark[]) {
    if (!face || face.length < 300) {
      return { smileRatio: 0, surpriseRatio: 0, isSmiling: false, isSurprised: false };
    }

    // Nose Tip (4)
    // Left eye outer (33), Right eye outer (263)
    // Left mouth corner (61), Right mouth corner (291)
    // Upper lip (0), Lower lip (17)

    const nose = face[4];
    const leftEye = face[33];
    const rightEye = face[263];
    const leftMouth = face[61];
    const rightMouth = face[291];
    const topLip = face[0];
    const bottomLip = face[17];

    // Reference dimensions to normalize scale
    const faceWidth = this.getDistance(leftEye, rightEye);
    if (faceWidth === 0) return { smileRatio: 0, surpriseRatio: 0, isSmiling: false, isSurprised: false };

    // Smile Ratio: distance between corners of mouth divided by face width
    const mouthWidth = this.getDistance(leftMouth, rightMouth);
    const smileRatio = mouthWidth / faceWidth;

    // Surprise Ratio: distance between top & bottom lip divided by face width
    const mouthHeight = this.getDistance(topLip, bottomLip);
    const surpriseRatio = mouthHeight / faceWidth;

    // Calibration offsets
    const isSmiling = smileRatio > 0.52; // Threshold for smile
    const isSurprised = surpriseRatio > 0.28; // Threshold for open mouth

    return {
      smileRatio,
      surpriseRatio,
      isSmiling,
      isSurprised,
    };
  }

  private analyzeHands(leftHand?: Landmark[], rightHand?: Landmark[]) {
    let interHandDistance = 999.0;
    let isClapping = false;
    let clapConfidence = 0.0;

    if (leftHand && rightHand) {
      const leftWrist = leftHand[0];
      const rightWrist = rightHand[0];
      interHandDistance = this.getDistance(leftWrist, rightWrist);

      // Clapping is dynamic, but we can look for hands being close together
      // and checking history for rapid distance changes
      if (interHandDistance < 0.25) {
        // Let's check hand distance velocity
        const prevDistances: number[] = [];
        for (let i = Math.max(0, this.history.length - 10); i < this.history.length; i++) {
          const f = this.history[i];
          if (f.leftHandLandmarks && f.rightHandLandmarks) {
            prevDistances.push(this.getDistance(f.leftHandLandmarks[0], f.rightHandLandmarks[0]));
          }
        }

        if (prevDistances.length >= 4) {
          // Calculate derivative/velocity of convergence
          let maxChange = 0;
          for (let i = 1; i < prevDistances.length; i++) {
            maxChange = Math.max(maxChange, Math.abs(prevDistances[i] - prevDistances[i - 1]));
          }
          if (maxChange > 0.04) {
            isClapping = true;
            clapConfidence = 0.75 + (maxChange * 3);
          }
        }
      }
    }

    return {
      interHandDistance,
      isClapping,
      clapConfidence,
    };
  }

  private classifyHandGesture(hand: Landmark[]): string {
    if (hand.length < 21) return 'Unknown';

    const wrist = hand[0];
    const thumbTip = hand[4];
    const thumbIP = hand[3];
    const thumbMCP = hand[2];
    
    const indexTip = hand[8];
    const indexPIP = hand[6];
    const indexMCP = hand[5];

    const middleTip = hand[12];
    const middlePIP = hand[10];
    const middleMCP = hand[9];

    const ringTip = hand[16];
    const ringPIP = hand[14];
    const ringMCP = hand[13];

    const pinkyTip = hand[20];
    const pinkyPIP = hand[18];
    const pinkyMCP = hand[17];

    // Check extended fingers (tip is further from wrist than knuckle PIP joint)
    const isIndexExtended = this.getDistance(indexTip, wrist) > this.getDistance(indexPIP, wrist);
    const isMiddleExtended = this.getDistance(middleTip, wrist) > this.getDistance(middlePIP, wrist);
    const isRingExtended = this.getDistance(ringTip, wrist) > this.getDistance(ringPIP, wrist);
    const isPinkyExtended = this.getDistance(pinkyTip, wrist) > this.getDistance(pinkyPIP, wrist);

    // 1. Fist / Fist Bump (all fingers curled, moving forward)
    const isFist = !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended;

    // 2. Peace Sign (Index + Middle extended, Ring + Pinky curled)
    const isPeace = isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended;

    // 3. OK Sign (Thumb tip close to Index tip, others extended)
    const thumbIndexDist = this.getDistance(thumbTip, indexTip);
    const isOK = thumbIndexDist < 0.04 && isMiddleExtended && isRingExtended && isPinkyExtended;

    // 4. Thumbs Up & Thumbs Down
    // Thumb extended, others curled
    const isThumbExtended = this.getDistance(thumbTip, wrist) > this.getDistance(thumbMCP, wrist);
    const othersCurled = !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended;
    
    if (isThumbExtended && othersCurled) {
      // Direction of thumb tip relative to IP joint/wrist
      const isUp = thumbTip.y < thumbIP.y && thumbIP.y < wrist.y;
      const isDown = thumbTip.y > thumbIP.y && thumbIP.y > wrist.y;

      if (isUp) return 'Thumbs Up';
      if (isDown) return 'Thumbs Down';
    }

    if (isFist) return 'Fist Bump';
    if (isPeace) return 'Peace Sign';
    if (isOK) return 'OK Sign';

    return 'Unknown';
  }

  private analyzeTemporalMotion() {
    let leftHandVelocity = 0;
    let rightHandVelocity = 0;
    let headPitchVelocity = 0;
    let headYawVelocity = 0;

    let isWaving = false;
    let waveConfidence = 0.0;
    let isNodding = false;
    let nodConfidence = 0.0;
    let isShakingHead = false;
    let shakeConfidence = 0.0;

    const len = this.history.length;
    if (len < 5) return {
      leftHandVelocity: 0,
      rightHandVelocity: 0,
      headPitchVelocity: 0,
      headYawVelocity: 0,
      isWaving,
      waveConfidence,
      isNodding,
      nodConfidence,
      isShakingHead,
      shakeConfidence
    };

    // 1. Calculate Instantaneous Velocities
    const lastFrame = this.history[len - 1];
    const prevFrame = this.history[len - 2];

    if (lastFrame.leftHandLandmarks && prevFrame.leftHandLandmarks) {
      leftHandVelocity = this.getDistance(lastFrame.leftHandLandmarks[0], prevFrame.leftHandLandmarks[0]);
    }
    if (lastFrame.rightHandLandmarks && prevFrame.rightHandLandmarks) {
      rightHandVelocity = this.getDistance(lastFrame.rightHandLandmarks[0], prevFrame.rightHandLandmarks[0]);
    }
    if (lastFrame.faceLandmarks && prevFrame.faceLandmarks && lastFrame.faceLandmarks[4] && prevFrame.faceLandmarks[4]) {
      const headLast = lastFrame.faceLandmarks[4];
      const headPrev = prevFrame.faceLandmarks[4];
      headPitchVelocity = Math.abs(headLast.y - headPrev.y);
      headYawVelocity = Math.abs(headLast.x - headPrev.x);
    }

    // 2. Wave Detection (rapid horizontal hand movement of wrist over last 15 frames)
    const waveHistory = this.history.slice(-15);
    let horizontalSwings = 0;
    let waveHandX: number[] = [];

    waveHistory.forEach((f) => {
      const activeHand = f.rightHandLandmarks || f.leftHandLandmarks;
      if (activeHand) {
        waveHandX.push(activeHand[0].x);
      }
    });

    if (waveHandX.length >= 8) {
      // Count direction switches (oscillations)
      let direction = 0; // 1: right, -1: left
      for (let i = 1; i < waveHandX.length; i++) {
        const diff = waveHandX[i] - waveHandX[i - 1];
        if (Math.abs(diff) > 0.015) {
          const currentDir = diff > 0 ? 1 : -1;
          if (direction !== 0 && currentDir !== direction) {
            horizontalSwings++;
          }
          direction = currentDir;
        }
      }

      if (horizontalSwings >= 2) {
        isWaving = true;
        waveConfidence = 0.5 + (horizontalSwings * 0.15);
      }
    }

    // 3. Nod / Shake Detection (Nose Tip 4 history)
    let headX: number[] = [];
    let headY: number[] = [];

    const headHistory = this.history.slice(-20);
    headHistory.forEach((f) => {
      if (f.faceLandmarks && f.faceLandmarks[4]) {
        headX.push(f.faceLandmarks[4].x);
        headY.push(f.faceLandmarks[4].y);
      }
    });

    if (headX.length >= 10) {
      let xOscillations = 0;
      let yOscillations = 0;

      let lastXDir = 0;
      let lastYDir = 0;

      for (let i = 1; i < headX.length; i++) {
        const dx = headX[i] - headX[i - 1];
        const dy = headY[i] - headY[i - 1];

        // Horizontal oscillation threshold
        if (Math.abs(dx) > 0.004) {
          const xDir = dx > 0 ? 1 : -1;
          if (lastXDir !== 0 && xDir !== lastXDir) xOscillations++;
          lastXDir = xDir;
        }

        // Vertical oscillation threshold
        if (Math.abs(dy) > 0.004) {
          const yDir = dy > 0 ? 1 : -1;
          if (lastYDir !== 0 && yDir !== lastYDir) yOscillations++;
          lastYDir = yDir;
        }
      }

      // Nodding is primary vertical movement with multiple switches
      if (yOscillations >= 2 && xOscillations < yOscillations) {
        isNodding = true;
        nodConfidence = 0.4 + (yOscillations * 0.15);
      } 
      // Shaking head is primary horizontal movement
      else if (xOscillations >= 2 && yOscillations < xOscillations) {
        isShakingHead = true;
        shakeConfidence = 0.4 + (xOscillations * 0.15);
      }
    }

    return {
      leftHandVelocity,
      rightHandVelocity,
      headPitchVelocity,
      headYawVelocity,
      isWaving,
      waveConfidence,
      isNodding,
      nodConfidence,
      isShakingHead,
      shakeConfidence,
    };
  }

  private getSmoothedActivity(): { activity: ActivityType; confidence: number } {
    if (this.confidenceBuffer.length === 0) {
      return { activity: 'Resting (Idle)', confidence: 1.0 };
    }

    // Tally votes weighted by confidence
    const votes: Record<string, number> = {};
    this.confidenceBuffer.forEach((vote) => {
      votes[vote.activity] = (votes[vote.activity] || 0) + vote.confidence;
    });

    let bestActivity: ActivityType = 'Resting (Idle)';
    let maxVotes = 0;

    Object.keys(votes).forEach((key) => {
      if (votes[key] > maxVotes) {
        maxVotes = votes[key];
        bestActivity = key as ActivityType;
      }
    });

    const averageConfidence = maxVotes / this.confidenceBuffer.filter((v) => v.activity === bestActivity).length;

    return {
      activity: bestActivity,
      confidence: Math.min(1.0, averageConfidence),
    };
  }

  private getDistance(a: Landmark, b: Landmark): number {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    );
  }
}
