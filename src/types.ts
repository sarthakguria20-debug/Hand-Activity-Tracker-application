export interface ActivityLog {
  id: string;
  name: string;
  timestamp: Date;
  durationMs?: number;
  intensity: 'Low' | 'Medium' | 'High';
  description: string;
}

export type ActivityType =
  | 'Resting (Idle)'
  | 'Waving Hand'
  | 'Clapping Hands'
  | 'Nodding Head'
  | 'Shaking Head'
  | 'Fist Bump'
  | 'Thumbs Up'
  | 'Thumbs Down'
  | 'Peace Sign'
  | 'OK Sign'
  | 'Surprised Face'
  | 'Smiling Face';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface RecognitionStats {
  clapsCount: number;
  wavesCount: number;
  nodsCount: number;
  shakesCount: number;
  fistBumpsCount: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  peaceCount: number;
  okCount: number;
  smilesCount: number;
  surprisesCount: number;
  totalActiveTimeSeconds: number;
}

export interface RenderingOptions {
  showFaceMesh: boolean;
  showHandSkeleton: boolean;
  showBoundingBoxes: boolean;
  showLandmarkDots: boolean;
  mirrorCamera: boolean;
  simplifiedMesh: boolean;
}

export interface ClassifierState {
  currentActivity: ActivityType;
  confidence: number;
  metrics: {
    handDistance: number;
    handSpeed: number;
    headPitchVelocity: number;
    headYawVelocity: number;
    smileRatio: number;
    surpriseRatio: number;
  };
}
