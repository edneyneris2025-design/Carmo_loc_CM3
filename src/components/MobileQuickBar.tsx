import React from 'react';
import {
  Compass,
  Crosshair,
  FolderOpen,
  Locate,
  Lock,
  Move,
  RotateCcw,
  RotateCw,
  Unlock,
  Upload,
} from 'lucide-react';
import { TransformState } from '../types';

interface MobileQuickBarProps {
  transform: TransformState;
  onTransformChange: (updater: (prev: TransformState) => TransformState) => void;
  isDragModeActive: boolean;
  onToggleDragMode: () => void;
  onCenterModelOnView: () => void;
  onCenterModelOnGps: () => void;
  isLocatingGps: boolean;
  isLateralGateOpen: boolean;
  onToggleLateralGate: () => void;
  onOpenUploadModal: () => void;
}

export const MobileQuickBar: React.FC<MobileQuickBarProps> = ({
  transform,
  onTransformChange,
  isDragModeActive,
  onToggleDragMode,
  onCenterModelOnView,
  onCenterModelOnGps,
  isLocatingGps,
  isLateralGateOpen,
  onToggleLateralGate,
  onOpenUploadModal,
}) => {
  const rotateBy = (deltaDeg: number) => {
    if (transform.isLocked) return;
    if ('vibrate' in navigator) navigator.vibrate(10);
    onTransformChange((prev) => {
      let next = (prev.rotationDeg + deltaDeg) % 360;
      if (next < 0) next += 360;
      return { ...prev, rotationDeg: Math.round(next * 10) / 10 };
    });
  };

  return (
    <nav
      aria-label="Barra de ações rápidas"
      id="mobile-quick-bar"
      className="fixed bottom-0 left-0 right-0 z-20 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/80 px-2 py-2 safe-area-inset-bottom flex items-center justify-between gap-1 shadow-2xl max-w-lg mx-auto sm:rounded-t-2xl sm:border-x"
    >
      {/* Upload / Open File */}
      <button
        id="quick-btn-upload"
        onClick={onOpenUploadModal}
        className="flex-1 py-1.5 px-1 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 flex flex-col items-center justify-center text-slate-300 transition-all min-w-[50px]"
      >
        <FolderOpen className="w-4 h-4 text-cyan-400" />
        <span className="text-[10px] font-medium mt-0.5">DXF</span>
      </button>

      {/* Drag Mode Toggle */}
      <button
        id="quick-btn-drag"
        disabled={transform.isLocked}
        onClick={onToggleDragMode}
        className={`flex-1 py-1.5 px-1 rounded-xl active:scale-95 border flex flex-col items-center justify-center transition-all min-w-[50px] ${
          isDragModeActive
            ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
        }`}
      >
        <Move className="w-4 h-4" />
        <span className="text-[10px] font-medium mt-0.5">Mover</span>
      </button>

      {/* Quick Rotate -5 deg */}
      <button
        id="quick-btn-rot-left"
        disabled={transform.isLocked}
        onClick={() => rotateBy(-5)}
        className="flex-1 py-1.5 px-1 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 flex flex-col items-center justify-center text-slate-300 transition-all min-w-[50px]"
      >
        <RotateCcw className="w-4 h-4 text-amber-400" />
        <span className="text-[10px] font-mono mt-0.5">-5°</span>
      </button>

      {/* Quick Rotate +5 deg */}
      <button
        id="quick-btn-rot-right"
        disabled={transform.isLocked}
        onClick={() => rotateBy(5)}
        className="flex-1 py-1.5 px-1 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 flex flex-col items-center justify-center text-slate-300 transition-all min-w-[50px]"
      >
        <RotateCw className="w-4 h-4 text-amber-400" />
        <span className="text-[10px] font-mono mt-0.5">+5°</span>
      </button>

      {/* Center on Screen */}
      <button
        id="quick-btn-recenter"
        onClick={onCenterModelOnView}
        className="flex-1 py-1.5 px-1 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 flex flex-col items-center justify-center text-slate-300 transition-all min-w-[50px]"
      >
        <Crosshair className="w-4 h-4 text-emerald-400" />
        <span className="text-[10px] font-medium mt-0.5">Centrar</span>
      </button>

      {/* Open/Close Command Gate */}
      <button
        id="quick-btn-lateral-gate"
        onClick={onToggleLateralGate}
        className={`flex-1 py-1.5 px-1 rounded-xl active:scale-95 border flex flex-col items-center justify-center transition-all min-w-[56px] ${
          isLateralGateOpen
            ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
            : 'bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border-cyan-700/60'
        }`}
      >
        <Compass className="w-4 h-4" />
        <span className="text-[10px] font-medium mt-0.5">Comandos</span>
      </button>
    </nav>
  );
};
