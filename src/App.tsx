import React, { useEffect, useState, useCallback } from 'react';
import { MapTileProvider, ParsedDxfModel, SurveySequencePoint, TransformState, UserGpsLocation } from './types';
import { parseDxfContent } from './utils/dxfParser';
import { recalculateSurveyPoints } from './utils/geoTransform';
import { SAMPLE_DXF_PRESETS } from './utils/sampleDxf';
import { SatelliteMap } from './components/SatelliteMap';
import { LateralControlGate } from './components/LateralControlGate';
import { MobileQuickBar } from './components/MobileQuickBar';
import { DxfUploadModal } from './components/DxfUploadModal';
import { SurveyExportModal } from './components/SurveyExportModal';

// Default initial geographic position (São Paulo Parque Ibirapuera / Monumento às Bandeiras - clear green & urban parcel area)
const DEFAULT_LAT = -23.587416;
const DEFAULT_LNG = -46.657634;

const DEFAULT_TRANSFORM: TransformState = {
  centerLat: DEFAULT_LAT,
  centerLng: DEFAULT_LNG,
  rotationDeg: 35.0,
  scale: 1.0,
  unitType: 'meters',
  opacity: 0.95,
  strokeColor: 'layer',
  strokeWidth: 2,
  fillPolygons: true,
  isLocked: false,
};

