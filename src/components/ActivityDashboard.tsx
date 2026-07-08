import React, { useEffect, useState, useRef } from 'react';
import { ActivityLog, ClassifierState, RecognitionStats, ActivityType } from '../types';
import {
  Sparkles,
  TrendingUp,
  History,
  Award,
  Activity,
  Smile,
  Zap,
  ThumbsUp,
  Hand,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface ActivityDashboardProps {
  classifierState: ClassifierState | null;
  stats: RecognitionStats;
  logs: ActivityLog[];
  onResetStats: () => void;
  liveCoordinates?: any;
}

export default function ActivityDashboard({
  classifierState,
  stats,
  logs,
  onResetStats,
  liveCoordinates,
}: ActivityDashboardProps) {
  // Store rolling history of metrics for real-time sparklines
  const [metricsHistory, setMetricsHistory] = useState<
    {
      handSpeed: number;
      smileRatio: number;
      surpriseRatio: number;
      headMotion: number;
    }[]
  >([]);

  const maxHistoryPoints = 40;

  // Track state change triggers for high-highlighting flashes
  const [pulseActivity, setPulseActivity] = useState(false);
  const prevActivityRef = useRef<ActivityType | null>(null);

  useEffect(() => {
    if (!classifierState) return;

    // Pulse when activity flips
    if (prevActivityRef.current !== classifierState.currentActivity) {
      setPulseActivity(true);
      const t = setTimeout(() => setPulseActivity(false), 500);
      prevActivityRef.current = classifierState.currentActivity;
      return () => clearTimeout(t);
    }
  }, [classifierState?.currentActivity]);

  // Append new metrics to rolling buffer
  useEffect(() => {
    if (!classifierState) return;

    const { metrics } = classifierState;
    const combinedHeadMotion = (metrics.headPitchVelocity + metrics.headYawVelocity) * 1.5;

    setMetricsHistory((prev) => {
      const next = [
        ...prev,
        {
          handSpeed: metrics.handSpeed || 0,
          smileRatio: metrics.smileRatio || 0,
          surpriseRatio: metrics.surpriseRatio || 0,
          headMotion: combinedHeadMotion || 0,
        },
      ];
      if (next.length > maxHistoryPoints) {
        next.shift();
      }
      return next;
    });
  }, [classifierState]);

  // Generate SVG paths for sparklines
  const getSvgPath = (key: 'handSpeed' | 'smileRatio' | 'surpriseRatio' | 'headMotion', strokeColor: string) => {
    if (metricsHistory.length < 2) return '';
    const width = 160;
    const height = 40;
    const maxVal = Math.max(...metricsHistory.map((m) => m[key]), 0.1);

    const points = metricsHistory.map((item, index) => {
      const x = (index / (metricsHistory.length - 1)) * width;
      const y = height - (item[key] / maxVal) * (height - 4) - 2;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  };

  // Get matching badge colors and icons for the active gesture
  const getActivityStyling = (activity: ActivityType) => {
    switch (activity) {
      case 'Clapping Hands':
        return {
          bgColor: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
          ringColor: 'ring-emerald-500/20',
          gradient: 'from-emerald-600/20 to-teal-600/5',
          glow: 'shadow-emerald-500/20',
          label: 'Dynamic Action',
          icon: <Activity className="w-5 h-5 text-emerald-400" />,
        };
      case 'Waving Hand':
        return {
          bgColor: 'bg-sky-500/15 border-sky-500/40 text-sky-400',
          ringColor: 'ring-sky-500/20',
          gradient: 'from-sky-600/20 to-blue-600/5',
          glow: 'shadow-sky-500/20',
          label: 'Motion Greeting',
          icon: <Hand className="w-5 h-5 text-sky-400" />,
        };
      case 'Nodding Head':
      case 'Shaking Head':
        return {
          bgColor: 'bg-purple-500/15 border-purple-500/40 text-purple-400',
          ringColor: 'ring-purple-500/20',
          gradient: 'from-purple-600/20 to-fuchsia-600/5',
          glow: 'shadow-purple-500/20',
          label: 'Head Gesture',
          icon: <Zap className="w-5 h-5 text-purple-400" />,
        };
      case 'Fist Bump':
      case 'Thumbs Up':
      case 'Thumbs Down':
      case 'Peace Sign':
      case 'OK Sign':
        return {
          bgColor: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
          ringColor: 'ring-amber-500/20',
          gradient: 'from-amber-600/20 to-orange-600/5',
          glow: 'shadow-amber-500/20',
          label: 'Hand Sign',
          icon: <ThumbsUp className="w-5 h-5 text-amber-400" />,
        };
      case 'Smiling Face':
      case 'Surprised Face':
        return {
          bgColor: 'bg-pink-500/15 border-pink-500/40 text-pink-400',
          ringColor: 'ring-pink-500/20',
          gradient: 'from-pink-600/20 to-rose-600/5',
          glow: 'shadow-pink-500/20',
          label: 'Facial Expression',
          icon: <Smile className="w-5 h-5 text-pink-400" />,
        };
      default:
        return {
          bgColor: 'bg-slate-800/60 border-slate-700/50 text-slate-400',
          ringColor: 'ring-slate-500/10',
          gradient: 'from-slate-800/10 to-slate-900/5',
          glow: 'shadow-transparent',
          label: 'System Idle',
          icon: <Sparkles className="w-5 h-5 text-slate-500 animate-pulse" />,
        };
    }
  };

  const currentActivity = classifierState?.currentActivity || 'Resting (Idle)';
  const confidence = classifierState ? Math.round(classifierState.confidence * 100) : 0;
  const style = getActivityStyling(currentActivity);

  return (
    <div className="flex flex-col gap-5 w-full" id="activity-dashboard-panel">
      {/* 1. Main Status HUD */}
      <div
        className={`relative overflow-hidden rounded border transition-all duration-300 bg-[#0D1117] border-[#2D333B] ${
          pulseActivity ? 'scale-[1.008] border-[#30363D]' : ''
        }`}
        id="active-recognition-billboard"
      >
        <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 z-10 relative">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#161B22] border border-[#30363D]">
              {style.icon}
            </div>
            <div>
              <div className="font-mono text-[9px] tracking-widest font-bold text-gray-500 uppercase leading-none">
                {style.label}
              </div>
              <h2 className="font-sans font-bold text-lg tracking-tight text-white mt-1">
                {currentActivity}
              </h2>
            </div>
          </div>

          {/* Confidence Gauge */}
          <div className="w-full sm:w-auto flex flex-col gap-1.5 min-w-[130px]">
            <div className="flex justify-between items-center w-full font-mono text-[10px] text-gray-400">
              <span>CONFIDENCE</span>
              <span className="font-bold text-emerald-400">{confidence}%</span>
            </div>
            <div className="w-full bg-[#161B22] rounded h-1.5 overflow-hidden border border-[#30363D]">
              <div
                className={`h-full rounded transition-all duration-300 ${
                  confidence > 75 ? 'bg-emerald-400' : confidence > 50 ? 'bg-amber-400' : 'bg-blue-500'
                }`}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Real-Time Signal Trackers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" id="signal-sparklines-grid">
        {/* Hand Speed Sparkline */}
        <div className="p-3 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col justify-between h-24">
          <div>
            <div className="font-mono text-[9px] tracking-wider uppercase text-gray-500 font-bold">Hand Velocity</div>
            <div className="font-mono text-base font-bold text-emerald-400 mt-0.5">
              {(classifierState?.metrics.handSpeed || 0).toFixed(3)} <span className="text-[9px] font-normal text-gray-500">px/f</span>
            </div>
          </div>
          <div className="h-8 w-full flex items-end">
            {metricsHistory.length > 1 ? (
              <svg className="w-full h-8 overflow-visible">
                <path
                  d={getSvgPath('handSpeed', '#10b981')}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="1.2"
                  className="transition-all duration-300"
                />
              </svg>
            ) : (
              <span className="font-mono text-[9px] text-gray-600">Sampling...</span>
            )}
          </div>
        </div>

        {/* Head Motion Sparkline */}
        <div className="p-3 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col justify-between h-24">
          <div>
            <div className="font-mono text-[9px] tracking-wider uppercase text-gray-500 font-bold">Head Angular</div>
            <div className="font-mono text-base font-bold text-purple-400 mt-0.5">
              {((classifierState?.metrics.headPitchVelocity || 0) + (classifierState?.metrics.headYawVelocity || 0)).toFixed(3)}
            </div>
          </div>
          <div className="h-8 w-full flex items-end">
            {metricsHistory.length > 1 ? (
              <svg className="w-full h-8 overflow-visible">
                <path
                  d={getSvgPath('headMotion', '#a855f7')}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="1.2"
                  className="transition-all duration-300"
                />
              </svg>
            ) : (
              <span className="font-mono text-[9px] text-gray-600">Sampling...</span>
            )}
          </div>
        </div>

        {/* Smile Intensity Sparkline */}
        <div className="p-3 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col justify-between h-24">
          <div>
            <div className="font-mono text-[9px] tracking-wider uppercase text-gray-500 font-bold">Smile Ratio</div>
            <div className="font-mono text-base font-bold text-pink-400 mt-0.5">
              {(classifierState?.metrics.smileRatio || 0).toFixed(3)}
            </div>
          </div>
          <div className="h-8 w-full flex items-end">
            {metricsHistory.length > 1 ? (
              <svg className="w-full h-8 overflow-visible">
                <path
                  d={getSvgPath('smileRatio', '#ec4899')}
                  fill="none"
                  stroke="#ec4899"
                  strokeWidth="1.2"
                  className="transition-all duration-300"
                />
              </svg>
            ) : (
              <span className="font-mono text-[9px] text-gray-600">Sampling...</span>
            )}
          </div>
        </div>

        {/* Surprise Factor Sparkline */}
        <div className="p-3 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col justify-between h-24">
          <div>
            <div className="font-mono text-[9px] tracking-wider uppercase text-gray-500 font-bold">Oral Gap</div>
            <div className="font-mono text-base font-bold text-amber-400 mt-0.5">
              {(classifierState?.metrics.surpriseRatio || 0).toFixed(3)}
            </div>
          </div>
          <div className="h-8 w-full flex items-end">
            {metricsHistory.length > 1 ? (
              <svg className="w-full h-8 overflow-visible">
                <path
                  d={getSvgPath('surpriseRatio', '#f59e0b')}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.2"
                  className="transition-all duration-300"
                />
              </svg>
            ) : (
              <span className="font-mono text-[9px] text-gray-600">Sampling...</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Session Stat Counters */}
      <div className="flex flex-col gap-3.5" id="session-counters-panel">
        <div className="flex items-center justify-between">
          <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-400" />
            Session Event Counters
          </h3>
          <button
            onClick={onResetStats}
            className="font-mono text-[9px] text-gray-500 hover:text-white uppercase tracking-wider cursor-pointer transition-colors"
          >
            Reset [CLR]
          </button>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {/* Wave counter */}
          <div className="p-2.5 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col items-center text-center">
            <Hand className="w-4 h-4 text-blue-400 mb-1" />
            <div className="font-mono text-[8px] text-gray-500 uppercase font-bold">Waves</div>
            <div className="font-mono text-lg font-bold text-white mt-0.5">{stats.wavesCount}</div>
          </div>

          {/* Clapping counter */}
          <div className="p-2.5 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col items-center text-center">
            <Activity className="w-4 h-4 text-emerald-400 mb-1" />
            <div className="font-mono text-[8px] text-gray-500 uppercase font-bold">Claps</div>
            <div className="font-mono text-lg font-bold text-white mt-0.5">{stats.clapsCount}</div>
          </div>

          {/* Nod counter */}
          <div className="p-2.5 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col items-center text-center">
            <TrendingUp className="w-4 h-4 text-purple-400 mb-1" />
            <div className="font-mono text-[8px] text-gray-500 uppercase font-bold">Nods</div>
            <div className="font-mono text-lg font-bold text-white mt-0.5">{stats.nodsCount}</div>
          </div>

          {/* Shake counter */}
          <div className="p-2.5 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col items-center text-center">
            <TrendingUp className="w-4 h-4 text-indigo-400 mb-1 rotate-90" />
            <div className="font-mono text-[8px] text-gray-500 uppercase font-bold">Shakes</div>
            <div className="font-mono text-lg font-bold text-white mt-0.5">{stats.shakesCount}</div>
          </div>

          {/* Smile counter */}
          <div className="p-2.5 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col items-center text-center">
            <Smile className="w-4 h-4 text-pink-400 mb-1" />
            <div className="font-mono text-[8px] text-gray-500 uppercase font-bold">Smiles</div>
            <div className="font-mono text-lg font-bold text-white mt-0.5">{stats.smilesCount}</div>
          </div>

          {/* High gestures counter (Total OK + Peace + ThumbsUp) */}
          <div className="p-2.5 bg-[#0D1117] border border-[#2D333B] rounded flex flex-col items-center text-center">
            <ThumbsUp className="w-4 h-4 text-amber-400 mb-1" />
            <div className="font-mono text-[8px] text-gray-500 uppercase font-bold">Signs</div>
            <div className="font-mono text-lg font-bold text-white mt-0.5">
              {stats.thumbsUpCount + stats.peaceCount + stats.okCount + stats.fistBumpsCount}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Real-Time Landmark Telemetry Coordinates Panel (Design HTML match) */}
      <div className="flex flex-col gap-3.5" id="landmark-coordinates-panel">
        <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-gray-400 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          Landmark Coordinate Telemetry
        </h3>
        <div className="bg-[#0D1117] rounded border border-[#2D333B] overflow-hidden">
          <table className="w-full text-left font-mono text-[10px]">
            <thead className="bg-[#161B22] border-b border-[#2D333B] text-gray-500">
              <tr>
                <th className="p-2 font-bold uppercase tracking-wider">ID</th>
                <th className="p-2 font-bold uppercase tracking-wider">X-POS</th>
                <th className="p-2 font-bold uppercase tracking-wider">Y-POS</th>
                <th className="p-2 font-bold uppercase tracking-wider">Z-POS</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-[#21262D]">
                <td className="p-2 text-blue-400 font-bold">L_EYE_O</td>
                <td className="p-2">{liveCoordinates?.L_EYE_O ? liveCoordinates.L_EYE_O.x.toFixed(5) : '0.42921'}</td>
                <td className="p-2">{liveCoordinates?.L_EYE_O ? liveCoordinates.L_EYE_O.y.toFixed(5) : '0.31298'}</td>
                <td className="p-2">{liveCoordinates?.L_EYE_O ? liveCoordinates.L_EYE_O.z.toFixed(5) : '-0.00200'}</td>
              </tr>
              <tr className="border-b border-[#21262D]">
                <td className="p-2 text-blue-400 font-bold">R_EYE_O</td>
                <td className="p-2">{liveCoordinates?.R_EYE_O ? liveCoordinates.R_EYE_O.x.toFixed(5) : '0.58210'}</td>
                <td className="p-2">{liveCoordinates?.R_EYE_O ? liveCoordinates.R_EYE_O.y.toFixed(5) : '0.31288'}</td>
                <td className="p-2">{liveCoordinates?.R_EYE_O ? liveCoordinates.R_EYE_O.z.toFixed(5) : '-0.00200'}</td>
              </tr>
              <tr className="border-b border-[#21262D]">
                <td className="p-2 text-amber-400 font-bold">WRIST_R</td>
                <td className="p-2">{liveCoordinates?.WRIST_R ? liveCoordinates.WRIST_R.x.toFixed(5) : '0.12832'}</td>
                <td className="p-2">{liveCoordinates?.WRIST_R ? liveCoordinates.WRIST_R.y.toFixed(5) : '0.82910'}</td>
                <td className="p-2">{liveCoordinates?.WRIST_R ? liveCoordinates.WRIST_R.z.toFixed(5) : '0.14200'}</td>
              </tr>
              <tr className="border-b border-[#21262D]">
                <td className="p-2 text-amber-400 font-bold">THUMB_T</td>
                <td className="p-2">{liveCoordinates?.THUMB_T ? liveCoordinates.THUMB_T.x.toFixed(5) : '0.11029'}</td>
                <td className="p-2">{liveCoordinates?.THUMB_T ? liveCoordinates.THUMB_T.y.toFixed(5) : '0.78121'}</td>
                <td className="p-2">{liveCoordinates?.THUMB_T ? liveCoordinates.THUMB_T.z.toFixed(5) : '0.15600'}</td>
              </tr>
              <tr className="border-b border-[#21262D]">
                <td className="p-2 text-white font-bold">ELBOW_L</td>
                <td className="p-2">{liveCoordinates?.ELBOW_L ? liveCoordinates.ELBOW_L.x.toFixed(5) : '0.38219'}</td>
                <td className="p-2">{liveCoordinates?.ELBOW_L ? liveCoordinates.ELBOW_L.y.toFixed(5) : '0.51239'}</td>
                <td className="p-2">{liveCoordinates?.ELBOW_L ? liveCoordinates.ELBOW_L.z.toFixed(5) : '-0.08100'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Chronological Activity Log (Design HTML match) */}
      <div className="flex flex-col gap-3.5" id="chronological-logs-panel">
        <div className="flex items-center justify-between">
          <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-400" />
            Activity Recognition History
          </h3>
          <span className="text-[9px] font-mono text-blue-400 font-bold uppercase tracking-wider">Auto-Logging Enabled</span>
        </div>

        <div className="bg-[#0D1117] border border-[#2D333B] rounded max-h-52 overflow-y-auto divide-y divide-[#21262D] custom-scrollbar">
          {logs.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="w-7 h-7 text-gray-600 animate-pulse" />
              <p className="font-mono text-[10px] text-gray-500 uppercase tracking-wide">
                Awaiting Stream Signal Triggers
              </p>
            </div>
          ) : (
            logs.map((log) => {
              const intensityBorder = log.intensity === 'High' 
                ? 'border-rose-500' 
                : log.intensity === 'Medium' 
                ? 'border-amber-500' 
                : 'border-emerald-500';
              const intensityText = log.intensity === 'High' 
                ? 'text-rose-400' 
                : log.intensity === 'Medium' 
                ? 'text-amber-400' 
                : 'text-emerald-400';
              return (
                <div key={log.id} className={`p-3 border-l-2 ${intensityBorder} bg-[#0D1117] hover:bg-[#161B22] transition-colors text-left`}>
                  <div className="flex items-center justify-between">
                    <p className={`font-mono text-[11px] font-bold uppercase ${intensityText}`}>
                      {log.name}
                    </p>
                    <span className="font-mono text-[9px] text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="font-sans text-[11px] text-gray-300 mt-1 leading-normal">
                    {log.description}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
