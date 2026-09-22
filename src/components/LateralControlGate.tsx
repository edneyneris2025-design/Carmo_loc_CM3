import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  HelpCircle,
  Layers,
  ListOrdered,
  Locate,
  Lock,
  MapPin,
  Maximize2,
  Minimize2,
  Move,
  Palette,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sliders,
  Trash2,
  Undo2,
  Unlock,
  Upload,
} from 'lucide-react';
import { ParsedDxfModel, SurveySequencePoint, TransformState } from '../types';
import {
  calculateDistanceMeters,
  calculatePolygonAreaM2,
  dxfToGeoJson,
  formatDistance,
  formatLatLng,
  getRealWorldDimensions,
  toDMS,
} from '../utils/geoTransform';
import { SAMPLE_DXF_PRESETS } from '../utils/sampleDxf';

interface LateralControlGateProps {
  model: ParsedDxfModel | null;
  transform: TransformState;
  onTransformChange: (updater: (prev: TransformState) => TransformState) => void;
  onLoadDxfContent: (text: string, name: string) => void;
  onSelectSample: (presetId: string) => void;
  isDragModeActive: boolean;
  onToggleDragMode: () => void;
  onCenterModelOnView: () => void;
  onCenterModelOnGps: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  // Survey Points Feature
  surveyPoints: SurveySequencePoint[];
  isSurveyModeActive: boolean;
  onToggleSurveyMode: () => void;
  onAddSurveyPointAtViewCenter: () => void;
  onAddSurveyPointAtGps: () => void;
  onRemoveSurveyPoint: (id: string) => void;
  onUndoSurveyPoint: () => void;
  onClearSurveyPoints: () => void;
  isPolygonClosed: boolean;
  onTogglePolygonClosed: () => void;
  onOpenSurveyExport: () => void;
  onCenterOnPoint?: (lat: number, lng: number) => void;
}

type TabType = 'move_rotate' | 'scale' | 'layers_style' | 'survey_points' | 'file';

const COLOR_PRESETS = [
  { label: 'Original DXF', value: 'layer' },
  { label: 'Verde Neon', value: '#22c55e' },
  { label: 'Ciano Alta Vis', value: '#06b6d4' },
  { label: 'Amarelo Canteiro', value: '#eab308' },
  { label: 'Laranja Topo', value: '#f97316' },
  { label: 'Branco Puro', value: '#f8fafc' },
  { label: 'Vermelho Alerta', value: '#ef4444' },
];

const STEP_SIZES = [
  { label: '0.5m', value: 0.5 },
  { label: '1m', value: 1.0 },
  { label: '5m', value: 5.0 },
  { label: '20m', value: 20.0 },
  { label: '100m', value: 100.0 },
];