export default function App() {
  // Load initial model from first preset
  const [model, setModel] = useState<ParsedDxfModel | null>(() => {
    return SAMPLE_DXF_PRESETS[0].generate();
  });

  const [transform, setTransform] = useState<TransformState>(() => {
    try {
      const saved = localStorage.getItem('dxf_transform_state');
      if (saved) {
        return { ...DEFAULT_TRANSFORM, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_TRANSFORM;
  });

  const [tileProvider, setTileProvider] = useState<MapTileProvider>('esri_satellite');
  const [isDragModeActive, setIsDragModeActive] = useState<boolean>(false);
  const [isMeasureModeActive, setIsMeasureModeActive] = useState<boolean>(false);
  const [isLateralGateOpen, setIsLateralGateOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [userGpsLocation, setUserGpsLocation] = useState<UserGpsLocation | null>(null);
  const [currentMapCenter, setCurrentMapCenter] = useState<{ lat: number; lng: number }>({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
  });

  // --- Sequential Survey Points State ---
  const [surveyPoints, setSurveyPoints] = useState<SurveySequencePoint[]>(() => {
    try {
      const saved = localStorage.getItem('survey_points_sequence');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });
  const [isSurveyModeActive, setIsSurveyModeActive] = useState<boolean>(false);
  const [isPolygonClosed, setIsPolygonClosed] = useState<boolean>(false);
  const [isSurveyExportModalOpen, setIsSurveyExportModalOpen] = useState<boolean>(false);

  // Save survey points to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('survey_points_sequence', JSON.stringify(surveyPoints));
    } catch {
      // ignore
    }
  }, [surveyPoints]);

  // Toggle handlers that ensure drag, measurement and survey modes don't conflict
  const handleToggleDragMode = useCallback(() => {
    setIsDragModeActive((prev) => {
      const next = !prev;
      if (next) {
        setIsMeasureModeActive(false);
        setIsSurveyModeActive(false);
      }
      return next;
    });
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, []);

  const handleToggleMeasureMode = useCallback(() => {
    setIsMeasureModeActive((prev) => {
      const next = !prev;
      if (next) {
        setIsDragModeActive(false);
        setIsSurveyModeActive(false);
      }
      return next;
    });
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, []);

  const handleToggleSurveyMode = useCallback(() => {
    setIsSurveyModeActive((prev) => {
      const next = !prev;
      if (next) {
        setIsDragModeActive(false);
        setIsMeasureModeActive(false);
      }
      return next;
    });
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, []);

  // Survey Point actions
  const handleAddSurveyPoint = useCallback((coords: { lat: number; lng: number }) => {
    setSurveyPoints((prev) => {
      const newPoint: SurveySequencePoint = {
        id: `p-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        index: prev.length + 1,
        lat: coords.lat,
        lng: coords.lng,
        label: `P${prev.length + 1}`,
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
      };
      return recalculateSurveyPoints([...prev, newPoint]);
    });
    if ('vibrate' in navigator) navigator.vibrate([15, 30]);
  }, []);

  const handleAddSurveyPointAtViewCenter = useCallback(() => {
    handleAddSurveyPoint({ lat: currentMapCenter.lat, lng: currentMapCenter.lng });
  }, [handleAddSurveyPoint, currentMapCenter]);

  const handleAddSurveyPointAtGps = useCallback(() => {
    if (userGpsLocation) {
      handleAddSurveyPoint({ lat: userGpsLocation.lat, lng: userGpsLocation.lng });
      return;
    }
    if (!navigator.geolocation) {
      alert('Geolocalização não disponível.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleAddSurveyPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        alert('Não foi possível obter a posição GPS atual. Verifique as permissões de localização.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [handleAddSurveyPoint, userGpsLocation]);

  const handleRemoveSurveyPoint = useCallback((id: string) => {
    setSurveyPoints((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      return recalculateSurveyPoints(filtered);
    });
  }, []);

  const handleUndoSurveyPoint = useCallback(() => {
    setSurveyPoints((prev) => {
      if (prev.length === 0) return prev;
      const popped = prev.slice(0, -1);
      return recalculateSurveyPoints(popped);
    });
    if ('vibrate' in navigator) navigator.vibrate(10);
  }, []);

  const handleClearSurveyPoints = useCallback(() => {
    setSurveyPoints([]);
    setIsPolygonClosed(false);
    if ('vibrate' in navigator) navigator.vibrate(20);
  }, []);

  const handleTogglePolygonClosed = useCallback(() => {
    setIsPolygonClosed((prev) => !prev);
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, []);

  // Save transform to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('dxf_transform_state', JSON.stringify(transform));
    } catch {
      // ignore
    }
  }, [transform]);

  // Handle Loading DXF text
  const handleLoadDxfContent = useCallback((text: string, name: string) => {
    try {
      const parsed = parseDxfContent(text, name);
      setModel(parsed);
      setIsDragModeActive(true);
      if ('vibrate' in navigator) navigator.vibrate([15, 50, 15]);
    } catch (err) {
      console.error('Falha ao processar arquivo DXF:', err);
      alert('Não foi possível ler o arquivo DXF. Verifique se é um arquivo DXF 2D ASCII válido.');
    }
  }, []);

  // Handle Preset selection
  const handleSelectSample = useCallback((presetId: string) => {
    const preset = SAMPLE_DXF_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      const generated = preset.generate();
      setModel(generated);
      setTransform((prev) => ({
        ...prev,
        scale: preset.defaultScale,
      }));
      if ('vibrate' in navigator) navigator.vibrate(15);
    }
  }, []);

  // Center model on current GPS location
  const handleCenterModelOnGps = useCallback(() => {
    // If live GPS location is already tracked, immediately use it!
    if (userGpsLocation) {
      setTransform((prev) => ({
        ...prev,
        centerLat: userGpsLocation.lat,
        centerLng: userGpsLocation.lng,
      }));
      if ('vibrate' in navigator) navigator.vibrate([20, 40, 20]);
      return;
    }

    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada neste dispositivo.');
      return;
    }

    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        const { latitude, longitude } = pos.coords;
        setTransform((prev) => ({
          ...prev,
          centerLat: latitude,
          centerLng: longitude,
        }));
        if ('vibrate' in navigator) navigator.vibrate([20, 40, 20]);
      },
      (err) => {
        setIsLocatingGps(false);
        console.warn('Erro ao obter GPS:', err);
        alert('Não foi possível obter a localização GPS. Verifique as permissões de localização.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [userGpsLocation]);

  // Center model on current view
  const handleCenterModelOnView = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      centerLat: currentMapCenter.lat,
      centerLng: currentMapCenter.lng,
    }));
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, [currentMapCenter]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none touch-none">
      {/* 1. Fullscreen Satellite Map with DXF Canvas Overlay */}
      <main className="w-full h-full relative">
        <SatelliteMap
          model={model}
          transform={transform}
          onTransformChange={setTransform}
          tileProvider={tileProvider}
          onTileProviderChange={setTileProvider}
          isDragModeActive={isDragModeActive}
          onToggleDragMode={handleToggleDragMode}
          isMeasureModeActive={isMeasureModeActive}
          onToggleMeasureMode={handleToggleMeasureMode}
          onCenterModelOnView={handleCenterModelOnView}
          onCenterModelOnGps={handleCenterModelOnGps}
          isLocatingGps={isLocatingGps}
          onMapCenterChange={setCurrentMapCenter}
          onUserGpsLocationChange={setUserGpsLocation}
          surveyPoints={surveyPoints}
          isSurveyModeActive={isSurveyModeActive}
          onToggleSurveyMode={handleToggleSurveyMode}
          onAddSurveyPoint={handleAddSurveyPoint}
          isPolygonClosed={isPolygonClosed}
          onUndoSurveyPoint={handleUndoSurveyPoint}
          onClearSurveyPoints={handleClearSurveyPoints}
          onOpenSurveyExport={() => setIsSurveyExportModalOpen(true)}
        />
      </main>

      {/* 2. Lateral Command Gate (Portão de Comando Lateral com Aba Pontos) */}
      <LateralControlGate
        model={model}
        transform={transform}
        onTransformChange={setTransform}
        onLoadDxfContent={handleLoadDxfContent}
        onSelectSample={handleSelectSample}
        isDragModeActive={isDragModeActive}
        onToggleDragMode={handleToggleDragMode}
        onCenterModelOnView={handleCenterModelOnView}
        onCenterModelOnGps={handleCenterModelOnGps}
        isOpen={isLateralGateOpen}
        onToggleOpen={() => setIsLateralGateOpen((prev) => !prev)}
        surveyPoints={surveyPoints}
        isSurveyModeActive={isSurveyModeActive}
        onToggleSurveyMode={handleToggleSurveyMode}
        onAddSurveyPointAtViewCenter={handleAddSurveyPointAtViewCenter}
        onAddSurveyPointAtGps={handleAddSurveyPointAtGps}
        onRemoveSurveyPoint={handleRemoveSurveyPoint}
        onUndoSurveyPoint={handleUndoSurveyPoint}
        onClearSurveyPoints={handleClearSurveyPoints}
        isPolygonClosed={isPolygonClosed}
        onTogglePolygonClosed={handleTogglePolygonClosed}
        onOpenSurveyExport={() => setIsSurveyExportModalOpen(true)}
      />

      {/* 3. Mobile Thumb Quick Action Bar */}
      <MobileQuickBar
        transform={transform}
        onTransformChange={setTransform}
        isDragModeActive={isDragModeActive}
        onToggleDragMode={handleToggleDragMode}
        onCenterModelOnView={handleCenterModelOnView}
        onCenterModelOnGps={handleCenterModelOnGps}
        isLocatingGps={isLocatingGps}
        isLateralGateOpen={isLateralGateOpen}
        onToggleLateralGate={() => setIsLateralGateOpen((prev) => !prev)}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
      />

      {/* 4. DXF Import & Presets Modal */}
      <DxfUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onLoadDxfContent={handleLoadDxfContent}
        onSelectSample={handleSelectSample}
      />

      {/* 5. Survey Coordinates Export Modal (TXT, CSV, Tabela) */}
      <SurveyExportModal
        isOpen={isSurveyExportModalOpen}
        onClose={() => setIsSurveyExportModalOpen(false)}
        points={surveyPoints}
        isClosed={isPolygonClosed}
        projectName={model ? model.name : 'Levantamento de Campo'}
      />
    </div>
  );
}
