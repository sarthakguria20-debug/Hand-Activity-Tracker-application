import React from 'react';
import {
  Hand,
  Activity,
  User,
  Smile,
  ThumbsUp,
  Info,
  HelpCircle,
  Play,
} from 'lucide-react';

export default function InstructionCard() {
  const gestures = [
    {
      title: 'Waving Hand',
      trigger: 'Move either hand rapidly side-to-side.',
      icon: <Hand className="w-4 h-4 text-sky-400" />,
      tips: 'Position your hand clearly in the central portion of the frame.',
    },
    {
      title: 'Clapping Hands',
      trigger: 'Bring both hands together in a rhythmic clapping sequence.',
      icon: <Activity className="w-4 h-4 text-emerald-400" />,
      tips: 'Ensure both hands are visible simultaneously inside the frame.',
    },
    {
      title: 'Head Nod / Shake',
      trigger: 'Move your head up/down (Nod) or side-to-side (Shake).',
      icon: <User className="w-4 h-4 text-purple-400" />,
      tips: 'Keep your face oriented towards the camera and maintain a stable distance.',
    },
    {
      title: 'Hand Signs (OK / Peace)',
      trigger: 'Perform static hand signs clearly near your head/chest.',
      icon: <ThumbsUp className="w-4 h-4 text-amber-400" />,
      tips: 'Hold the sign stable for a brief moment to stabilize the trigger match.',
    },
    {
      title: 'Smile / Surprise',
      trigger: 'Smile widely, or open your mouth in open-jaw surprise!',
      icon: <Smile className="w-4 h-4 text-pink-400" />,
      tips: 'Avoid thick hair obscuring your eyebrows or mouth corners for precise mesh detection.',
    },
  ];

  return (
    <div className="bg-[#0D1117] rounded border border-[#2D333B] p-4 flex flex-col gap-3.5 text-left" id="user-onboarding-instructions">
      <div className="flex items-center gap-2 border-b border-[#21262D] pb-3">
        <HelpCircle className="w-4 h-4 text-blue-400" />
        <div>
          <h3 className="font-sans font-bold text-xs text-white uppercase tracking-wider">
            Gesture & Expressions Field Guide
          </h3>
          <p className="font-sans text-[11px] text-gray-400 mt-0.5 leading-normal">
            Follow these trigger motions to test the real-time computer vision classifier.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {gestures.map((g, idx) => (
          <div
            key={idx}
            className="p-3 bg-[#161B22] rounded border border-[#30363D] hover:border-gray-500 flex flex-col gap-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-[#0D1117] border border-[#21262D]">
                {g.icon}
              </div>
              <span className="font-sans font-bold text-xs text-white">
                {g.title}
              </span>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-[11px] text-gray-300 leading-relaxed font-medium">
                {g.trigger}
              </span>
              <span className="font-mono text-[9px] text-gray-500 leading-normal">
                {g.tips}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2.5 p-2.5 bg-[#161B22] rounded border border-[#30363D]">
        <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <p className="font-sans text-[10px] text-gray-400 leading-relaxed">
          <strong className="text-gray-300 font-bold uppercase font-mono tracking-wide">Core Engine:</strong> The application runs neural tracking completely client-side in your browser. Raw landmarks (21 points per hand, 468 points for face mesh) are plotted on a 3D coordinate system, measuring velocity vectors and trigonometry formulas to recognize specific activities instantly.
        </p>
      </div>
    </div>
  );
}