export const LateralControlGate: React.FC<LateralControlGateProps> = ({
  model,
  transform,
  onTransformChange,
  onLoadDxfContent,
  onSelectSample,
  isDragModeActive,
  onToggleDragMode,
  onCenterModelOnView,
  onCenterModelOnGps,
  isOpen,
  onToggleOpen,
  surveyPoints,
  isSurveyModeActive,
  onToggleSurveyMode,
  onAddSurveyPointAtViewCenter,
  onAddSurveyPointAtGps,
  onRemoveSurveyPoint,
  onUndoSurveyPoint,
  onClearSurveyPoints,
  isPolygonClosed,
  onTogglePolygonClosed,
  onOpenSurveyExport,
  onCenterOnPoint,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('move_rotate');
  const [moveStepMeters, setMoveStepMeters] = useState<number>(5.0);

  const realDimensions = model
    ? getRealWorldDimensions(model.bounds, transform.scale)
    : { widthMeters: 0, heightMeters: 0, areaM2: 0 };

  // Nudge functions in meters
  const nudgeMeters = (dxMeters: number, dyMeters: number) => {
    if (transform.isLocked) return;
    if ('vibrate' in navigator) navigator.vibrate(10);

    const latMeters = 111320;
    const lngMeters = 111320 * Math.cos((transform.centerLat * Math.PI) / 180);

    const dLat = dyMeters / latMeters;
    const dLng = dxMeters / lngMeters;

    onTransformChange((prev) => ({
      ...prev,
      centerLat: prev.centerLat + dLat,
      centerLng: prev.centerLng + dLng,
    }));
  };

  // Rotation functions
  const rotateBy = (deltaDeg: number) => {
    if (transform.isLocked) return;
    if ('vibrate' in navigator) navigator.vibrate(10);
    onTransformChange((prev) => {
      let next = (prev.rotationDeg + deltaDeg) % 360;
      if (next < 0) next += 360;
      return { ...prev, rotationDeg: Math.round(next * 10) / 10 };
    });
  };

  const setAbsoluteRotation = (deg: number) => {
    if (transform.isLocked) return;
    if ('vibrate' in navigator) navigator.vibrate(15);
    onTransformChange((prev) => ({
      ...prev,
      rotationDeg: ((deg % 360) + 360) % 360,
    }));
  };

  // Toggle Layer Visibility
  const toggleLayer = (layerName: string) => {
    if (!model) return;
    const layer = model.layers[layerName];
    if (layer) {
      layer.visible = !layer.visible;
      // Trigger a re-render
      onTransformChange((prev) => ({ ...prev }));
    }
  };

  // File Upload Handling
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onLoadDxfContent(content, file.name);
      }
    };
    reader.readAsText(file);
  };

  // Export GeoJSON
  const handleExportGeoJson = () => {
    if (!model) return;
    const jsonStr = dxfToGeoJson(model.entities, model.bounds, transform, model.name);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.name.replace(/\.[^/.]+$/, '')}_satelite.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* 1. Toggle Tab Handle on the Edge */}
      <button
        id="btn-toggle-lateral-gate"
        onClick={onToggleOpen}
        aria-label={isOpen ? 'Recolher Portão Lateral' : 'Abrir Portão Lateral'}
        className={`fixed top-1/2 -translate-y-1/2 z-40 flex items-center shadow-2xl transition-all duration-300 ${
          isOpen ? 'right-[320px] sm:right-[360px]' : 'right-0'
        }`}
      >
        <div className="bg-slate-900/95 hover:bg-slate-800 text-cyan-400 border border-r-0 border-slate-700/80 rounded-l-2xl py-3.5 px-2 flex flex-col items-center gap-1.5 backdrop-blur-md">
          {isOpen ? <ChevronRight className="w-5 h-5 text-slate-300" /> : <ChevronLeft className="w-5 h-5 text-cyan-400 animate-pulse" />}
          <span className="text-[10px] font-bold uppercase tracking-wider [writing-mode:vertical-lr] text-slate-200">
            {isOpen ? 'Recolher' : 'Portão de Comando'}
          </span>
          <Compass className="w-4 h-4 text-amber-400 mt-1" />
        </div>
      </button>

      {/* 2. Main Lateral Drawer / Panel */}
      <aside
        id="lateral-command-gate"
        aria-label="Painel de comando lateral"
        className={`fixed top-0 right-0 bottom-0 z-30 w-[320px] sm:w-[360px] bg-slate-950/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out select-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <header className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-950/70 border border-cyan-800 text-cyan-400">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 leading-tight">Portão de Comando</h2>
              <p className="text-[11px] text-slate-400">Manipulação 2D no Satélite</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Lock / Unlock button */}
            <button
              id="btn-toggle-lock"
              onClick={() => {
                onTransformChange((prev) => ({ ...prev, isLocked: !prev.isLocked }));
                if ('vibrate' in navigator) navigator.vibrate(10);
              }}
              title={transform.isLocked ? 'Desbloquear Movimentação' : 'Travar Posição (Evitar toques acidentais)'}
              className={`p-2 rounded-lg transition-colors border ${
                transform.isLocked
                  ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {transform.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>

            {/* Close Gate */}
            <button
              onClick={onToggleOpen}
              className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-slate-700"
              title="Fechar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav aria-label="Abas de comando" className="grid grid-cols-5 p-1.5 bg-slate-900/80 border-b border-slate-800 gap-1 text-[11px]">
          <button
            id="tab-btn-move-rotate"
            onClick={() => setActiveTab('move_rotate')}
            className={`py-2 px-1 rounded-md font-semibold flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'move_rotate'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>Mover</span>
          </button>

          <button
            id="tab-btn-scale"
            onClick={() => setActiveTab('scale')}
            className={`py-2 px-1 rounded-md font-semibold flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'scale'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Escala</span>
          </button>

          <button
            id="tab-btn-layers"
            onClick={() => setActiveTab('layers_style')}
            className={`py-2 px-1 rounded-md font-semibold flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'layers_style'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Camadas</span>
          </button>

          <button
            id="tab-btn-survey-points"
            onClick={() => setActiveTab('survey_points')}
            className={`py-2 px-1 rounded-md font-semibold flex flex-col items-center gap-1 transition-colors relative ${
              activeTab === 'survey_points'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              {surveyPoints.length > 0 && (
                <span className="absolute -top-1 -right-2 px-1 min-w-3 text-[9px] font-bold rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center">
                  {surveyPoints.length}
                </span>
              )}
            </div>
            <span>Pontos</span>
          </button>

          <button
            id="tab-btn-file"
            onClick={() => setActiveTab('file')}
            className={`py-2 px-1 rounded-md font-semibold flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'file'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Arquivos</span>
          </button>
        </nav>

        {/* Content Area with Touch Scroll */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
          {/* TAB 1: MOVER & GIRAR */}
          {activeTab === 'move_rotate' && (
            <div className="space-y-4">
              {/* Lock Warning */}
              {transform.isLocked && (
                <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Objeto travado. Clique no cadeado acima para editar.</span>
                </div>
              )}

              {/* Free Drag Switch */}
              <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200 block">Arrastar no Mapa</span>
                  <span className="text-[11px] text-slate-400">Toque e puxe o objeto pelo mapa</span>
                </div>
                <button
                  id="btn-toggle-drag-mode"
                  disabled={transform.isLocked}
                  onClick={onToggleDragMode}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    isDragModeActive
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isDragModeActive ? 'ATIVO' : 'DESLIGADO'}
                </button>
              </div>

              {/* D-Pad Directional Move with Step Size */}
              <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5 text-cyan-400" />
                    Translação / Nudge Métrico
                  </span>
                  <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                    Passo: {moveStepMeters}m
                  </span>
                </div>

                {/* Step Size Selector */}
                <div className="grid grid-cols-5 gap-1">
                  {STEP_SIZES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setMoveStepMeters(s.value)}
                      className={`py-1 rounded text-[11px] font-medium transition-colors ${
                        moveStepMeters === s.value
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Joystick D-Pad */}
                <div className="flex justify-center py-1">
                  <div className="grid grid-cols-3 gap-1.5 w-36">
                    <div />
                    <button
                      id="btn-nudge-north"
                      disabled={transform.isLocked}
                      onClick={() => nudgeMeters(0, moveStepMeters)}
                      title="Mover Norte (Cima)"
                      className="h-10 rounded-lg bg-slate-800 hover:bg-cyan-600 active:scale-90 flex items-center justify-center text-slate-200 border border-slate-700 transition-all shadow"
                    >
                      <ArrowUp className="w-5 h-5 text-cyan-400" />
                    </button>
                    <div />

                    <button
                      id="btn-nudge-west"
                      disabled={transform.isLocked}
                      onClick={() => nudgeMeters(-moveStepMeters, 0)}
                      title="Mover Oeste (Esquerda)"
                      className="h-10 rounded-lg bg-slate-800 hover:bg-cyan-600 active:scale-90 flex items-center justify-center text-slate-200 border border-slate-700 transition-all shadow"
                    >
                      <ArrowLeft className="w-5 h-5 text-cyan-400" />
                    </button>

                    <div className="h-10 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                      {moveStepMeters}m
                    </div>

                    <button
                      id="btn-nudge-east"
                      disabled={transform.isLocked}
                      onClick={() => nudgeMeters(moveStepMeters, 0)}
                      title="Mover Leste (Direita)"
                      className="h-10 rounded-lg bg-slate-800 hover:bg-cyan-600 active:scale-90 flex items-center justify-center text-slate-200 border border-slate-700 transition-all shadow"
                    >
                      <ArrowRight className="w-5 h-5 text-cyan-400" />
                    </button>

                    <div />
                    <button
                      id="btn-nudge-south"
                      disabled={transform.isLocked}
                      onClick={() => nudgeMeters(0, -moveStepMeters)}
                      title="Mover Sul (Baixo)"
                      className="h-10 rounded-lg bg-slate-800 hover:bg-cyan-600 active:scale-90 flex items-center justify-center text-slate-200 border border-slate-700 transition-all shadow"
                    >
                      <ArrowDown className="w-5 h-5 text-cyan-400" />
                    </button>
                    <div />
                  </div>
                </div>

                {/* Quick alignment buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    id="btn-center-on-screen"
                    onClick={onCenterModelOnView}
                    className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition-colors"
                  >
                    Centralizar na Tela
                  </button>
                  <button
                    id="btn-center-on-gps"
                    onClick={onCenterModelOnGps}
                    className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-medium transition-colors"
                  >
                    Mover para Meu GPS
                  </button>
                </div>
              </section>

              {/* ROTATE SECTION */}
              <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    Rotação do Objeto
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                    {transform.rotationDeg.toFixed(1)}°
                  </span>
                </div>

                {/* Continuous Angle Range Slider */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="0.5"
                    disabled={transform.isLocked}
                    value={transform.rotationDeg}
                    onChange={(e) => setAbsoluteRotation(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0° (Norte)</span>
                    <span>90°</span>
                    <span>180°</span>
                    <span>270°</span>
                    <span>360°</span>
                  </div>
                </div>

                {/* Fine step rotation buttons */}
                <div className="grid grid-cols-4 gap-1">
                  <button
                    disabled={transform.isLocked}
                    onClick={() => rotateBy(-5)}
                    className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-mono text-[11px] active:scale-95"
                  >
                    -5°
                  </button>
                  <button
                    disabled={transform.isLocked}
                    onClick={() => rotateBy(-1)}
                    className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-mono text-[11px] active:scale-95"
                  >
                    -1°
                  </button>
                  <button
                    disabled={transform.isLocked}
                    onClick={() => rotateBy(1)}
                    className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-mono text-[11px] active:scale-95"
                  >
                    +1°
                  </button>
                  <button
                    disabled={transform.isLocked}
                    onClick={() => rotateBy(5)}
                    className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-mono text-[11px] active:scale-95"
                  >
                    +5°
                  </button>
                </div>

                {/* Quick 90 deg and Reset buttons */}
                <div className="grid grid-cols-3 gap-1">
                  <button
                    disabled={transform.isLocked}
                    onClick={() => rotateBy(-90)}
                    className="py-1.5 bg-slate-800/80 hover:bg-slate-700 rounded text-slate-300 text-[11px] flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> -90°
                  </button>
                  <button
                    disabled={transform.isLocked}
                    onClick={() => setAbsoluteRotation(0)}
                    className="py-1.5 bg-slate-800/80 hover:bg-slate-700 rounded text-amber-300 font-medium text-[11px]"
                  >
                    Zerar (0°)
                  </button>
                  <button
                    disabled={transform.isLocked}
                    onClick={() => rotateBy(90)}
                    className="py-1.5 bg-slate-800/80 hover:bg-slate-700 rounded text-slate-300 text-[11px] flex items-center justify-center gap-1"
                  >
                    <RotateCw className="w-3 h-3" /> +90°
                  </button>
                </div>
              </section>

              {/* Coordinates info */}
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Pivô Lat:</span>
                  <span className="text-slate-200">{transform.centerLat.toFixed(6)}°</span>
                </div>
                <div className="flex justify-between">
                  <span>Pivô Lng:</span>
                  <span className="text-slate-200">{transform.centerLng.toFixed(6)}°</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ESCALA & DIMENSÕES */}
          {activeTab === 'scale' && (
            <div className="space-y-4">
              <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Escala de Conversão</span>
                  <span className="font-mono text-xs text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                    1 unid = {transform.scale.toFixed(3)} m
                  </span>
                </div>

                <p className="text-[11px] text-slate-400">
                  Ajuste a proporção real do DXF sobre o solo do satélite.
                </p>

                {/* Preset unit buttons */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => onTransformChange((p) => ({ ...p, scale: 1.0, unitType: 'meters' }))}
                    className={`py-2 rounded-lg text-center font-medium text-[11px] border transition-colors ${
                      Math.abs(transform.scale - 1.0) < 0.001
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    1:1 (Metros)
                  </button>
                  <button
                    onClick={() => onTransformChange((p) => ({ ...p, scale: 0.01, unitType: 'centimeters' }))}
                    className={`py-2 rounded-lg text-center font-medium text-[11px] border transition-colors ${
                      Math.abs(transform.scale - 0.01) < 0.001
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    1:100 (cm)
                  </button>
                  <button
                    onClick={() => onTransformChange((p) => ({ ...p, scale: 0.001, unitType: 'millimeters' }))}
                    className={`py-2 rounded-lg text-center font-medium text-[11px] border transition-colors ${
                      Math.abs(transform.scale - 0.001) < 0.0001
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    1:1000 (mm)
                  </button>
                </div>

                {/* Multiplier / Fine Scale Slider */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span>Ajuste Fino de Escala</span>
                    <span className="font-mono text-cyan-400">{transform.scale.toFixed(3)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="10.0"
                    step="0.05"
                    value={transform.scale}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onTransformChange((p) => ({ ...p, scale: val, unitType: 'custom' }));
                    }}
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>

                {/* Quick Multipliers */}
                <div className="grid grid-cols-4 gap-1">
                  <button
                    onClick={() => onTransformChange((p) => ({ ...p, scale: Math.max(0.001, p.scale * 0.5) }))}
                    className="py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-[11px]"
                  >
                    50%
                  </button>
                  <button
                    onClick={() => onTransformChange((p) => ({ ...p, scale: Math.max(0.001, p.scale * 0.9) }))}
                    className="py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-[11px]"
                  >
                    -10%
                  </button>
                  <button
                    onClick={() => onTransformChange((p) => ({ ...p, scale: p.scale * 1.1 }))}
                    className="py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-[11px]"
                  >
                    +10%
                  </button>
                  <button
                    onClick={() => onTransformChange((p) => ({ ...p, scale: p.scale * 2 }))}
                    className="py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-[11px]"
                  >
                    200%
                  </button>
                </div>
              </section>

              {/* Real World Calculated Dimensions */}
              <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-2">
                <span className="font-bold text-slate-200 block">Dimensões Reais no Solo</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Largura Real</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {realDimensions.widthMeters.toFixed(1)} m
                    </span>
                  </div>
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Comprimento Real</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {realDimensions.heightMeters.toFixed(1)} m
                    </span>
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">Área do Retângulo Envolvente:</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {realDimensions.areaM2 > 10000
                      ? `${(realDimensions.areaM2 / 10000).toFixed(2)} ha`
                      : `${realDimensions.areaM2.toFixed(1)} m²`}
                  </span>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: ESTILOS & CAMADAS */}
          {activeTab === 'layers_style' && (
            <div className="space-y-4">
              {/* Visual Styling */}
              <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-3">
                <span className="font-bold text-slate-200 block">Aparência do Traçado</span>

                {/* Opacity slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300">Opacidade das Linhas</span>
                    <span className="font-mono text-cyan-400">{Math.round(transform.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={transform.opacity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onTransformChange((p) => ({ ...p, opacity: val }));
                    }}
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>

                {/* Stroke Width */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300">Espessura do Traçado</span>
                    <span className="font-mono text-cyan-400">{transform.strokeWidth} px</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 5].map((w) => (
                      <button
                        key={w}
                        onClick={() => onTransformChange((p) => ({ ...p, strokeWidth: w }))}
                        className={`py-1 rounded font-medium text-[11px] border transition-colors ${
                          transform.strokeWidth === w
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Presets */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-slate-300 text-[11px] block">Cor de Destaque</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => onTransformChange((p) => ({ ...p, strokeColor: c.value }))}
                        className={`py-1.5 px-2 rounded-lg text-left text-[11px] border flex items-center gap-1.5 transition-colors ${
                          transform.strokeColor === c.value
                            ? 'bg-slate-800 border-cyan-400 text-white font-medium'
                            : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full shrink-0 border border-slate-600"
                          style={{ backgroundColor: c.value === 'layer' ? '#38bdf8' : c.value }}
                        />
                        <span className="truncate">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fill Polygons Toggle */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-300 text-[11px]">Preencher Polígonos Fechados</span>
                  <input
                    type="checkbox"
                    checked={transform.fillPolygons}
                    onChange={(e) => onTransformChange((p) => ({ ...p, fillPolygons: e.target.checked }))}
                    className="accent-cyan-400 w-4 h-4 cursor-pointer"
                  />
                </div>
              </section>

              {/* DXF Layers List */}
              <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Camadas do Desenho</span>
                  <span className="text-[11px] text-slate-400">
                    {model ? Object.keys(model.layers).length : 0} layers
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {model &&
                    Object.values(model.layers).map((l) => (
                      <div
                        key={l.name}
                        onClick={() => toggleLayer(l.name)}
                        className={`p-2 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                          l.visible
                            ? 'bg-slate-800/80 border-slate-700 text-slate-200'
                            : 'bg-slate-950/60 border-slate-800 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: l.color || '#38bdf8' }}
                          />
                          <span className="truncate text-[11px] font-mono">{l.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-400">{l.entityCount}</span>
                          {l.visible ? (
                            <Eye className="w-3.5 h-3.5 text-cyan-400" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: PONTOS SEQUENCIAIS / POLIGONAL & EXPORTAÇÃO */}
          {activeTab === 'survey_points' && (
            <div className="space-y-3.5">
              {/* Header card with toggle */}
              <section className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
                    <MapPin className="w-4 h-4" />
                    <span>Marcação de Pontos & Distâncias</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {surveyPoints.length} {surveyPoints.length === 1 ? 'ponto' : 'pontos'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Clique ou toque na tela para criar pontos numerados crescentes (<span className="text-cyan-300 font-semibold">P1, P2, P3...</span>) com medição de distância entre eles em tempo real.
                </p>

                {/* Primary Button: Toggle Screen Click Mode */}
                <button
                  id="btn-toggle-survey-mode"
                  onClick={() => {
                    onToggleSurveyMode();
                    if ('vibrate' in navigator) navigator.vibrate(15);
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 border ${
                    isSurveyModeActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 ring-2 ring-emerald-400/40 shadow-emerald-500/25 animate-pulse'
                      : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/40 shadow-cyan-500/10'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>
                    {isSurveyModeActive
                      ? '● Modo Marcação ATIVO (Toque no Mapa)'
                      : 'Ativar Modo Marcação no Mapa'}
                  </span>
                </button>

                {/* Quick Add Buttons: View Center & GPS Position */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={onAddSurveyPointAtViewCenter}
                    title="Adicionar ponto na coordenada central da tela"
                    className="py-1.5 px-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                    <span>No Centro do Mapa</span>
                  </button>

                  <button
                    onClick={onAddSurveyPointAtGps}
                    title="Adicionar ponto na sua localização atual do GPS do celular"
                    className="py-1.5 px-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Locate className="w-3.5 h-3.5 text-sky-400" />
                    <span>Na Minha Posição GPS</span>
                  </button>
                </div>
              </section>

              {/* Poligonal Metrics & Polygon Close Switch */}
              <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">Resumo do Alinhamento</span>
                  {surveyPoints.length >= 3 && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={isPolygonClosed}
                        onChange={onTogglePolygonClosed}
                        className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0"
                      />
                      <span className="font-semibold text-amber-300">Fechar Poligonal</span>
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Extensão / Perímetro:</span>
                    <strong className="text-cyan-300 font-mono text-sm">
                      {formatDistance(
                        surveyPoints.length > 0
                          ? (surveyPoints[surveyPoints.length - 1].cumulativeDistance || 0) +
                              (isPolygonClosed && surveyPoints.length >= 3
                                ? calculateDistanceMeters(
                                    surveyPoints[surveyPoints.length - 1].lat,
                                    surveyPoints[surveyPoints.length - 1].lng,
                                    surveyPoints[0].lat,
                                    surveyPoints[0].lng
                                  )
                                : 0)
                          : 0
                      )}
                    </strong>
                  </div>

                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">Área Enquadrada:</span>
                    <strong className="text-emerald-400 font-mono text-sm">
                      {isPolygonClosed && surveyPoints.length >= 3
                        ? `${calculatePolygonAreaM2(surveyPoints).toFixed(1)} m²`
                        : '---'}
                    </strong>
                  </div>
                </div>

                {/* Edit Controls: Undo & Clear */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={onUndoSurveyPoint}
                    disabled={surveyPoints.length === 0}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Desfazer Último</span>
                  </button>

                  <button
                    onClick={onClearSurveyPoints}
                    disabled={surveyPoints.length === 0}
                    className="py-1.5 px-3 rounded-lg bg-red-500/15 hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-red-400 border border-red-500/30 text-[11px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>
                </div>
              </section>

              {/* PROMINENT EXPORT BUTTON (As requested by user) */}
              <section className="bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 p-3 rounded-xl border border-cyan-500/40 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="font-bold text-slate-100 text-xs">
                    Exportação de Coordenadas Geográficas
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Gere e exporte a lista completa das coordenadas de cada vértice em formato de lista (TXT, CSV ou cópia rápida) com distâncias e chancela Carmo Energy.
                </p>

                <button
                  id="btn-export-coordinates-list"
                  onClick={onOpenSurveyExport}
                  disabled={surveyPoints.length === 0}
                  className="w-full py-2.5 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/25 active:scale-95"
                >
                  <FileText className="w-4 h-4" />
                  <span>Exportar Coordenadas dos Pontos em Lista</span>
                </button>
              </section>

              {/* List of Points with Details */}
              <section className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="font-bold text-slate-200 text-xs">Vértices Marcados ({surveyPoints.length})</span>
                  <span className="text-[10px] text-slate-400">Toque no alvo para centralizar</span>
                </div>

                {surveyPoints.length === 0 ? (
                  <div className="text-center py-6 px-4 bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="font-semibold text-slate-400">Nenhum ponto marcado ainda</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Ative o modo acima e toque em qualquer local do mapa para criar P1, P2, P3...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {surveyPoints.map((pt, idx) => (
                      <div
                        key={pt.id}
                        className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 flex items-center justify-center text-[11px] shrink-0">
                            {pt.label || `P${pt.index}`}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono text-slate-200 truncate">
                              {pt.lat.toFixed(6)}°, {pt.lng.toFixed(6)}°
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                              {idx > 0 ? (
                                <span className="text-amber-300 font-semibold">
                                  +{formatDistance(pt.distanceFromPrev || 0)}
                                </span>
                              ) : (
                                <span className="text-slate-500">Ponto Inicial</span>
                              )}
                              <span>• Acum: {formatDistance(pt.cumulativeDistance || 0)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {onCenterOnPoint && (
                            <button
                              onClick={() => onCenterOnPoint(pt.lat, pt.lng)}
                              title="Centralizar câmera neste ponto"
                              className="p-1.5 rounded-md text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                            >
                              <Crosshair className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => onRemoveSurveyPoint(pt.id)}
                            title="Excluir este ponto"
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 5: ARQUIVOS & PROJETO */}
          {activeTab === 'file' && (
            <div className="space-y-4">
              {/* Import DXF Button */}
              <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
                <span className="font-bold text-slate-200 block">Importar Arquivo do Celular</span>
                <label className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-slate-950 font-bold cursor-pointer transition-all shadow-lg shadow-cyan-600/20">
                  <Upload className="w-4 h-4" />
                  <span>Escolher Arquivo .DXF</span>
                  <input
                    type="file"
                    accept=".dxf,.DXF"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Compatível com arquivos DXF 2D exportados de AutoCAD, Civil 3D, QGIS, TopoGRAPH e outros.
                </p>
              </section>

              {/* Sample Projects */}
              <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-2">
                <span className="font-bold text-slate-200 block">Projetos de Demonstração</span>
                <div className="space-y-1.5">
                  {SAMPLE_DXF_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => onSelectSample(preset.id)}
                      className="w-full text-left p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200 group-hover:text-cyan-400">
                          {preset.name}
                        </span>
                        <span className="text-[10px] text-cyan-400 bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-800/50">
                          {preset.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        {preset.description}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              {/* Export GeoJSON */}
              {model && (
                <section className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-2">
                  <span className="font-bold text-slate-200 block">Exportar Projeto Georreferenciado</span>
                  <button
                    onClick={handleExportGeoJson}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Baixar GeoJSON (QGIS / Google Earth)</span>
                  </button>
                </section>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
