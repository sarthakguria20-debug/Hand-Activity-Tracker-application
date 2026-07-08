import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Camera,
  Layers,
  Settings,
  Eye,
  RotateCcw,
  Volume2,
  VolumeX,
  Smartphone,
  Check,
  Zap,
  Dumbbell,
  Clock,
  HeartPulse,
} from 'lucide-react';
import CameraView from './components/CameraView';
import ActivityDashboard from './components/ActivityDashboard';
import InstructionCard from './components/InstructionCard';
import { RenderingOptions, ClassifierState, RecognitionStats, ActivityLog, ActivityType } from './types';

export default function App() {
  // Rendering options state
  const [renderingOptions, setRenderingOptions] = useState<RenderingOptions>({
    showFaceMesh: true,
    showHandSkeleton: true,
    showBoundingBoxes: false,
    showLandmarkDots: true,
    mirrorCamera: true,
    simplifiedMesh: false,
  });

  // Current classifier result
  const [classifierState, setClassifierState] = useState<ClassifierState | null>(null);

  // Active tracking stats
  const [stats, setStats] = useState<RecognitionStats>({
    clapsCount: 0,
    wavesCount: 0,
    nodsCount: 0,
    shakesCount: 0,
    fistBumpsCount: 0,
    thumbsUpCount: 0,
    thumbsDownCount: 0,
    peaceCount: 0,
    okCount: 0,
    smilesCount: 0,
    surprisesCount: 0,
    totalActiveTimeSeconds: 0,
  });

  // Log stream
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  // Sound effects state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  // Time elapsed in session
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);

  // Live coordinates tracking for high-density sidebar
  const [liveCoordinates, setLiveCoordinates] = useState<any>(null);

  // Sound generator (using Web Audio API synthesizers so it's fully client-side and requires no files!)
  const playTriggerSound = (frequency: number, type: 'sine' | 'triangle' | 'sawtooth' | 'square' = 'sine', duration = 0.1) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      
      // Decay envelope
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.error('Audio synthesizer blocked or error:', e);
    }
  };

  // Active Session duration timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync state transitions and increment event logs
  const handleEventTriggered = (events: {
    clap: boolean;
    wave: boolean;
    nod: boolean;
    shake: boolean;
    smile: boolean;
    surprise: boolean;
  }) => {
    const timestamp = new Date();
    const id = Math.random().toString(36).substring(2, 9);

    if (events.clap) {
      playTriggerSound(523.25, 'triangle', 0.15); // C5 note
      setStats((prev) => ({ ...prev, clapsCount: prev.clapsCount + 1 }));
      setLogs((prev) => [
        {
          id,
          name: 'Clapping Hands',
          timestamp,
          intensity: 'Medium',
          description: 'Rhythmic hands clapping sequence registered in tracking scope.',
        },
        ...prev.slice(0, 49),
      ]);
    }

    if (events.wave) {
      playTriggerSound(392.00, 'sine', 0.2); // G4 note
      setStats((prev) => ({ ...prev, wavesCount: prev.wavesCount + 1 }));
      setLogs((prev) => [
        {
          id,
          name: 'Waving Hand',
          timestamp,
          intensity: 'High',
          description: 'High velocity lateral waving gesture matched successfully.',
        },
        ...prev.slice(0, 49),
      ]);
    }

    if (events.nod) {
      playTriggerSound(329.63, 'sine', 0.15); // E4 note
      setStats((prev) => ({ ...prev, nodsCount: prev.nodsCount + 1 }));
      setLogs((prev) => [
        {
          id,
          name: 'Nodding Head',
          timestamp,
          intensity: 'Low',
          description: 'Positive pitch axis nodding transition logged.',
        },
        ...prev.slice(0, 49),
      ]);
    }

    if (events.shake) {
      playTriggerSound(293.66, 'sine', 0.15); // D4 note
      setStats((prev) => ({ ...prev, shakesCount: prev.shakesCount + 1 }));
      setLogs((prev) => [
        {
          id,
          name: 'Shaking Head',
          timestamp,
          intensity: 'Low',
          description: 'Lateral yaw axis head shake transition logged.',
        },
        ...prev.slice(0, 49),
      ]);
    }

    if (events.smile) {
      playTriggerSound(659.25, 'sine', 0.25); // E5 note
      setStats((prev) => ({ ...prev, smilesCount: prev.smilesCount + 1 }));
      setLogs((prev) => [
        {
          id,
          name: 'Smiling Face',
          timestamp,
          intensity: 'Low',
          description: 'Bilateral lips corner horizontal expansion matched as a wide smile.',
        },
        ...prev.slice(0, 49),
      ]);
    }

    if (events.surprise) {
      playTriggerSound(440.00, 'triangle', 0.25); // A4 note
      setStats((prev) => ({ ...prev, surprisesCount: prev.surprisesCount + 1 }));
      setLogs((prev) => [
        {
          id,
          name: 'Surprised Face',
          timestamp,
          intensity: 'Medium',
          description: 'Vertical jaw extension matched as an open mouth surprise factor.',
        },
        ...prev.slice(0, 49),
      ]);
    }
  };

  // Listen to changes in the general continuous state (for non-interval static signs like peace, OK, thumbs up/down, fist bumps)
  useEffect(() => {
    if (!classifierState) return;
    const current = classifierState.currentActivity;
    
    // Check if current is a static sign and handle counting with a minor cooldown / log check
    const isSign = ['Thumbs Up', 'Thumbs Down', 'Fist Bump', 'Peace Sign', 'OK Sign'].includes(current);
    if (!isSign) return;

    // Check if the sign is already logged recently (within 4 seconds) to avoid spam
    const lastLogOfSameType = logs.find((l) => l.name === current);
    const timeSinceLast = lastLogOfSameType ? Date.now() - new Date(lastLogOfSameType.timestamp).getTime() : 999999;

    if (timeSinceLast > 3500) {
      const timestamp = new Date();
      const id = Math.random().toString(36).substring(2, 9);
      
      // Update specific counters
      setStats((prev) => {
        const next = { ...prev };
        if (current === 'Thumbs Up') next.thumbsUpCount++;
        else if (current === 'Thumbs Down') next.thumbsDownCount++;
        else if (current === 'Fist Bump') next.fistBumpsCount++;
        else if (current === 'Peace Sign') next.peaceCount++;
        else if (current === 'OK Sign') next.okCount++;
        return next;
      });

      playTriggerSound(587.33, 'sine', 0.12); // D5 note

      setLogs((prev) => [
        {
          id,
          name: current,
          timestamp,
          intensity: 'Low',
          description: `Static gesture sign "${current}" held and locked in current tracking viewport.`,
        },
        ...prev.slice(0, 49),
      ]);
    }
  }, [classifierState?.currentActivity]);

  const handleResetStats = () => {
    setStats({
      clapsCount: 0,
      wavesCount: 0,
      nodsCount: 0,
      shakesCount: 0,
      fistBumpsCount: 0,
      thumbsUpCount: 0,
      thumbsDownCount: 0,
      peaceCount: 0,
      okCount: 0,
      smilesCount: 0,
      surprisesCount: 0,
      totalActiveTimeSeconds: 0,
    });
    setLogs([]);
    setSessionSeconds(0);
    playTriggerSound(220.00, 'sawtooth', 0.2); // Low A3 note
  };

  const formatSessionTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-slate-100 flex flex-col font-sans" id="app-root-frame">
      {/* 1. Header Navigation Bar */}
      <header className="sticky top-0 bg-black border-b border-[#30363D] px-4 py-3.5 z-40" id="global-navbar">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 rounded">
              <Layers className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h1 className="font-sans font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                NEURAL LANDMARK RUNTIME
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest font-black">
                  v1.2
                </span>
              </h1>
              <p className="font-sans text-[10px] text-gray-400">
                Face and Hand Landmarks Detection • Human Activity Recognition
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Audio Feedback Controller */}
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) {
                  setTimeout(() => playTriggerSound(523.25, 'sine', 0.1), 0);
                  setTimeout(() => playTriggerSound(659.25, 'sine', 0.15), 100);
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[9px] font-bold tracking-wider transition-all duration-200 cursor-pointer ${
                soundEnabled
                  ? 'bg-blue-500/10 border-blue-400/40 text-blue-400'
                  : 'bg-[#21262D] border-[#30363D] text-gray-400 hover:text-white'
              }`}
              title={soundEnabled ? 'Disable Audio Synthesizer' : 'Enable Audio Synthesizer'}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  AUDIO: ON
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  AUDIO: MUTED
                </>
              )}
            </button>

            {/* Session Timer HUD */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#21262D] rounded border border-[#30363D]">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-mono text-[10px] font-bold text-gray-300">
                {formatSessionTime(sessionSeconds)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Primary Body Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-4 flex flex-col gap-5" id="dashboard-main-content">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Left Column - Camera Stage & Controls */}
          <div className="lg:col-span-5 flex flex-col gap-5" id="stage-column-container">
            <CameraView
              renderingOptions={renderingOptions}
              onActivityUpdate={setClassifierState}
              onEventTriggered={handleEventTriggered}
              onCoordinatesUpdate={setLiveCoordinates}
            />

            {/* Interactive Control Deck */}
            <div className="p-4 bg-[#0D1117] border border-[#2D333B] rounded text-left" id="controls-panel">
              <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-gray-400 flex items-center gap-2 border-b border-[#21262D] pb-2 mb-3">
                <Settings className="w-3.5 h-3.5 text-blue-400" />
                Render Engine Configuration
              </h3>

              <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
                {/* Toggle Face Mesh */}
                <label className="flex items-center justify-between p-2 rounded bg-[#161B22] border border-[#30363D] hover:border-gray-500 transition-colors cursor-pointer select-none">
                  <div className="flex flex-col">
                    <span className="font-sans text-xs font-semibold text-slate-300">Face Mesh</span>
                    <span className="font-mono text-[9px] text-gray-500">468 vertices</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={renderingOptions.showFaceMesh}
                    onChange={(e) =>
                      setRenderingOptions((prev) => ({ ...prev, showFaceMesh: e.target.checked }))
                    }
                    className="accent-blue-500 w-3.5 h-3.5 cursor-pointer"
                  />
                </label>

                {/* Toggle Hand Skeleton */}
                <label className="flex items-center justify-between p-2 rounded bg-[#161B22] border border-[#30363D] hover:border-gray-500 transition-colors cursor-pointer select-none">
                  <div className="flex flex-col">
                    <span className="font-sans text-xs font-semibold text-slate-300">Joint Skeleton</span>
                    <span className="font-mono text-[9px] text-gray-500">21 keypoints</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={renderingOptions.showHandSkeleton}
                    onChange={(e) =>
                      setRenderingOptions((prev) => ({ ...prev, showHandSkeleton: e.target.checked }))
                    }
                    className="accent-blue-500 w-3.5 h-3.5 cursor-pointer"
                  />
                </label>

                {/* Mirror Stream */}
                <label className="flex items-center justify-between p-2 rounded bg-[#161B22] border border-[#30363D] hover:border-gray-500 transition-colors cursor-pointer select-none">
                  <div className="flex flex-col">
                    <span className="font-sans text-xs font-semibold text-slate-300">Mirror Feed</span>
                    <span className="font-mono text-[9px] text-gray-500">Selfie view</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={renderingOptions.mirrorCamera}
                    onChange={(e) =>
                      setRenderingOptions((prev) => ({ ...prev, mirrorCamera: e.target.checked }))
                    }
                    className="accent-blue-500 w-3.5 h-3.5 cursor-pointer"
                  />
                </label>

                {/* Landmark Dots Toggle */}
                <label className="flex items-center justify-between p-2 rounded bg-[#161B22] border border-[#30363D] hover:border-gray-500 transition-colors cursor-pointer select-none">
                  <div className="flex flex-col">
                    <span className="font-sans text-xs font-semibold text-slate-300">Vertex Dots</span>
                    <span className="font-mono text-[9px] text-gray-500">Draw coordinates</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={renderingOptions.showLandmarkDots}
                    onChange={(e) =>
                      setRenderingOptions((prev) => ({ ...prev, showLandmarkDots: e.target.checked }))
                    }
                    className="accent-blue-500 w-3.5 h-3.5 cursor-pointer"
                  />
                </label>

                {/* Simplified Face Mesh Toggle */}
                <label className="flex items-center justify-between p-2 rounded bg-[#161B22] border border-[#30363D] hover:border-gray-500 transition-colors cursor-pointer select-none col-span-2">
                  <div className="flex flex-col">
                    <span className="font-sans text-xs font-semibold text-slate-300">Simplified Contour Outline</span>
                    <span className="font-mono text-[9px] text-gray-500">Reduces browser draw overhead by mapping facial feature boundaries only</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={renderingOptions.simplifiedMesh}
                    onChange={(e) =>
                      setRenderingOptions((prev) => ({ ...prev, simplifiedMesh: e.target.checked }))
                    }
                    className="accent-blue-500 w-3.5 h-3.5 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Right Column - Metrics Dashboard Panel */}
          <div className="lg:col-span-7" id="metrics-column-container">
            <ActivityDashboard
              classifierState={classifierState}
              stats={stats}
              logs={logs}
              onResetStats={handleResetStats}
              liveCoordinates={liveCoordinates}
            />
          </div>

        </div>

        {/* Bottom Full-Width Field Guide */}
        <div className="w-full" id="field-guide-container">
          <InstructionCard />
        </div>
      </main>

      {/* 3. Global Footer */}
      <footer className="border-t border-[#30363D] px-4 py-3 bg-black text-gray-500" id="app-footer">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
            <span className="font-sans text-[10px]">
              Powered by Google MediaPipe Tasks Vision (Client-Side Neural Mesh processing model).
            </span>
          </div>
          <span className="font-mono text-[9px]">
            © 2026 AI Studio Workspace. Secure Client-Side Classifiers. No Data Transmitted.
          </span>
        </div>
      </footer>
    </div>
  );
}
