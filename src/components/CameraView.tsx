import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import { Camera, RefreshCw, AlertTriangle, Video, Eye, EyeOff, Check, Flame } from 'lucide-react';
import { Landmark, RenderingOptions, ActivityType, ClassifierState } from '../types';
import { ActivityClassifier } from '../utils/activityClassifier';

interface CameraViewProps {
  renderingOptions: RenderingOptions;
  onActivityUpdate: (state: ClassifierState) => void;
  onEventTriggered: (events: {
    clap: boolean;
    wave: boolean;
    nod: boolean;
    shake: boolean;
    smile: boolean;
    surprise: boolean;
  }) => void;
  onCoordinatesUpdate?: (coords: any) => void;
  onFpsUpdate?: (fps: number) => void;
}

export default function CameraView({
  renderingOptions,
  onActivityUpdate,
  onEventTriggered,
  onCoordinatesUpdate,
  onFpsUpdate,
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [loadingStep, setLoadingStep] = useState<string>('Initializing...');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(0);
  const [currentLabel, setCurrentLabel] = useState<string>('Resting (Idle)');
  const [currentConfidence, setCurrentConfidence] = useState<number>(0);

  // References for MediaPipe models
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const classifierRef = useRef<ActivityClassifier | null>(null);
  const requestRef = useRef<number | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // FPS calculations
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const fpsIntervalRef = useRef<number>(0);
  const lastCoordsSentRef = useRef<number>(0);

  useEffect(() => {
    classifierRef.current = new ActivityClassifier();
    
    // Start loading MediaPipe models
    const initMediaPipe = async () => {
      try {
        setLoadingStep('Loading WebAssembly modules...');
        setLoadingProgress(15);
        
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
        );

        setLoadingStep('Downloading Hand Landmarker Model (float16)...');
        setLoadingProgress(45);
        
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });
        handLandmarkerRef.current = handLandmarker;

        setLoadingStep('Downloading Face Mesh Model (float16)...');
        setLoadingProgress(80);

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        faceLandmarkerRef.current = faceLandmarker;

        setLoadingStep('Assembling tracking nodes...');
        setLoadingProgress(95);
        
        setIsLoaded(true);
        setLoadingProgress(100);
        
        // Auto-start camera once models are ready
        startCamera();
      } catch (err: any) {
        console.error('Error initializing MediaPipe:', err);
        setErrorMessage(
          `Failed to load Computer Vision models: ${err.message || err}. Please ensure you are connected to the internet and try reloading.`
        );
      }
    };

    initMediaPipe();

    return () => {
      stopTracking();
      stopCamera();
    };
  }, []);

  // Sync animation loops when components are ready
  useEffect(() => {
    if (isLoaded && cameraActive) {
      stopTracking();
      startTrackingLoop();
    }
  }, [isLoaded, cameraActive, renderingOptions]);

  const startCamera = async () => {
    setErrorMessage(null);
    setLoadingStep('Requesting webcam access...');
    
    try {
      if (activeStreamRef.current) {
        stopCamera();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      activeStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setCameraActive(true);
            setLoadingStep('');
          });
        };
      }
    } catch (err: any) {
      console.error('Webcam Access Error:', err);
      setCameraActive(false);
      setErrorMessage(
        'Webcam access denied or unavailable. Please enable camera permissions in your browser and refresh the application to allow real-time landmark tracking.'
      );
    }
  };

  const stopCamera = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    setCameraActive(false);
  };

  const startTrackingLoop = () => {
    lastFrameTimeRef.current = performance.now();
    fpsIntervalRef.current = lastFrameTimeRef.current;
    frameCountRef.current = 0;
    
    const renderLoop = () => {
      processFrame();
      requestRef.current = requestAnimationFrame(renderLoop);
    };

    requestRef.current = requestAnimationFrame(renderLoop);
  };

  const stopTracking = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
  };

  const processFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!video || !canvas || !ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    // Set canvas sizing to match video aspect
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // FPS Counter
    const now = performance.now();
    frameCountRef.current++;
    if (now - fpsIntervalRef.current >= 1000) {
      const computedFps = Math.round((frameCountRef.current * 1000) / (now - fpsIntervalRef.current));
      setFps(computedFps);
      onFpsUpdate?.(computedFps);
      frameCountRef.current = 0;
      fpsIntervalRef.current = now;
    }

    const timestamp = video.currentTime * 1000;

    // Detect landmarks
    let handLandmarksResult: any = null;
    let faceLandmarksResult: any = null;

    if (handLandmarkerRef.current) {
      handLandmarksResult = handLandmarkerRef.current.detectForVideo(video, timestamp);
    }
    if (faceLandmarkerRef.current) {
      faceLandmarksResult = faceLandmarkerRef.current.detectForVideo(video, timestamp);
    }

    // Structure Landmarks for classification
    let leftHand: Landmark[] | undefined;
    let rightHand: Landmark[] | undefined;

    if (handLandmarksResult && handLandmarksResult.landmarks) {
      handLandmarksResult.landmarks.forEach((landmarks: Landmark[], idx: number) => {
        const handType = handLandmarksResult.handedness[idx]?.[0]?.categoryName;
        if (handType === 'Left') {
          leftHand = landmarks;
        } else {
          rightHand = landmarks;
        }
      });
    }

    let face: Landmark[] | undefined;
    if (faceLandmarksResult && faceLandmarksResult.faceLandmarks?.[0]) {
      face = faceLandmarksResult.faceLandmarks[0];
    }

    // Update Classification Engine
    if (classifierRef.current) {
      const state = classifierRef.current.update(face, leftHand, rightHand);
      onActivityUpdate(state);
      setCurrentLabel(state.currentActivity);
      setCurrentConfidence(Math.round(state.confidence * 100));

      // Extract events
      const events = classifierRef.current.checkEventsTriggered();
      if (events.clap || events.wave || events.nod || events.shake || events.smile || events.surprise) {
        onEventTriggered(events);
      }
    }

    // Extract coordinate telemetry for the High Density sidebar
    const nowMs = performance.now();
    if (!lastCoordsSentRef.current || nowMs - lastCoordsSentRef.current > 100) {
      lastCoordsSentRef.current = nowMs;
      const coords = {
        L_EYE_O: face?.[33] ? { x: face[33].x, y: face[33].y, z: face[33].z } : null,
        R_EYE_O: face?.[263] ? { x: face[263].x, y: face[263].y, z: face[263].z } : null,
        WRIST_R: rightHand?.[0] ? { x: rightHand[0].x, y: rightHand[0].y, z: rightHand[0].z } : null,
        THUMB_T: rightHand?.[4] ? { x: rightHand[4].x, y: rightHand[4].y, z: rightHand[4].z } : null,
        ELBOW_L: leftHand?.[0] ? { x: leftHand[0].x, y: leftHand[0].y, z: leftHand[0].z } : null,
      };
      onCoordinatesUpdate?.(coords);
    }

    // Render Overlays
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mirroring transform if needed
    ctx.save();
    if (renderingOptions.mirrorCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // Draw raw video to canvas background
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Draw Face Landmarks Mesh
    if (renderingOptions.showFaceMesh && face) {
      drawFaceMesh(ctx, face, renderingOptions.simplifiedMesh);
    }

    // Draw Hand skeletons
    if (renderingOptions.showHandSkeleton && handLandmarksResult?.landmarks) {
      drawHands(ctx, handLandmarksResult.landmarks, handLandmarksResult.handedness, renderingOptions.showLandmarkDots);
    }

    ctx.restore();
  };

  // Visual Renderer: Face Mesh (optimized drawing)
  const drawFaceMesh = (ctx: CanvasRenderingContext2D, landmarks: Landmark[], simplified: boolean) => {
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.2)'; // Cyber Cyan
    ctx.lineWidth = 0.5;

    // To prevent token/CPU lag we can draw a simplified wireframe of outline + features
    // Key facial regions paths
    const silhouette = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
    ];
    const lipsOuter = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
    const leftEyeBrow = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
    const rightEyeBrow = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
    const leftEye = [33, 160, 158, 133, 153, 144];
    const rightEye = [263, 387, 385, 362, 380, 373];

    const drawClosedPath = (indices: number[], color: string, width: number, fill = false) => {
      ctx.beginPath();
      indices.forEach((idx, i) => {
        const pt = landmarks[idx];
        if (pt) {
          const x = pt.x * ctx.canvas.width;
          const y = pt.y * ctx.canvas.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      });
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      if (fill) {
        ctx.fillStyle = 'rgba(14, 165, 233, 0.05)';
        ctx.fill();
      }
    };

    if (simplified) {
      // Draw silhouette
      drawClosedPath(silhouette, 'rgba(14, 165, 233, 0.25)', 0.8);
      // Lips
      drawClosedPath(lipsOuter, 'rgba(236, 72, 153, 0.4)', 1);
      // Eyebrows
      drawClosedPath(leftEyeBrow, 'rgba(14, 165, 233, 0.3)', 0.8);
      drawClosedPath(rightEyeBrow, 'rgba(14, 165, 233, 0.3)', 0.8);
      // Eyes
      drawClosedPath(leftEye, 'rgba(34, 197, 94, 0.4)', 1);
      drawClosedPath(rightEye, 'rgba(34, 197, 94, 0.4)', 1);
    } else {
      // Draw standard triangulation using step skips to render the 3D-mesh quickly and cleanly
      ctx.beginPath();
      // Draw face mesh connection grid in rows
      for (let i = 0; i < landmarks.length; i += 4) {
        const pt1 = landmarks[i];
        const pt2 = landmarks[(i + 1) % landmarks.length];
        if (pt1 && pt2) {
          ctx.moveTo(pt1.x * ctx.canvas.width, pt1.y * ctx.canvas.height);
          ctx.lineTo(pt2.x * ctx.canvas.width, pt2.y * ctx.canvas.height);
        }
      }
      ctx.stroke();

      // Bold highlighting around facial feature contours
      drawClosedPath(lipsOuter, 'rgba(244, 63, 94, 0.7)', 1.2, true); // Hot Pink Lips
      drawClosedPath(leftEye, 'rgba(14, 165, 233, 0.8)', 1.2); // Cyan Eyes
      drawClosedPath(rightEye, 'rgba(14, 165, 233, 0.8)', 1.2);
      drawClosedPath(leftEyeBrow, 'rgba(168, 85, 247, 0.8)', 1.2); // Purple Eyebrows
      drawClosedPath(rightEyeBrow, 'rgba(168, 85, 247, 0.8)', 1.2);
    }

    // Nose pointer axis to represent 3D orientation
    const nose = landmarks[4];
    const forehead = landmarks[10];
    if (nose && forehead) {
      const nx = nose.x * ctx.canvas.width;
      const ny = nose.y * ctx.canvas.height;
      const fx = forehead.x * ctx.canvas.width;
      const fy = forehead.y * ctx.canvas.height;
      
      // Calculate perpendicular/pose normal vector
      const angle = Math.atan2(ny - fy, nx - fx);
      
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx + Math.cos(angle) * 30, ny + Math.sin(angle) * 30);
      ctx.strokeStyle = '#eab308'; // Amber normal
      ctx.lineWidth = 2;
      ctx.stroke();

      // Glowing dot on nose
      ctx.beginPath();
      ctx.arc(nx, ny, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#eab308';
      ctx.fill();
    }
  };

  // Visual Renderer: Hand Skeleton
  const drawHands = (
    ctx: CanvasRenderingContext2D,
    hands: Landmark[][],
    handedness: any[][],
    drawDots: boolean
  ) => {
    // MediaPipe Hand landmarker connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // index
      [5, 9], [9, 10], [10, 11], [11, 12], // middle
      [9, 13], [13, 14], [14, 15], [15, 16], // ring
      [13, 17], [17, 18], [18, 19], [19, 20], // pinky
      [0, 17] // palm base
    ];

    hands.forEach((hand, hIdx) => {
      const label = handedness[hIdx]?.[0]?.categoryName || 'Hand';
      const isLeft = label === 'Left';
      
      // Cyber colors: Left hand is Neon Pink, Right hand is Neon Cyan/Green
      const handColor = isLeft ? '#ec4899' : '#10b981';
      const glowColor = isLeft ? 'rgba(236, 72, 153, 0.5)' : 'rgba(16, 185, 129, 0.5)';

      // Draw skeleton paths
      ctx.shadowBlur = 8;
      ctx.shadowColor = handColor;
      ctx.strokeStyle = handColor;
      ctx.lineWidth = 3;

      connections.forEach(([p1, p2]) => {
        const pt1 = hand[p1];
        const pt2 = hand[p2];
        if (pt1 && pt2) {
          ctx.beginPath();
          ctx.moveTo(pt1.x * ctx.canvas.width, pt1.y * ctx.canvas.height);
          ctx.lineTo(pt2.x * ctx.canvas.width, pt2.y * ctx.canvas.height);
          ctx.stroke();
        }
      });

      // Clear shadows for dots and text to preserve performance
      ctx.shadowBlur = 0;

      // Draw landmark dots
      if (drawDots) {
        hand.forEach((pt, pIdx) => {
          const isTip = [4, 8, 12, 16, 20].includes(pIdx);
          ctx.beginPath();
          ctx.arc(pt.x * ctx.canvas.width, pt.y * ctx.canvas.height, isTip ? 5 : 3, 0, 2 * Math.PI);
          ctx.fillStyle = isTip ? '#ffffff' : handColor;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = isTip ? 1.5 : 0.5;
          ctx.fill();
          ctx.stroke();
        });
      }

      // Draw Hand Label Card at Wrist (landmark 0)
      const wrist = hand[0];
      if (wrist) {
        const wx = wrist.x * ctx.canvas.width;
        const wy = wrist.y * ctx.canvas.height;
        
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = handColor;
        ctx.lineWidth = 1.5;
        
        const cardW = 64;
        const cardH = 20;
        const cardX = wx - cardW / 2;
        const cardY = wy + 15;

        // Draw pill-box
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 4);
        ctx.fill();
        ctx.stroke();

        // Text labels inside the frame (drawn flat without mirror issues)
        ctx.save();
        // Since we are mirrored, text might be drawn backwards. We handle drawing cleanly:
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Mirror text draw back if mirrored to keep it highly readable
        if (renderingOptions.mirrorCamera) {
          ctx.translate(wx, cardY + cardH/2);
          ctx.scale(-1, 1);
          ctx.fillText(label, 0, 0);
        } else {
          ctx.fillText(label, wx, cardY + cardH / 2);
        }
        ctx.restore();
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 w-full" id="camera-column-group">
      <div className="relative w-full aspect-[4/3] bg-black rounded border border-[#30363D] overflow-hidden group shadow-md" id="camera-viewport-card">
        {/* Real-time Video Element (Hidden, piped to canvas) */}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
          muted
        />

        {/* Primary Rendering Stage */}
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-cover transition-transform duration-500 ${
            renderingOptions.mirrorCamera ? 'scale-x-[-1]' : ''
          }`}
          id="landmarks-canvas-overlay"
        />

        {/* Loading Overlay */}
        {loadingProgress < 100 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0C10]/95 z-20 px-6 text-center">
            <div className="relative mb-6">
              <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <Camera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-400 w-6 h-6 animate-pulse" />
            </div>
            <h3 className="font-sans font-medium text-base text-slate-100 tracking-tight mb-2">
              Configuring Neural Tracking Vision
            </h3>
            <p className="font-mono text-[10px] text-blue-400 max-w-sm mb-4 h-5">
              {loadingStep}
            </p>
            <div className="w-48 bg-[#161B22] h-1.5 rounded overflow-hidden border border-[#30363D]">
              <div
                className="bg-blue-500 h-full rounded transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Message Panel */}
        {errorMessage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 z-30 px-6 text-center">
            <AlertTriangle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
            <h3 className="font-sans font-medium text-lg text-slate-100 tracking-tight mb-2">
              System Node Failure
            </h3>
            <p className="font-sans text-xs text-slate-400 max-w-md leading-relaxed mb-6">
              {errorMessage}
            </p>
            <button
              onClick={startCamera}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-sans text-xs font-semibold rounded shadow-lg hover:shadow-rose-600/20 transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4" />
              Re-Authorize Camera Access
            </button>
          </div>
        )}

        {/* Live HUD Status HUD */}
        {isLoaded && cameraActive && (
          <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none z-10 select-none">
            <div className="bg-[#0A0C10]/85 backdrop-blur px-2.5 py-1 rounded text-[10px] font-mono border border-emerald-500/50 text-emerald-400 shadow">
              CAM_01: MAIN_VIEW_EYE_LEVEL
            </div>
            <div className="bg-[#0A0C10]/85 backdrop-blur px-2.5 py-1 rounded text-[10px] font-mono border border-[#30363D] text-gray-400 shadow">
              FRAME_FPS: <span className="text-blue-400 font-bold">{fps}</span>
            </div>
          </div>
        )}

        {/* Confidence Display Overlay (Design HTML match) */}
        {isLoaded && cameraActive && (
          <div className="absolute bottom-4 right-4 text-right bg-[#0A0C10]/80 backdrop-blur px-3 py-1.5 rounded border border-[#30363D] z-10 select-none pointer-events-none">
            <p className="text-xl font-mono font-bold text-emerald-400 drop-shadow-lg uppercase leading-none">
              {currentLabel === 'Resting (Idle)' ? 'RESTING' : currentLabel.toUpperCase()}
            </p>
            <p className="text-[9px] text-emerald-500/80 uppercase tracking-widest font-mono mt-1">
              Confidence: {currentConfidence}%
            </p>
          </div>
        )}

        {/* Overlay controls when hovering */}
        {isLoaded && (
          <div className="absolute bottom-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
            <button
              onClick={() => {
                if (cameraActive) stopCamera();
                else startCamera();
              }}
              className={`flex items-center justify-center w-8 h-8 rounded border shadow backdrop-blur transition-all duration-200 cursor-pointer ${
                cameraActive
                  ? 'bg-[#21262D] border-[#30363D] hover:bg-[#30363D] text-slate-300'
                  : 'bg-blue-600 border-blue-500 hover:bg-blue-500 text-white'
              }`}
              title={cameraActive ? 'Turn Camera Off' : 'Turn Camera On'}
            >
              {cameraActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={startCamera}
              className="flex items-center justify-center w-8 h-8 bg-[#21262D] hover:bg-[#30363D] text-slate-300 border border-[#30363D] rounded shadow backdrop-blur transition-all duration-200 cursor-pointer"
              title="Reload Camera Stream"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Secondary Feeds representing face/hand mathematical projection */}
      <div className="h-[135px] flex gap-4">
        <div className="flex-1 bg-black rounded border border-[#30363D] relative overflow-hidden flex items-center justify-center">
           <div className="absolute inset-0 flex items-center justify-center opacity-75">
             <svg width="80" height="80" viewBox="0 0 100 100" className="stroke-blue-400 fill-none">
               <path d="M20 80 Q50 20 80 80" strokeWidth="1" className={currentLabel !== 'Resting (Idle)' ? 'stroke-blue-400' : 'stroke-blue-900'} />
               <circle cx="50" cy="50" r="5" fill={currentLabel !== 'Resting (Idle)' ? '#60a5fa' : '#1e3a8a'} className={currentLabel !== 'Resting (Idle)' ? 'animate-ping [animation-duration:2s]' : ''} />
               <circle cx="25" cy="70" r="3" fill={currentLabel !== 'Resting (Idle)' ? '#60a5fa' : '#1e3a8a'} />
               <circle cx="75" cy="70" r="3" fill={currentLabel !== 'Resting (Idle)' ? '#60a5fa' : '#1e3a8a'} />
             </svg>
           </div>
           <span className="absolute top-2 left-2 text-[9px] text-blue-400 font-mono tracking-wider font-semibold">FACE MESH</span>
           {currentLabel !== 'Resting (Idle)' && (
             <span className="absolute bottom-2 right-2 text-[8px] text-emerald-400 font-mono animate-pulse">ACTIVE</span>
           )}
        </div>
        <div className="flex-1 bg-black rounded border border-[#30363D] relative overflow-hidden flex items-center justify-center">
           <div className="absolute inset-0 flex items-center justify-center opacity-75">
             <svg width="80" height="80" viewBox="0 0 100 100" className="stroke-amber-400 fill-none">
               <path d="M30 70 L30 40 L50 30 L70 40 L70 70" strokeWidth="1" className={currentLabel !== 'Resting (Idle)' ? 'stroke-amber-400' : 'stroke-amber-900'} />
               <circle cx="30" cy="40" r="3" fill={currentLabel !== 'Resting (Idle)' ? '#fbbf24' : '#78350f'} />
               <circle cx="50" cy="30" r="3" fill={currentLabel !== 'Resting (Idle)' ? '#fbbf24' : '#78350f'} />
               <circle cx="70" cy="40" r="3" fill={currentLabel !== 'Resting (Idle)' ? '#fbbf24' : '#78350f'} />
             </svg>
           </div>
           <span className="absolute top-2 left-2 text-[9px] text-amber-400 font-mono tracking-wider font-semibold">HAND POSE</span>
           {currentLabel !== 'Resting (Idle)' && (
             <span className="absolute bottom-2 right-2 text-[8px] text-amber-400 font-mono animate-pulse">ACTIVE</span>
           )}
        </div>
      </div>
    </div>
  );
}
