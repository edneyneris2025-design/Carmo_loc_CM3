import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  Camera,
  CheckCircle2,
  Compass,
  Crosshair,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Layers,
  ListOrdered,
  Loader2,
  Locate,
  Lock,
  MapPin,
  Move,
  Navigation,
  Plus,
  Radio,
  RotateCw,
  Ruler,
  Satellite,
  Search,
  Share2,
  Tag,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  MapAnnotation,
  MapTileProvider,
  MeasurementPoint,
  ParsedDxfModel,
  SurveySequencePoint,
  TransformState,
  UserGpsLocation,
} from '../types';
import {
  calculateAzimuth,
  calculateDistanceMeters,
  calculatePolygonAreaM2,
  dxfPointToLatLng,
  formatDistance,
  formatLatLng,
  getCompassDirection,
  toDMS,
} from '../utils/geoTransform';

interface SatelliteMapProps {
  model: ParsedDxfModel | null;
  transform: TransformState;
  onTransformChange: (updater: (prev: TransformState) => TransformState) => void;
  tileProvider: MapTileProvider;
  onTileProviderChange: (provider: MapTileProvider) => void;
  isDragModeActive: boolean;
  onToggleDragMode: () => void;
  onCenterModelOnView: () => void;
  onCenterModelOnGps: () => void;
  isLocatingGps: boolean;
  onMapCenterChange?: (coords: { lat: number; lng: number }) => void;
  isMeasureModeActive: boolean;
  onToggleMeasureMode: () => void;
  onUserGpsLocationChange?: (location: UserGpsLocation | null) => void;
  // Survey Points Feature
  surveyPoints?: SurveySequencePoint[];
  isSurveyModeActive?: boolean;
  onToggleSurveyMode?: () => void;
  onAddSurveyPoint?: (coords: { lat: number; lng: number }) => void;
  isPolygonClosed?: boolean;
  onUndoSurveyPoint?: () => void;
  onClearSurveyPoints?: () => void;
  onOpenSurveyExport?: () => void;
}

const TILE_CONFIGS: Record<MapTileProvider, { url: string; attribution: string; subdomains?: string[]; maxZoom: number; label: string }> = {
  esri_satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
    label: 'Satélite Puro (Esri)',
  },
  satellite_hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri Satellite + Labels',
    maxZoom: 19,
    label: 'Satélite Híbrido (com Vias/Nomes)',
  },
  esri_clarity: {
    url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri Clarity Satellite',
    maxZoom: 19,
    label: 'Satélite Alta Claridade',
  },
  osm_streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    label: 'Ruas / Topográfico (OSM)',
  },
};

export const SatelliteMap: React.FC<SatelliteMapProps> = ({
  model,
  transform,
  onTransformChange,
  tileProvider,
  onTileProviderChange,
  isDragModeActive,
  onToggleDragMode,
  onCenterModelOnGps,
  isLocatingGps,
  onMapCenterChange,
  isMeasureModeActive,
  onToggleMeasureMode,
  onUserGpsLocationChange,
  surveyPoints = [],
  isSurveyModeActive = false,
  onToggleSurveyMode,
  onAddSurveyPoint,
  isPolygonClosed = false,
  onUndoSurveyPoint,
  onClearSurveyPoints,
  onOpenSurveyExport,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);

  // --- Real-Time Cell Phone GPS Tracking States ---
  const [userGpsLocation, setUserGpsLocation] = useState<UserGpsLocation | null>(null);
  const [isGpsLiveTracking, setIsGpsLiveTracking] = useState<boolean>(false);
  const [isGpsFollowMode, setIsGpsFollowMode] = useState<boolean>(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);

  // Survey Mode Live Cursor Hover Point
  const [surveyHoverPoint, setSurveyHoverPoint] = useState<{ lat: number; lng: number } | null>(null);

  const gpsWatchIdRef = useRef<number | null>(null);
  const isGpsFollowModeRef = useRef<boolean>(true);
  useEffect(() => {
    isGpsFollowModeRef.current = isGpsFollowMode;
  }, [isGpsFollowMode]);

  // Sync GPS location to parent component
  useEffect(() => {
    onUserGpsLocationChange?.(userGpsLocation);
  }, [userGpsLocation, onUserGpsLocationChange]);

  // Stop continuous GPS tracking
  const stopGpsTracking = useCallback(() => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setIsGpsLiveTracking(false);
    setIsGpsFollowMode(false);
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, []);

  // Start continuous GPS tracking with watchPosition
  const startGpsTracking = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada neste dispositivo ou navegador.');
      return;
    }

    setGpsError(null);
    setIsGpsLiveTracking(true);
    setIsGpsFollowMode(true);
    if ('vibrate' in navigator) navigator.vibrate([20, 40, 20]);

    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc: UserGpsLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed !== null && pos.coords.speed >= 0 ? pos.coords.speed : null,
          altitude: pos.coords.altitude !== null ? pos.coords.altitude : null,
          timestamp: pos.timestamp,
        };

        setUserGpsLocation(newLoc);
        setGpsError(null);

        // Pan map smoothly if follow mode is active
        const map = mapInstanceRef.current;
        if (map && isGpsFollowModeRef.current) {
          map.panTo([newLoc.lat, newLoc.lng], { animate: true, duration: 0.8 });
        }
      },
      (err) => {
        console.warn('Erro ao obter posição GPS contínua:', err);
        if (err.code === 1) {
          setGpsError('Permissão de GPS negada. Ative a localização no navegador.');
          setIsGpsLiveTracking(false);
        } else if (err.code === 2) {
          setGpsError('Sinal de GPS indisponível no momento.');
        } else if (err.code === 3) {
          setGpsError('Tempo limite excedido na obtenção de sinal GPS.');
        } else {
          setGpsError('Erro ao rastrear localização GPS.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      }
    );

    gpsWatchIdRef.current = watchId;
  }, []);

  // Toggle or re-center GPS tracking
  const handleToggleGpsTracking = useCallback(() => {
    if (!isGpsLiveTracking) {
      startGpsTracking();
    } else if (!isGpsFollowMode) {
      setIsGpsFollowMode(true);
      if (userGpsLocation && mapInstanceRef.current) {
        mapInstanceRef.current.flyTo(
          [userGpsLocation.lat, userGpsLocation.lng],
          Math.max(mapInstanceRef.current.getZoom(), 17),
          { duration: 1.0 }
        );
      }
      if ('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
    } else {
      setIsGpsFollowMode(false);
      if ('vibrate' in navigator) navigator.vibrate(10);
    }
  }, [isGpsLiveTracking, isGpsFollowMode, startGpsTracking, userGpsLocation]);

  // Clean up GPS watch on unmount
  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, []);

  // Listen to device compass orientation
  useEffect(() => {
    if (!isGpsLiveTracking) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      let heading: number | null = null;
      const anyEvent = e as unknown as { webkitCompassHeading?: number };
      if (typeof anyEvent.webkitCompassHeading === 'number') {
        heading = anyEvent.webkitCompassHeading;
      } else if (e.alpha !== null && e.alpha !== undefined) {
        heading = (360 - e.alpha) % 360;
      }
      if (heading !== null && !isNaN(heading)) {
        setDeviceHeading(Math.round(heading));
      }
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.addEventListener('deviceorientation', handleOrientation as EventListener, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
    };
  }, [isGpsLiveTracking]);

  const [currentZoom, setCurrentZoom] = useState<number>(17);
  const [mapCenterCoords, setMapCenterCoords] = useState<{ lat: number; lng: number }>({
    lat: transform.centerLat,
    lng: transform.centerLng,
  });
  const [showTileSelector, setShowTileSelector] = useState(false);
  const [isDraggingAnchor, setIsDraggingAnchor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Measurement State
  const [measurePointA, setMeasurePointA] = useState<MeasurementPoint | null>(null);
  const [measurePointB, setMeasurePointB] = useState<MeasurementPoint | null>(null);
  const [measureHoverPoint, setMeasureHoverPoint] = useState<MeasurementPoint | null>(null);

  const handleClearMeasurement = useCallback(() => {
    setMeasurePointA(null);
    setMeasurePointB(null);
    setMeasureHoverPoint(null);
    if ('vibrate' in navigator) navigator.vibrate(10);
  }, []);

  // When measurement mode is turned off, reset points
  useEffect(() => {
    if (!isMeasureModeActive) {
      setMeasureHoverPoint(null);
    }
  }, [isMeasureModeActive]);

  // Image Export States (Carmo Energy)
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string | null>(null);
  const [exportFileName, setExportFileName] = useState<string>('');

  // Map Text Annotations (Anotações de Texto no Mapa)
  const [annotations, setAnnotations] = useState<MapAnnotation[]>(() => {
    try {
      const saved = localStorage.getItem('carmo_dxf_map_annotations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isTextModeActive, setIsTextModeActive] = useState<boolean>(false);
  const [pendingTextPoint, setPendingTextPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [inputTextValue, setInputTextValue] = useState<string>('');
  const [inputTextColor, setInputTextColor] = useState<string>('#f59e0b');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);

  // Sync annotations to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('carmo_dxf_map_annotations', JSON.stringify(annotations));
    } catch {}
  }, [annotations]);

  // Handle open annotation dialog
  const handleOpenNewAnnotation = useCallback((point: { lat: number; lng: number }) => {
    setPendingTextPoint(point);
    setEditingAnnotationId(null);
    setInputTextValue('');
    setInputTextColor('#f59e0b');
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, []);

  const handleOpenEditAnnotation = useCallback((ann: MapAnnotation) => {
    setPendingTextPoint({ lat: ann.lat, lng: ann.lng });
    setEditingAnnotationId(ann.id);
    setInputTextValue(ann.text);
    setInputTextColor(ann.color || '#f59e0b');
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, []);

  const handleSaveAnnotation = useCallback(() => {
    const trimmed = inputTextValue.trim();
    if (!trimmed || !pendingTextPoint) return;

    if (editingAnnotationId) {
      setAnnotations((prev) =>
        prev.map((item) =>
          item.id === editingAnnotationId
            ? { ...item, text: trimmed, color: inputTextColor }
            : item
        )
      );
    } else {
      const newAnn: MapAnnotation = {
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        lat: pendingTextPoint.lat,
        lng: pendingTextPoint.lng,
        text: trimmed,
        color: inputTextColor,
        createdAt: Date.now(),
      };
      setAnnotations((prev) => [...prev, newAnn]);
    }

    setPendingTextPoint(null);
    setEditingAnnotationId(null);
    setInputTextValue('');
    if ('vibrate' in navigator) navigator.vibrate([10, 30, 10]);
  }, [inputTextValue, pendingTextPoint, editingAnnotationId, inputTextColor]);

  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((item) => item.id !== id));
    setPendingTextPoint(null);
    setEditingAnnotationId(null);
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, []);

  const handleClearAllAnnotations = useCallback(() => {
    if (window.confirm('Deseja excluir todas as anotações de texto do mapa?')) {
      setAnnotations([]);
      setPendingTextPoint(null);
      setEditingAnnotationId(null);
      if ('vibrate' in navigator) navigator.vibrate(20);
    }
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Create map with initial center
    const map = L.map(mapContainerRef.current, {
      center: [transform.centerLat, transform.centerLng],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
      inertia: true,
      wheelPxPerZoomLevel: 100,
    });

    mapInstanceRef.current = map;

    // Add scale bar
    L.control
      .scale({
        imperial: false,
        metric: true,
        position: 'bottomleft',
      })
      .addTo(map);

    const updateMapState = () => {
      const c = map.getCenter();
      setMapCenterCoords({ lat: c.lat, lng: c.lng });
      setCurrentZoom(map.getZoom());
      onMapCenterChange?.({ lat: c.lat, lng: c.lng });
    };

    const handleDragStart = () => {
      setIsGpsFollowMode(false);
    };

    map.on('move', updateMapState);
    map.on('zoom', updateMapState);
    map.on('dragstart', handleDragStart);

    // Initial broadcast
    updateMapState();

    // Resize handler
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      map.off('move', updateMapState);
      map.off('zoom', updateMapState);
      map.off('dragstart', handleDragStart);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Search address handler using Nominatim geocoder
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
          searchQuery.trim()
        )}`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const targetLat = parseFloat(data[0].lat);
        const targetLng = parseFloat(data[0].lon);
        mapInstanceRef.current?.flyTo([targetLat, targetLng], 17, { duration: 1.2 });
        setIsSearchOpen(false);
        if ('vibrate' in navigator) navigator.vibrate(20);
      } else {
        alert('Endereço ou local não encontrado. Tente digitar o nome da cidade ou rua.');
      }
    } catch (err) {
      console.error('Erro na busca de endereço:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Update Tile Layers when tileProvider changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
    }
    if (labelsLayerRef.current) {
      map.removeLayer(labelsLayerRef.current);
      labelsLayerRef.current = null;
    }

    const cfg = TILE_CONFIGS[tileProvider];
    const baseLayer = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      subdomains: cfg.subdomains || [],
      attribution: cfg.attribution,
      crossOrigin: true,
    }).addTo(map);
    baseTileLayerRef.current = baseLayer;

    // If hybrid, add reference boundaries and labels
    if (tileProvider === 'satellite_hybrid') {
      const labelLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 0.85, crossOrigin: true }
      ).addTo(map);
      labelsLayerRef.current = labelLayer;
    }
  }, [tileProvider]);

  // Synchronize canvas resolution and redraw
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const map = mapInstanceRef.current;
    if (!canvas || !map) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (model && model.entities.length > 0) {
      const { bounds } = model;
      ctx.globalAlpha = Math.max(0.1, Math.min(1.0, transform.opacity));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const globalStrokeColor = transform.strokeColor;
      const defaultWidth = transform.strokeWidth || 2;

    // Draw DXF Entities
    for (const ent of model.entities) {
      // Check layer visibility
      const layerCfg = model.layers[ent.layer];
      if (layerCfg && layerCfg.visible === false) {
        continue;
      }

      const entityColor = globalStrokeColor === 'layer' ? ent.color || '#38bdf8' : globalStrokeColor;
      ctx.strokeStyle = entityColor;
      ctx.lineWidth = defaultWidth;

      if (ent.type === 'LINE' && ent.startPoint && ent.endPoint) {
        const p1LatLng = dxfPointToLatLng(ent.startPoint, bounds, transform);
        const p2LatLng = dxfPointToLatLng(ent.endPoint, bounds, transform);

        const pt1 = map.latLngToContainerPoint(p1LatLng);
        const pt2 = map.latLngToContainerPoint(p2LatLng);

        ctx.beginPath();
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.stroke();
      } else if (
        (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') &&
        ent.vertices &&
        ent.vertices.length > 1
      ) {
        ctx.beginPath();
        for (let i = 0; i < ent.vertices.length; i++) {
          const latLng = dxfPointToLatLng(ent.vertices[i], bounds, transform);
          const screenPt = map.latLngToContainerPoint(latLng);
          if (i === 0) {
            ctx.moveTo(screenPt.x, screenPt.y);
          } else {
            ctx.lineTo(screenPt.x, screenPt.y);
          }
        }

        if (ent.isClosed) {
          ctx.closePath();
          if (transform.fillPolygons) {
            ctx.fillStyle = entityColor;
            ctx.globalAlpha = transform.opacity * 0.25;
            ctx.fill();
            ctx.globalAlpha = transform.opacity;
          }
        }
        ctx.stroke();
      } else if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
        const centerLatLng = dxfPointToLatLng(ent.center, bounds, transform);
        const screenCenter = map.latLngToContainerPoint(centerLatLng);

        // Calculate screen radius in pixels
        const rimPoint = dxfPointToLatLng(
          { x: ent.center.x + ent.radius, y: ent.center.y },
          bounds,
          transform
        );
        const screenRim = map.latLngToContainerPoint(rimPoint);
        const pixelRadius = Math.hypot(screenRim.x - screenCenter.x, screenRim.y - screenCenter.y);

        ctx.beginPath();
        ctx.arc(screenCenter.x, screenCenter.y, Math.max(1, pixelRadius), 0, Math.PI * 2);
        ctx.stroke();
      } else if (ent.type === 'ARC' && ent.center && ent.radius) {
        // Approximate arc
        const sa = ((ent.startAngle || 0) * Math.PI) / 180;
        const ea = ((ent.endAngle || 360) * Math.PI) / 180;
        const steps = 24;
        let angleDiff = ea - sa;
        if (angleDiff < 0) angleDiff += Math.PI * 2;

        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const angle = sa + (angleDiff * s) / steps;
          const arcPt = {
            x: ent.center.x + ent.radius * Math.cos(angle),
            y: ent.center.y + ent.radius * Math.sin(angle),
          };
          const latLng = dxfPointToLatLng(arcPt, bounds, transform);
          const screenPt = map.latLngToContainerPoint(latLng);
          if (s === 0) ctx.moveTo(screenPt.x, screenPt.y);
          else ctx.lineTo(screenPt.x, screenPt.y);
        }
        ctx.stroke();
      } else if (ent.type === 'TEXT' && ent.startPoint && ent.text) {
        const latLng = dxfPointToLatLng(ent.startPoint, bounds, transform);
        const screenPt = map.latLngToContainerPoint(latLng);

        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 2.5;
        ctx.strokeText(ent.text, screenPt.x, screenPt.y);
        ctx.fillText(ent.text, screenPt.x, screenPt.y);
      }
    }

    // Draw Central Pivot / Anchor Marker
    const anchorScreen = map.latLngToContainerPoint([transform.centerLat, transform.centerLng]);

    ctx.globalAlpha = 1.0;

    // Glowing outer circle for anchor
    ctx.beginPath();
    ctx.arc(anchorScreen.x, anchorScreen.y, 16, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Crosshair lines inside anchor
    ctx.beginPath();
    ctx.moveTo(anchorScreen.x - 22, anchorScreen.y);
    ctx.lineTo(anchorScreen.x + 22, anchorScreen.y);
    ctx.moveTo(anchorScreen.x, anchorScreen.y - 22);
    ctx.lineTo(anchorScreen.x, anchorScreen.y + 22);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center point
    ctx.beginPath();
    ctx.arc(anchorScreen.x, anchorScreen.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

    // Draw Measurement overlay on Canvas if active
    if (measurePointA) {
      const ptA = map.latLngToContainerPoint([measurePointA.lat, measurePointA.lng]);
      const targetPoint = measurePointB || measureHoverPoint;

      if (targetPoint) {
        const ptB = map.latLngToContainerPoint([targetPoint.lat, targetPoint.lng]);

        // Contrast dark background stroke
        ctx.beginPath();
        ctx.moveTo(ptA.x, ptA.y);
        ctx.lineTo(ptB.x, ptB.y);
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 5;
        ctx.setLineDash([]);
        ctx.stroke();

        // High-visibility dashed measurement line
        ctx.beginPath();
        ctx.moveTo(ptA.x, ptA.y);
        ctx.lineTo(ptB.x, ptB.y);
        ctx.strokeStyle = '#f59e0b'; // Amber 500
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Calculate Distance
        const distMeters = calculateDistanceMeters(
          measurePointA.lat,
          measurePointA.lng,
          targetPoint.lat,
          targetPoint.lng
        );
        const distFormatted = formatDistance(distMeters);

        // End Ticks perpendicular to the line
        const angle = Math.atan2(ptB.y - ptA.y, ptB.x - ptA.x);
        const tickLength = 12;

        // Tick A
        ctx.beginPath();
        ctx.moveTo(
          ptA.x - Math.sin(angle) * tickLength,
          ptA.y + Math.cos(angle) * tickLength
        );
        ctx.lineTo(
          ptA.x + Math.sin(angle) * tickLength,
          ptA.y - Math.cos(angle) * tickLength
        );
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Tick B
        ctx.beginPath();
        ctx.moveTo(
          ptB.x - Math.sin(angle) * tickLength,
          ptB.y + Math.cos(angle) * tickLength
        );
        ctx.lineTo(
          ptB.x + Math.sin(angle) * tickLength,
          ptB.y - Math.cos(angle) * tickLength
        );
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Midpoint Dimension Pill
        const midX = (ptA.x + ptB.x) / 2;
        const midY = (ptA.y + ptB.y) / 2;

        ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
        const textWidth = ctx.measureText(distFormatted).width;
        const padX = 8;
        const padY = 4;
        const badgeW = textWidth + padX * 2;
        const badgeH = 22;

        // Draw pill background
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const bx = midX - badgeW / 2;
        const by = midY - badgeH / 2 - 14;
        const r = 6;
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + badgeW - r, by);
        ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + r);
        ctx.lineTo(bx + badgeW, by + badgeH - r);
        ctx.quadraticCurveTo(bx + badgeW, by + badgeH, bx + badgeW - r, by + badgeH);
        ctx.lineTo(bx + r, by + badgeH);
        ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - r);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Pill text
        ctx.fillStyle = '#fde68a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(distFormatted, midX, midY - 14);

        // Marker B Node
        ctx.beginPath();
        ctx.arc(ptB.x, ptB.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('B', ptB.x, ptB.y);
      }

      // Marker A Node
      ctx.beginPath();
      ctx.arc(ptA.x, ptA.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('A', ptA.x, ptA.y);
    }

    // ----------------------------------------
    // Render Map Text Annotations (Anotações de Texto)
    // ----------------------------------------
    if (annotations && annotations.length > 0) {
      for (const ann of annotations) {
        const pt = map.latLngToContainerPoint([ann.lat, ann.lng]);
        const annColor = ann.color || '#f59e0b';

        // 1. Center Ground Pinpoint
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = annColor;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = annColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 2. Angled Leader Callout Line
        const leaderOffsetX = 16;
        const leaderOffsetY = -18;
        const targetX = pt.x + leaderOffsetX;
        const targetY = pt.y + leaderOffsetY;

        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x + 6, pt.y - 8);
        ctx.lineTo(targetX, targetY);
        ctx.strokeStyle = annColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 3. Measure Text Badge
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        const textWidth = ctx.measureText(ann.text).width;
        const padX = 9;
        const badgeW = textWidth + padX * 2;
        const badgeH = 24;
        const badgeX = targetX;
        const badgeY = targetY - badgeH / 2;

        // Draw rounded rectangle badge
        const r = 6;
        ctx.fillStyle = 'rgba(11, 15, 25, 0.94)';
        ctx.strokeStyle = annColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(badgeX + r, badgeY);
        ctx.lineTo(badgeX + badgeW - r, badgeY);
        ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + r);
        ctx.lineTo(badgeX + badgeW, badgeY + badgeH - r);
        ctx.quadraticCurveTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - r, badgeY + badgeH);
        ctx.lineTo(badgeX + r, badgeY + badgeH);
        ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - r);
        ctx.lineTo(badgeX, badgeY + r);
        ctx.quadraticCurveTo(badgeX, badgeY, badgeX + r, badgeY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Label Text
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ann.text, badgeX + padX, badgeY + badgeH / 2);
      }
    }

    // ----------------------------------------
    // Render Live Cell Phone GPS Location Point
    // ----------------------------------------
    if (userGpsLocation) {
      const userPt = map.latLngToContainerPoint([userGpsLocation.lat, userGpsLocation.lng]);
      const margin = 200;

      if (
        userPt.x >= -margin &&
        userPt.x <= width + margin &&
        userPt.y >= -margin &&
        userPt.y <= height + margin
      ) {
        // 1. Accuracy Circle (calculated in meters on current map scale)
        const latOffset = userGpsLocation.lat + userGpsLocation.accuracy / 111320;
        const edgePt = map.latLngToContainerPoint([latOffset, userGpsLocation.lng]);
        const accRadiusPx = Math.max(10, Math.min(Math.abs(userPt.y - edgePt.y), 450));

        ctx.beginPath();
        ctx.arc(userPt.x, userPt.y, accRadiusPx, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Animated Radiant Radar Pulse Wave
        const pulsePhase = (Date.now() % 2400) / 2400; // 0 to 1
        const pulseRadius = 14 + pulsePhase * 28;
        const pulseAlpha = (1 - pulsePhase) * 0.75;

        ctx.beginPath();
        ctx.arc(userPt.x, userPt.y, pulseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56, 189, 248, ${pulseAlpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 3. Directional Heading Cone / Wedge
        const currentHeading = userGpsLocation.heading ?? deviceHeading;
        if (currentHeading !== null && currentHeading !== undefined && !isNaN(currentHeading)) {
          const rad = ((currentHeading - 90) * Math.PI) / 180;
          const coneAngle = (55 * Math.PI) / 180;
          const coneRadius = Math.max(40, Math.min(accRadiusPx * 0.8, 90));

          const coneGrad = ctx.createRadialGradient(userPt.x, userPt.y, 4, userPt.x, userPt.y, coneRadius);
          coneGrad.addColorStop(0, 'rgba(56, 189, 248, 0.65)');
          coneGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

          ctx.beginPath();
          ctx.moveTo(userPt.x, userPt.y);
          ctx.arc(userPt.x, userPt.y, coneRadius, rad - coneAngle / 2, rad + coneAngle / 2);
          ctx.closePath();
          ctx.fillStyle = coneGrad;
          ctx.fill();
        }

        // 4. Center GPS Dot
        // Outer white ring
        ctx.beginPath();
        ctx.arc(userPt.x, userPt.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Vivid Blue/Cyan core
        ctx.beginPath();
        ctx.arc(userPt.x, userPt.y, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = '#0284c7';
        ctx.fill();

        // Center white pinpoint
        ctx.beginPath();
        ctx.arc(userPt.x, userPt.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // 5. User Label Pill Badge
        const speedKmh = userGpsLocation.speed && userGpsLocation.speed > 0.5
          ? `${(userGpsLocation.speed * 3.6).toFixed(1)} km/h`
          : null;
        const labelText = speedKmh
          ? `Você (${speedKmh} · ±${Math.round(userGpsLocation.accuracy)}m)`
          : `Você (GPS ±${Math.round(userGpsLocation.accuracy)}m)`;

        ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
        const pillW = ctx.measureText(labelText).width + 12;
        const pillH = 18;
        const pillX = userPt.x - pillW / 2;
        const pillY = userPt.y - 30;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const pillR = 5;
        ctx.moveTo(pillX + pillR, pillY);
        ctx.lineTo(pillX + pillW - pillR, pillY);
        ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR);
        ctx.lineTo(pillX + pillW, pillY + pillH - pillR);
        ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH);
        ctx.lineTo(pillX + pillR, pillY + pillH);
        ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR);
        ctx.lineTo(pillX, pillY + pillR);
        ctx.quadraticCurveTo(pillX, pillY, pillX + pillR, pillY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e0f2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, userPt.x, pillY + pillH / 2);
      }
    }

    // ----------------------------------------
    // Render Sequential Survey Points (Pontos Sequenciais P1, P2...)
    // ----------------------------------------
    if (surveyPoints && surveyPoints.length > 0) {
      const containerPts = surveyPoints.map((p) => map.latLngToContainerPoint([p.lat, p.lng]));

      // 1. Polygon Fill (if closed and >= 3 points)
      if (isPolygonClosed && containerPts.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(containerPts[0].x, containerPts[0].y);
        for (let i = 1; i < containerPts.length; i++) {
          ctx.lineTo(containerPts[i].x, containerPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
        ctx.fill();
      }

      // 2. Polyline Segments
      ctx.beginPath();
      ctx.moveTo(containerPts[0].x, containerPts[0].y);
      for (let i = 1; i < containerPts.length; i++) {
        ctx.lineTo(containerPts[i].x, containerPts[i].y);
      }
      if (isPolygonClosed && containerPts.length >= 3) {
        ctx.lineTo(containerPts[0].x, containerPts[0].y);
      }

      // Glowing outer line
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 5;
      ctx.stroke();

      // Sharp inner line
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 3. Live hover rubber-band line from last point to cursor
      if (isSurveyModeActive && surveyHoverPoint && containerPts.length > 0) {
        const lastPt = containerPts[containerPts.length - 1];
        const hoverScr = map.latLngToContainerPoint([surveyHoverPoint.lat, surveyHoverPoint.lng]);

        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(lastPt.x, lastPt.y);
        ctx.lineTo(hoverScr.x, hoverScr.y);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Distance preview badge on cursor segment
        const lastGeo = surveyPoints[surveyPoints.length - 1];
        const liveDist = calculateDistanceMeters(lastGeo.lat, lastGeo.lng, surveyHoverPoint.lat, surveyHoverPoint.lng);
        const midX = (lastPt.x + hoverScr.x) / 2;
        const midY = (lastPt.y + hoverScr.y) / 2;

        const liveText = `+${formatDistance(liveDist)}`;
        ctx.font = 'bold 11px system-ui, monospace';
        const tw = ctx.measureText(liveText).width;
        const pw = tw + 12;
        const ph = 20;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(midX - pw / 2, midY - ph / 2, pw, ph, 5);
        } else {
          ctx.rect(midX - pw / 2, midY - ph / 2, pw, ph);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(liveText, midX, midY);
      }

      // 4. Segment Distance Badges
      for (let i = 0; i < containerPts.length - 1; i++) {
        const p1 = containerPts[i];
        const p2 = containerPts[i + 1];
        const segDist = surveyPoints[i + 1].distanceFromPrev || calculateDistanceMeters(
          surveyPoints[i].lat,
          surveyPoints[i].lng,
          surveyPoints[i + 1].lat,
          surveyPoints[i + 1].lng
        );

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const distStr = formatDistance(segDist);

        ctx.font = 'bold 10px system-ui, monospace';
        const txtW = ctx.measureText(distStr).width;
        const bw = txtW + 12;
        const bh = 18;

        ctx.fillStyle = 'rgba(11, 15, 25, 0.92)';
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(midX - bw / 2, midY - bh / 2, bw, bh, 4);
        } else {
          ctx.rect(midX - bw / 2, midY - bh / 2, bw, bh);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ecfeff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(distStr, midX, midY);
      }

      // Closing segment distance badge if closed
      if (isPolygonClosed && containerPts.length >= 3) {
        const pLast = containerPts[containerPts.length - 1];
        const pFirst = containerPts[0];
        const closeDist = calculateDistanceMeters(
          surveyPoints[surveyPoints.length - 1].lat,
          surveyPoints[surveyPoints.length - 1].lng,
          surveyPoints[0].lat,
          surveyPoints[0].lng
        );
        const midX = (pLast.x + pFirst.x) / 2;
        const midY = (pLast.y + pFirst.y) / 2;
        const distStr = formatDistance(closeDist);

        ctx.font = 'bold 10px system-ui, monospace';
        const txtW = ctx.measureText(distStr).width;
        const bw = txtW + 12;
        const bh = 18;

        ctx.fillStyle = 'rgba(11, 15, 25, 0.92)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(midX - bw / 2, midY - bh / 2, bw, bh, 4);
        } else {
          ctx.rect(midX - bw / 2, midY - bh / 2, bw, bh);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fde68a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(distStr, midX, midY);
      }

      // 5. Point Badges & Labels (P1, P2...)
      surveyPoints.forEach((pt, idx) => {
        const scr = containerPts[idx];
        const label = pt.label || `P${idx + 1}`;

        // Outer glow ring
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
        ctx.fill();

        // Main Point Circle
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? '#0284c7' : '#0891b2';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Sequential Number inside circle
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(idx + 1), scr.x, scr.y);

        // Label Pill above (e.g. "P1")
        ctx.font = 'bold 11px system-ui, monospace';
        const tw = ctx.measureText(label).width;
        const pillW = tw + 8;
        const pillH = 16;
        const pillY = scr.y - 20;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = idx === 0 ? '#38bdf8' : '#06b6d4';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(scr.x - pillW / 2, pillY - pillH / 2, pillW, pillH, 4);
        } else {
          ctx.rect(scr.x - pillW / 2, pillY - pillH / 2, pillW, pillH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, scr.x, pillY);
      });
    }

    ctx.restore();
  }, [
    model,
    transform,
    measurePointA,
    measurePointB,
    measureHoverPoint,
    annotations,
    userGpsLocation,
    deviceHeading,
    surveyPoints,
    isSurveyModeActive,
    isPolygonClosed,
    surveyHoverPoint,
  ]);

  // Continuous smooth animation loop for GPS radar pulse
  useEffect(() => {
    if (!isGpsLiveTracking || !userGpsLocation) return;
    const interval = setInterval(() => {
      redrawCanvas();
    }, 120);
    return () => clearInterval(interval);
  }, [isGpsLiveTracking, userGpsLocation, redrawCanvas]);

  // Hook map events to redraw canvas
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.on('move', redrawCanvas);
    map.on('zoom', redrawCanvas);
    map.on('resize', redrawCanvas);
    redrawCanvas();

    return () => {
      map.off('move', redrawCanvas);
      map.off('zoom', redrawCanvas);
      map.off('resize', redrawCanvas);
    };
  }, [redrawCanvas]);

  // Handle Dragging DXF Anchor directly on the map, measuring, or text annotation clicks
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const map = mapInstanceRef.current;
    if (!canvas || !map) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Text Annotation Mode handles clicks
    if (isTextModeActive) {
      let clickedExisting = false;
      for (const ann of annotations) {
        const pt = map.latLngToContainerPoint([ann.lat, ann.lng]);
        const dist = Math.hypot(clickX - pt.x, clickY - pt.y);
        const badgeX = pt.x + 16;
        const badgeY = pt.y - 18;
        const distToBadge = Math.hypot(clickX - badgeX, clickY - badgeY);

        if (dist < 25 || distToBadge < 35) {
          handleOpenEditAnnotation(ann);
          clickedExisting = true;
          break;
        }
      }

      if (!clickedExisting) {
        const clickedLatLng = map.containerPointToLatLng([clickX, clickY]);
        handleOpenNewAnnotation({ lat: clickedLatLng.lat, lng: clickedLatLng.lng });
      }
      return;
    }

    // Survey Point Marking Mode handles clicks exclusively
    if (isSurveyModeActive && onAddSurveyPoint) {
      const clickedLatLng = map.containerPointToLatLng([clickX, clickY]);
      onAddSurveyPoint({ lat: clickedLatLng.lat, lng: clickedLatLng.lng });
      if ('vibrate' in navigator) navigator.vibrate(25);
      return;
    }

    // Measurement Mode handles clicks exclusively
    if (isMeasureModeActive) {
      const clickedLatLng = map.containerPointToLatLng([clickX, clickY]);
      if (!measurePointA || (measurePointA && measurePointB)) {
        setMeasurePointA({ lat: clickedLatLng.lat, lng: clickedLatLng.lng });
        setMeasurePointB(null);
        setMeasureHoverPoint(null);
        if ('vibrate' in navigator) navigator.vibrate(20);
      } else {
        setMeasurePointB({ lat: clickedLatLng.lat, lng: clickedLatLng.lng });
        setMeasureHoverPoint(null);
        if ('vibrate' in navigator) navigator.vibrate([20, 50, 20]);
      }
      return;
    }

    if (!isDragModeActive || transform.isLocked) return;

    const anchorScreen = map.latLngToContainerPoint([transform.centerLat, transform.centerLng]);
    const dist = Math.hypot(clickX - anchorScreen.x, clickY - anchorScreen.y);

    // If within 50px of anchor or in drag mode, start dragging anchor
    if (dist < 50 || isDragModeActive) {
      setIsDraggingAnchor(true);
      map.dragging.disable();
      if ('vibrate' in navigator) navigator.vibrate(15);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const map = mapInstanceRef.current;
    if (!canvas || !map) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // In measurement mode, update hover point for live preview
    if (isMeasureModeActive && measurePointA && !measurePointB) {
      const hoverLatLng = map.containerPointToLatLng([screenX, screenY]);
      setMeasureHoverPoint({ lat: hoverLatLng.lat, lng: hoverLatLng.lng });
      return;
    }

    // In survey marking mode, update hover point for live line preview
    if (isSurveyModeActive && surveyPoints && surveyPoints.length > 0) {
      const hoverLatLng = map.containerPointToLatLng([screenX, screenY]);
      setSurveyHoverPoint({ lat: hoverLatLng.lat, lng: hoverLatLng.lng });
    } else if (surveyHoverPoint) {
      setSurveyHoverPoint(null);
    }

    if (!isDraggingAnchor || !mapInstanceRef.current || transform.isLocked) return;

    const newLatLng = map.containerPointToLatLng([screenX, screenY]);

    onTransformChange((prev) => ({
      ...prev,
      centerLat: newLatLng.lat,
      centerLng: newLatLng.lng,
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingAnchor) {
      setIsDraggingAnchor(false);
      mapInstanceRef.current?.dragging.enable();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // Zoom controls
  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
    if ('vibrate' in navigator) navigator.vibrate(10);
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
    if ('vibrate' in navigator) navigator.vibrate(10);
  };

  const handleCenterOnDxf = () => {
    mapInstanceRef.current?.flyTo([transform.centerLat, transform.centerLng], mapInstanceRef.current.getZoom(), {
      duration: 0.8,
    });
    if ('vibrate' in navigator) navigator.vibrate(10);
  };

  // Helper to draw the Carmo Energy Technical Stamp on any export canvas
  const drawCarmoEnergyStamp = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    centerCoords: { lat: number; lng: number },
    dateFormatted: string,
    timeFormatted: string
  ) => {
    ctx.save();
    const isNarrow = width < 820;
    const stampHeight = isNarrow ? 145 : 110;
    const stampY = height - stampHeight;

    // Dark executive backdrop with high contrast and opacity
    ctx.fillStyle = 'rgba(11, 15, 25, 0.95)';
    ctx.fillRect(0, stampY, width, stampHeight);

    // Top dividing accent line in corporate gold / amber
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, stampY);
    ctx.lineTo(width, stampY);
    ctx.stroke();

    // Subtle cyan accent indicator
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, stampY + 4);
    ctx.lineTo(width, stampY + 4);
    ctx.stroke();

    if (!isNarrow) {
      // --- SECTION 1: COORDENADAS GEOGRÁFICAS (LEFT) ---
      const sec1X = 20;
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('COORDENADAS GEOGRÁFICAS (DATUM WGS84 / SIRGAS 2000)', sec1X, stampY + 24);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(
        `LAT: ${centerCoords.lat.toFixed(6)}°  |  LONG: ${centerCoords.lng.toFixed(6)}°`,
        sec1X,
        stampY + 45
      );

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px monospace';
      ctx.fillText(
        `${toDMS(centerCoords.lat, true)}   |   ${toDMS(centerCoords.lng, false)}`,
        sec1X,
        stampY + 65
      );

      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.fillText(
        `Zoom: ${currentZoom}x  •  Escala Aprox.: 1:${Math.round(591657550.5 / Math.pow(2, currentZoom - 1))}`,
        sec1X,
        stampY + 88
      );

      // --- SECTION 2: DATA & HORÁRIO (CENTER-LEFT) ---
      const sec2X = Math.max(sec1X + 410, width * 0.42);

      // Vertical divider line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sec2X - 20, stampY + 12);
      ctx.lineTo(sec2X - 20, height - 12);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('DATA & HORÁRIO DE EMISSÃO', sec2X, stampY + 24);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`Data: ${dateFormatted}`, sec2X, stampY + 45);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '12px sans-serif';
      ctx.fillText(`Horário: ${timeFormatted} (Horário Local)`, sec2X, stampY + 65);

      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.fillText(
        model ? `Arquivo: ${model.name.slice(0, 22)}` : 'Levantamento Topográfico',
        sec2X,
        stampY + 88
      );

      // --- SECTION 3: NORTE VERDADEIRO (CENTER-RIGHT) ---
      const sec3X = Math.max(sec2X + 220, width * 0.68);

      // Vertical divider line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sec3X - 20, stampY + 12);
      ctx.lineTo(sec3X - 20, height - 12);
      ctx.stroke();

      // Stylized Compass North Symbol
      const compassCenterX = sec3X + 24;
      const compassCenterY = stampY + 54;
      const radius = 22;

      // Compass outer ring
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(compassCenterX, compassCenterY, radius, 0, Math.PI * 2);
      ctx.stroke();

      // North arrow pointing UP (red/white)
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(compassCenterX, compassCenterY - radius + 3);
      ctx.lineTo(compassCenterX - 7, compassCenterY + 4);
      ctx.lineTo(compassCenterX, compassCenterY - 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(compassCenterX, compassCenterY - radius + 3);
      ctx.lineTo(compassCenterX + 7, compassCenterY + 4);
      ctx.lineTo(compassCenterX, compassCenterY - 2);
      ctx.closePath();
      ctx.fill();

      // South arrow
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(compassCenterX, compassCenterY + radius - 3);
      ctx.lineTo(compassCenterX - 6, compassCenterY + 1);
      ctx.lineTo(compassCenterX, compassCenterY + 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(compassCenterX, compassCenterY + radius - 3);
      ctx.lineTo(compassCenterX + 6, compassCenterY + 1);
      ctx.lineTo(compassCenterX, compassCenterY + 3);
      ctx.closePath();
      ctx.fill();

      // "N" Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', compassCenterX, compassCenterY - radius - 3);
      ctx.textAlign = 'left';

      // North True text
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('NORTE VERDADEIRO', sec3X + 56, stampY + 42);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText('Orientação: 0.0° N (Geográfico)', sec3X + 56, stampY + 62);

      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.fillText('Convergência Meridiana: 0°', sec3X + 56, stampY + 80);

      // --- SECTION 4: CARMO ENERGY (RIGHT END) ---
      const sec4X = width - 20;

      // Vertical divider line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width - 230, stampY + 12);
      ctx.lineTo(width - 230, height - 12);
      ctx.stroke();

      ctx.textAlign = 'right';

      ctx.fillStyle = '#f59e0b';
      ctx.font = '900 20px sans-serif';
      ctx.fillText('CARMO ENERGY', sec4X, stampY + 35);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('SISTEMA DE GEORREFERENCIAMENTO & ENGENHARIA', sec4X, stampY + 54);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '11px sans-serif';
      ctx.fillText('MAPA TOPOGRÁFICO DE CAMPO', sec4X, stampY + 72);

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText(`REGISTRO OFICIAL • ${dateFormatted}`, sec4X, stampY + 90);

      ctx.textAlign = 'left';
    } else {
      // Compact Mobile/Portrait Layout
      const padX = 14;

      // Top Row: CARMO ENERGY (Left) and NORTE VERDADEIRO (Right)
      ctx.fillStyle = '#f59e0b';
      ctx.font = '900 17px sans-serif';
      ctx.fillText('CARMO ENERGY', padX, stampY + 25);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('SISTEMA DE GEORREFERENCIAMENTO', padX, stampY + 40);

      // Mobile North indicator
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('▲ N', width - padX, stampY + 25);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('NORTE VERDADEIRO (0°)', width - padX, stampY + 40);
      ctx.textAlign = 'left';

      // Divider line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, stampY + 48);
      ctx.lineTo(width - padX, stampY + 48);
      ctx.stroke();

      // Middle Row: Coordenadas Geográficas
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(
        `LAT: ${centerCoords.lat.toFixed(6)}°  |  LONG: ${centerCoords.lng.toFixed(6)}°`,
        padX,
        stampY + 68
      );

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px monospace';
      ctx.fillText(
        `${toDMS(centerCoords.lat, true)}  •  ${toDMS(centerCoords.lng, false)}`,
        padX,
        stampY + 86
      );

      // Bottom Row: Data & Horário
      ctx.fillStyle = '#38bdf8';
      ctx.font = '11px sans-serif';
      ctx.fillText(
        `Data: ${dateFormatted}  •  Horário: ${timeFormatted}  •  WGS84`,
        padX,
        stampY + 108
      );

      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.fillText(
        model ? `Arquivo: ${model.name.slice(0, 24)}` : 'Levantamento de Campo',
        padX,
        stampY + 128
      );
    }

    ctx.restore();
  };

  // Fallback vector export in case browser CORS taints the tile canvas
  const handleFallbackVectorExport = (
    fileName: string,
    centerCoords: { lat: number; lng: number },
    now: Date,
    width: number,
    height: number
  ) => {
    try {
      const fallbackCanvas = document.createElement('canvas');
      const scaleFactor = 2;
      fallbackCanvas.width = Math.round(width * scaleFactor);
      fallbackCanvas.height = Math.round(height * scaleFactor);
      const ctx = fallbackCanvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(scaleFactor, scaleFactor);

      // Technical cartographic background with grid
      ctx.fillStyle = '#0b1120';
      ctx.fillRect(0, 0, width, height);

      // Subtle graticule grid lines
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
      ctx.lineWidth = 1;
      const gridSize = 50;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw local DXF vector overlay (never tainted)
      if (canvasRef.current) {
        ctx.drawImage(canvasRef.current, 0, 0, width, height);
      }

      // Draw Technical Stamp
      const dateFormatted = now.toLocaleDateString('pt-BR');
      const timeFormatted = now.toLocaleTimeString('pt-BR');
      drawCarmoEnergyStamp(ctx, width, height, centerCoords, dateFormatted, timeFormatted);

      fallbackCanvas.toBlob((blob) => {
        if (!blob) {
          setIsExporting(false);
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        setExportPreviewUrl(blobUrl);

        const link = document.createElement('a');
        link.download = fileName;
        link.href = blobUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setIsExporting(false);
      }, 'image/png');
    } catch (e) {
      console.error('Erro no fallback de exportação:', e);
      setIsExporting(false);
    }
  };

  // Main screen image export function with Technical Stamp
  const handleExportScreenImage = async () => {
    if (isExporting) return;
    setIsExporting(true);
    if ('vibrate' in navigator) navigator.vibrate(25);

    try {
      const mapContainer = mapContainerRef.current;
      const overlayCanvas = canvasRef.current;
      const map = mapInstanceRef.current;
      if (!mapContainer || !map) {
        alert('Mapa não inicializado.');
        setIsExporting(false);
        return;
      }

      const rect = mapContainer.getBoundingClientRect();
      const width = rect.width || 1280;
      const height = rect.height || 720;

      const scaleFactor = 2; // High-resolution 2x canvas
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = Math.round(width * scaleFactor);
      exportCanvas.height = Math.round(height * scaleFactor);
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) {
        setIsExporting(false);
        return;
      }

      ctx.scale(scaleFactor, scaleFactor);

      // Base solid dark background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      // Composite loaded Leaflet Map Tiles
      const tiles = Array.from(mapContainer.querySelectorAll<HTMLImageElement>('img.leaflet-tile'));
      for (const tile of tiles) {
        if (!tile.complete || tile.naturalWidth === 0) continue;
        const tileRect = tile.getBoundingClientRect();
        const x = tileRect.left - rect.left;
        const y = tileRect.top - rect.top;
        try {
          ctx.drawImage(tile, x, y, tileRect.width, tileRect.height);
        } catch {
          // Non-blocking catch for individual tiles
        }
      }

      // Composite DXF drawing & measurement overlay
      if (overlayCanvas) {
        ctx.drawImage(overlayCanvas, 0, 0, width, height);
      }

      const centerCoords = mapCenterCoords || { lat: transform.centerLat, lng: transform.centerLng };
      const now = new Date();
      const dateFormatted = now.toLocaleDateString('pt-BR');
      const timeFormatted = now.toLocaleTimeString('pt-BR');

      // Draw the Carmo Energy Stamp
      drawCarmoEnergyStamp(ctx, width, height, centerCoords, dateFormatted, timeFormatted);

      const timestamp = now
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      const fileName = `Carmo_Energy_Georreferenciamento_${timestamp}.png`;
      setExportFileName(fileName);

      try {
        exportCanvas.toBlob((blob) => {
          if (!blob) {
            handleFallbackVectorExport(fileName, centerCoords, now, width, height);
            return;
          }
          const blobUrl = URL.createObjectURL(blob);
          setExportPreviewUrl(blobUrl);

          const link = document.createElement('a');
          link.download = fileName;
          link.href = blobUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setIsExporting(false);
        }, 'image/png');
      } catch {
        handleFallbackVectorExport(fileName, centerCoords, now, width, height);
      }
    } catch (err) {
      console.error('Erro na exportação de imagem:', err);
      alert('Ocorreu um erro ao exportar a imagem. Tente novamente.');
      setIsExporting(false);
    }
  };

  return (
    <div id="satellite-map-container" className="relative w-full h-full overflow-hidden select-none touch-none">
      {/* 1. Underlying Leaflet Fullscreen Map Container */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0 bg-slate-950" />

      {/* 2. Synchronized Canvas Drawing Layer */}
      <canvas
        ref={canvasRef}
        id="dxf-overlay-canvas"
        className={`absolute inset-0 w-full h-full z-10 ${
          isMeasureModeActive || isTextModeActive
            ? 'cursor-crosshair pointer-events-auto'
            : isDragModeActive
            ? isDraggingAnchor
              ? 'cursor-grabbing pointer-events-auto'
              : 'cursor-grab pointer-events-auto'
            : 'pointer-events-none'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* 3. Top Info Overlay Bar */}
      <header className="absolute top-3 left-3 right-14 z-20 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-xl px-3 py-1.5 shadow-lg pointer-events-auto max-w-[calc(100%-48px)] truncate">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="text-xs font-semibold text-slate-100 tracking-wide truncate">
            {model ? model.name : 'Nenhum DXF Carregado'}
          </span>
          {model && (
            <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-800/60 shrink-0">
              {model.totalEntities} elem
            </span>
          )}
        </div>

        {/* Address Search Trigger */}
        <div className="relative pointer-events-auto">
          <button
            id="btn-toggle-search"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            title="Buscar Endereço ou Cidade"
            className="w-8 h-8 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 shadow-lg flex items-center justify-center text-slate-300 transition-all"
          >
            {isSearchOpen ? <X className="w-4 h-4 text-slate-400" /> : <Search className="w-4 h-4 text-cyan-400" />}
          </button>

          {isSearchOpen && (
            <form
              onSubmit={handleSearchSubmit}
              className="absolute right-0 top-10 w-72 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl p-2 shadow-2xl flex items-center gap-1.5 z-40"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ex: Brasília, Av Paulista..."
                autoFocus
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="p-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shrink-0"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </form>
          )}
        </div>
      </header>

      {/* 4. Left Action Control Pad for Quick Android Navigation */}
      <nav aria-label="Controles de mapa" className="absolute left-3 bottom-24 z-20 flex flex-col gap-2 pointer-events-auto">
        {/* Real-time GPS Location Tracking Button */}
        <button
          id="btn-gps-location"
          onClick={handleToggleGpsTracking}
          title={
            isGpsLiveTracking
              ? isGpsFollowMode
                ? 'GPS Celular Ativo (Seguindo você ao se deslocar) - Toque para pausar acompanhamento'
                : 'GPS Celular Ativo - Toque para centralizar e seguir seu deslocamento'
              : 'Ativar GPS Contínuo do Celular (Rastreamento em tempo real)'
          }
          className={`w-11 h-11 rounded-xl active:scale-95 border shadow-xl flex items-center justify-center transition-all ${
            isGpsLiveTracking
              ? isGpsFollowMode
                ? 'bg-sky-500 text-slate-950 border-sky-300 font-bold shadow-sky-500/40 ring-2 ring-sky-400/50'
                : 'bg-slate-900/95 text-sky-400 border-sky-500/80 shadow-sky-500/20 ring-1 ring-sky-500/40'
              : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700'
          }`}
        >
          {isGpsLiveTracking ? (
            <Navigation
              className={`w-5 h-5 transition-transform ${
                isGpsFollowMode ? 'text-slate-950 rotate-45 animate-pulse' : 'text-sky-400'
              }`}
            />
          ) : (
            <Locate className="w-5 h-5 text-slate-200" />
          )}
        </button>

        {/* Focus on DXF Center */}
        <button
          id="btn-focus-dxf"
          onClick={handleCenterOnDxf}
          title="Centralizar Câmera no DXF"
          className="w-11 h-11 rounded-xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 border border-slate-700 shadow-xl flex items-center justify-center text-cyan-400 transition-all"
        >
          <Crosshair className="w-5 h-5" />
        </button>

        {/* Distance Measurement Tool (Régua de 2 Pontos) */}
        <button
          id="btn-measure-tool"
          onClick={() => {
            if (!isMeasureModeActive && isTextModeActive) {
              setIsTextModeActive(false);
            }
            onToggleMeasureMode();
          }}
          title="Medir Distância no Mapa (2 Pontos)"
          className={`w-11 h-11 rounded-xl active:scale-95 border shadow-xl flex items-center justify-center transition-all ${
            isMeasureModeActive
              ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-amber-500/30 ring-2 ring-amber-400/50'
              : 'bg-slate-900/90 hover:bg-slate-800 text-amber-400 border-slate-700'
          }`}
        >
          <Ruler className="w-5 h-5" />
        </button>

        {/* Text Annotation Tool (Inserir Texto no Ponto do Mapa) */}
        <button
          id="btn-text-tool"
          onClick={() => {
            setIsTextModeActive((prev) => {
              const next = !prev;
              if (next) {
                if (isMeasureModeActive) onToggleMeasureMode();
                if (isSurveyModeActive && onToggleSurveyMode) onToggleSurveyMode();
              }
              return next;
            });
            if ('vibrate' in navigator) navigator.vibrate(15);
          }}
          title="Inserir Texto no Mapa (Clique em um ponto)"
          className={`w-11 h-11 rounded-xl active:scale-95 border shadow-xl flex items-center justify-center transition-all ${
            isTextModeActive
              ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-cyan-500/30 ring-2 ring-cyan-400/50'
              : 'bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border-slate-700'
          }`}
        >
          <Type className="w-5 h-5" />
        </button>

        {/* Sequential Survey Points Mode (P1, P2... com exportação de lista de coordenadas) */}
        {onToggleSurveyMode && (
          <button
            id="btn-survey-tool-map"
            onClick={() => {
              if (!isSurveyModeActive) {
                if (isMeasureModeActive) onToggleMeasureMode();
                if (isTextModeActive) setIsTextModeActive(false);
              }
              onToggleSurveyMode();
              if ('vibrate' in navigator) navigator.vibrate(15);
            }}
            title="Marcação de Pontos Sequenciais (P1, P2...) & Exportar Coordenadas"
            className={`w-11 h-11 rounded-xl active:scale-95 border shadow-xl flex items-center justify-center transition-all relative ${
              isSurveyModeActive
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-emerald-500/30 ring-2 ring-emerald-400/50'
                : 'bg-slate-900/90 hover:bg-slate-800 text-emerald-400 border-slate-700'
            }`}
          >
            <MapPin className="w-5 h-5" />
            {surveyPoints.length > 0 && (
              <span className="absolute -top-1 -right-1 px-1 min-w-3.5 h-3.5 rounded-full bg-cyan-400 text-slate-950 text-[9px] font-bold flex items-center justify-center">
                {surveyPoints.length}
              </span>
            )}
          </button>
        )}

        {/* Export Screen Image with Technical Stamp (Carmo Energy) */}
        <button
          id="btn-export-carmo-image"
          onClick={handleExportScreenImage}
          disabled={isExporting}
          title="Exportar Imagem com Coordenadas, Data, Horário, Norte e Carmo Energy"
          className="w-11 h-11 rounded-xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 border border-amber-500/60 hover:border-amber-400 shadow-xl flex items-center justify-center text-amber-400 hover:text-amber-300 transition-all group"
        >
          {isExporting ? (
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          ) : (
            <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
          )}
        </button>

        {/* Map Layers Selector */}
        <div className="relative">
          <button
            id="btn-map-layers"
            onClick={() => setShowTileSelector(!showTileSelector)}
            title="Mudar Tipo de Satélite / Mapa"
            className="w-11 h-11 rounded-xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 border border-slate-700 shadow-xl flex items-center justify-center text-amber-400 transition-all"
          >
            <Layers className="w-5 h-5" />
          </button>

          {showTileSelector && (
            <div className="absolute left-14 bottom-0 w-60 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl p-2 shadow-2xl flex flex-col gap-1.5 z-30">
              <span className="text-[11px] font-semibold text-slate-400 px-2 py-0.5 uppercase tracking-wider">
                Imagens de Satélite
              </span>
              {(Object.keys(TILE_CONFIGS) as MapTileProvider[]).map((key) => (
                <button
                  key={key}
                  onClick={() => {
                    onTileProviderChange(key);
                    setShowTileSelector(false);
                  }}
                  className={`text-left text-xs px-2.5 py-2 rounded-lg transition-colors flex items-center justify-between ${
                    tileProvider === key
                      ? 'bg-cyan-500/20 text-cyan-300 font-medium border border-cyan-500/40'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>{TILE_CONFIGS[key].label}</span>
                  {tileProvider === key && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex flex-col bg-slate-900/90 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
          <button
            id="btn-zoom-in"
            onClick={handleZoomIn}
            title="Aumentar Zoom"
            className="w-11 h-10 hover:bg-slate-800 active:scale-95 flex items-center justify-center text-slate-200 border-b border-slate-800"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            id="btn-zoom-out"
            onClick={handleZoomOut}
            title="Diminuir Zoom"
            className="w-11 h-10 hover:bg-slate-800 active:scale-95 flex items-center justify-center text-slate-200"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* 5. Measurement Mode HUD Card */}
      {isMeasureModeActive && (
        <aside
          aria-label="Painel de medição de distância"
          className="absolute top-16 left-3 right-3 sm:left-auto sm:right-16 z-30 bg-slate-900/95 backdrop-blur-xl border border-amber-500/60 rounded-2xl p-3 shadow-2xl pointer-events-auto sm:w-80"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
              <Ruler className="w-4 h-4" />
              <span>Medir Distância (2 Pontos)</span>
            </div>
            <button
              onClick={onToggleMeasureMode}
              title="Fechar Régua"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="py-2.5 space-y-2">
            {!measurePointA ? (
              <p className="text-xs text-amber-200/95 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                <span>Toque na tela para marcar o <strong>Ponto 1 (Início)</strong>.</span>
              </p>
            ) : !measurePointB ? (
              <div className="space-y-1.5">
                <p className="text-xs text-emerald-300 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                  <span>Ponto A fixado! Toque no <strong>Ponto 2 (Fim)</strong>.</span>
                </p>
                {measureHoverPoint && (
                  <div className="text-xs font-mono text-slate-300 bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400 text-[11px]">Distância em tempo real:</span>
                    <strong className="text-amber-400 font-bold text-sm">
                      {formatDistance(
                        calculateDistanceMeters(
                          measurePointA.lat,
                          measurePointA.lng,
                          measureHoverPoint.lat,
                          measureHoverPoint.lng
                        )
                      )}
                    </strong>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">Distância Medida:</span>
                  <span className="text-xl font-bold font-mono text-amber-400">
                    {formatDistance(
                      calculateDistanceMeters(
                        measurePointA.lat,
                        measurePointA.lng,
                        measurePointB.lat,
                        measurePointB.lng
                      )
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                  <span>Azimute / Rumo:</span>
                  <span className="text-cyan-300 font-semibold">
                    {calculateAzimuth(
                      measurePointA.lat,
                      measurePointA.lng,
                      measurePointB.lat,
                      measurePointB.lng
                    ).toFixed(1)}
                    ° ({getCompassDirection(
                      calculateAzimuth(
                        measurePointA.lat,
                        measurePointA.lng,
                        measurePointB.lat,
                        measurePointB.lng
                      )
                    )})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 font-mono pt-1.5 border-t border-slate-800/80">
                  <div className="bg-slate-900/60 p-1.5 rounded">
                    <span className="text-amber-400 block font-bold mb-0.5">Ponto 1 (A):</span>
                    <span>{formatLatLng(measurePointA.lat, measurePointA.lng)}</span>
                  </div>
                  <div className="bg-slate-900/60 p-1.5 rounded">
                    <span className="text-emerald-400 block font-bold mb-0.5">Ponto 2 (B):</span>
                    <span>{formatLatLng(measurePointB.lat, measurePointB.lng)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleClearMeasurement}
              className="flex-1 py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold transition-all"
            >
              Nova Medição
            </button>
            <button
              onClick={onToggleMeasureMode}
              className="py-1.5 px-3 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 active:scale-95 border border-amber-500/40 text-xs font-semibold transition-all"
            >
              Concluir
            </button>
          </div>
        </aside>
      )}

      {/* 5. Text Annotation Mode HUD Card */}
      {isTextModeActive && (
        <aside
          aria-label="Painel de inserção de texto no mapa"
          className="absolute top-16 left-3 right-3 sm:left-auto sm:right-16 z-30 bg-slate-900/95 backdrop-blur-xl border border-cyan-500/60 rounded-2xl p-3 shadow-2xl pointer-events-auto sm:w-80"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
              <Type className="w-4 h-4" />
              <span>Inserir Texto no Mapa</span>
            </div>
            <button
              onClick={() => setIsTextModeActive(false)}
              title="Fechar Modo de Texto"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="py-2.5 space-y-2">
            <p className="text-xs text-cyan-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <span>
                Toque ou clique em <strong>qualquer ponto do mapa</strong> para inserir ou editar um texto.
              </span>
            </p>

            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400 border-t border-slate-800/80">
              <span className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                <span>{annotations.length} {annotations.length === 1 ? 'legenda gravada' : 'legendas gravadas'}</span>
              </span>
              {annotations.length > 0 && (
                <button
                  onClick={handleClearAllAnnotations}
                  className="text-red-400 hover:text-red-300 text-[10px] font-semibold flex items-center gap-1 hover:underline"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpar todas</span>
                </button>
              )}
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={() => setIsTextModeActive(false)}
              className="w-full py-1.5 px-3 rounded-xl bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 active:scale-95 border border-cyan-500/40 text-xs font-semibold transition-all"
            >
              Concluir Inserção
            </button>
          </div>
        </aside>
      )}

      {/* 5. Sequential Survey Points Marking Mode HUD Card */}
      {isSurveyModeActive && (
        <aside
          aria-label="Painel de marcação de pontos sequenciais"
          className="absolute top-16 left-3 right-3 sm:left-auto sm:right-16 z-30 bg-slate-900/95 backdrop-blur-xl border border-cyan-500/60 rounded-2xl p-3 shadow-2xl pointer-events-auto sm:w-84 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>Marcação de Pontos (P{surveyPoints.length + 1})</span>
            </div>
            {onToggleSurveyMode && (
              <button
                onClick={onToggleSurveyMode}
                title="Fechar Modo Marcação"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="py-2.5 space-y-2">
            <p className="text-xs text-cyan-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <span>
                Toque no mapa para marcar o vértice <strong>P{surveyPoints.length + 1}</strong>
              </span>
            </p>

            {surveyPoints.length > 0 && (
              <div className="space-y-1.5 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-400 text-[11px]">Pontos Gravados:</span>
                  <strong className="text-emerald-400 font-mono font-bold">
                    {surveyPoints.length} vértices
                  </strong>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-400 text-[11px]">Distância Acumulada:</span>
                  <strong className="text-amber-400 font-mono font-bold text-sm">
                    {formatDistance(surveyPoints[surveyPoints.length - 1].cumulativeDistance || 0)}
                  </strong>
                </div>
                {surveyPoints.length >= 2 && (
                  <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-800">
                    <span>Último trecho (P{surveyPoints.length - 1} → P{surveyPoints.length}):</span>
                    <span className="text-amber-300 font-semibold">
                      +{formatDistance(surveyPoints[surveyPoints.length - 1].distanceFromPrev || 0)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {onUndoSurveyPoint && (
              <button
                onClick={onUndoSurveyPoint}
                disabled={surveyPoints.length === 0}
                className="py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
              >
                <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Desfazer</span>
              </button>
            )}

            {onOpenSurveyExport && (
              <button
                onClick={onOpenSurveyExport}
                disabled={surveyPoints.length === 0}
                className="flex-1 py-1.5 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition-all"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Exportar Lista</span>
              </button>
            )}

            {onToggleSurveyMode && (
              <button
                onClick={onToggleSurveyMode}
                className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold active:scale-95 transition-all"
              >
                Concluir
              </button>
            )}
          </div>
        </aside>
      )}

      {/* 5. Drag Mode Active Indicator Banner */}
      {isDragModeActive && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-amber-500/90 text-slate-950 font-bold text-xs px-3.5 py-1.5 rounded-full shadow-xl flex items-center gap-1.5 animate-bounce">
          <Move className="w-3.5 h-3.5" />
          <span>Modo Arraste Ativo: Toque e puxe no mapa</span>
        </div>
      )}

      {/* 6. Footer Coordinates & Scale Status Bar */}
      <footer className="absolute bottom-2 left-3 right-3 z-20 pointer-events-none flex items-center justify-between text-[11px] text-slate-400">
        <div className="bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-md border border-slate-800/80 font-mono pointer-events-auto">
          {formatLatLng(transform.centerLat, transform.centerLng)} | Rot: {transform.rotationDeg.toFixed(1)}°
        </div>
        <div className="bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded-md border border-slate-800/80 font-mono pointer-events-auto">
          Zoom: {currentZoom}x
        </div>
      </footer>

      {/* 7. Export Image Preview Modal (Carmo Energy) */}
      {exportPreviewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
        >
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>Imagem Exportada</span>
                    <span className="text-[10px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Carmo Energy
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Selo técnico gravado: Coordenadas, Data, Horário e Norte Verdadeiro
                  </p>
                </div>
              </div>
              <button
                onClick={() => setExportPreviewUrl(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Image Body */}
            <div className="flex-1 overflow-auto p-3 sm:p-4 bg-slate-950/70 flex flex-col items-center justify-center">
              <div className="relative rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl max-h-[55vh]">
                <img
                  src={exportPreviewUrl}
                  alt="Exportação Carmo Energy"
                  className="w-full h-auto object-contain max-h-[55vh]"
                />
              </div>
            </div>

            {/* Technical Stamp Details Summary */}
            <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                <span className="text-amber-400 font-bold block mb-0.5">Coordenadas:</span>
                <span className="text-slate-200 font-mono text-[10px] block">
                  {mapCenterCoords.lat.toFixed(5)}°, {mapCenterCoords.lng.toFixed(5)}°
                </span>
                <span className="text-slate-400 font-mono text-[9px] block">
                  {toDMS(mapCenterCoords.lat, true)}
                </span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                <span className="text-cyan-400 font-bold block mb-0.5">Data & Horário:</span>
                <span className="text-slate-200 text-[10px] block">
                  {new Date().toLocaleDateString('pt-BR')}
                </span>
                <span className="text-slate-400 text-[10px] block">
                  {new Date().toLocaleTimeString('pt-BR')}
                </span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                <span className="text-emerald-400 font-bold block mb-0.5">Norte Verdadeiro:</span>
                <span className="text-slate-200 text-[10px] block">0.0° N (Geográfico)</span>
                <span className="text-slate-400 text-[9px] block">Datum WGS84</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                <span className="text-amber-400 font-bold block mb-0.5">Chancela:</span>
                <span className="text-amber-300 font-black text-[10px] block">CARMO ENERGY</span>
                <span className="text-slate-400 text-[9px] block truncate">
                  {model ? model.name : 'Topografia'}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Arquivo baixado automaticamente no seu dispositivo</span>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={exportPreviewUrl}
                  download={exportFileName || 'Carmo_Energy_Georreferenciamento.png'}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-amber-500/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Novamente</span>
                </a>
                <button
                  onClick={() => setExportPreviewUrl(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold transition-all"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Text Input / Edit Annotation Modal Dialog */}
      {pendingTextPoint && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-slate-900 border border-cyan-500/50 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Type className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {editingAnnotationId ? 'Editar Texto no Mapa' : 'Inserir Texto no Ponto'}
                  </h3>
                  <p className="text-[10px] font-mono text-slate-400">
                    {pendingTextPoint.lat.toFixed(6)}°, {pendingTextPoint.lng.toFixed(6)}°
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPendingTextPoint(null);
                  setEditingAnnotationId(null);
                }}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Texto da Legenda / Identificação:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={inputTextValue}
                  onChange={(e) => setInputTextValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveAnnotation();
                    if (e.key === 'Escape') {
                      setPendingTextPoint(null);
                      setEditingAnnotationId(null);
                    }
                  }}
                  placeholder="Ex: Poço 01, Estação Coletora, Duto, Válvula..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                />
              </div>

              {/* Quick Preset Tags */}
              <div>
                <span className="text-[11px] text-slate-400 block mb-1.5">Etiquetas e Termos Rápidos:</span>
                <div className="flex flex-wrap gap-1.5">
                  {['Poço', 'Válvula', 'Estação', 'Duto', 'Limite', 'Tanque', 'Acesso', 'Ponto GPS', 'Poste'].map(
                    (tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setInputTextValue((prev) => (prev ? `${prev} ${tag}` : tag));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 hover:text-white transition-all active:scale-95"
                      >
                        +{tag}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Color Selection */}
              <div>
                <span className="text-[11px] text-slate-400 block mb-1.5">Cor do Marcador e Texto:</span>
                <div className="flex items-center gap-2.5">
                  {[
                    { color: '#f59e0b', label: 'Âmbar / Dourado' },
                    { color: '#06b6d4', label: 'Ciano' },
                    { color: '#10b981', label: 'Verde' },
                    { color: '#ef4444', label: 'Vermelho' },
                    { color: '#f8fafc', label: 'Branco' },
                  ].map(({ color, label }) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setInputTextColor(color)}
                      title={label}
                      className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center ${
                        inputTextColor === color
                          ? 'border-white scale-110 shadow-lg ring-2 ring-white/30'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              {editingAnnotationId ? (
                <button
                  type="button"
                  onClick={() => handleDeleteAnnotation(editingAnnotationId)}
                  className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingTextPoint(null);
                    setEditingAnnotationId(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAnnotation}
                  disabled={!inputTextValue.trim()}
                  className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingAnnotationId ? 'Salvar Alteração' : 'Adicionar no Mapa'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Live Real-Time GPS Tracking HUD Banner */}
      {isGpsLiveTracking && userGpsLocation && (
        <aside
          aria-label="Status do GPS do celular em tempo real"
          className="absolute top-16 left-3 right-14 sm:left-auto sm:right-16 z-25 bg-slate-900/95 backdrop-blur-xl border border-sky-500/50 rounded-2xl p-2.5 shadow-2xl pointer-events-auto sm:w-84 max-w-sm"
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
              </span>
              <span className="text-xs font-bold text-sky-300 flex items-center gap-1">
                <span>GPS Celular em Tempo Real</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsGpsFollowMode((prev) => !prev)}
                title={isGpsFollowMode ? 'Modo Seguir Ativo' : 'Modo Navegação Livre (Toque para seguir)'}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-all ${
                  isGpsFollowMode
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {isGpsFollowMode ? 'Seguindo' : 'Livre'}
              </button>
              <button
                onClick={stopGpsTracking}
                title="Desativar rastreamento GPS"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="pt-2 grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-slate-950/70 p-1.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Posição Atual:</span>
              <strong className="text-slate-100 font-mono text-[11px] block">
                {userGpsLocation.lat.toFixed(6)}°
              </strong>
              <strong className="text-slate-100 font-mono text-[11px] block">
                {userGpsLocation.lng.toFixed(6)}°
              </strong>
            </div>

            <div className="bg-slate-950/70 p-1.5 rounded-lg border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-slate-400 block text-[10px]">Precisão do Sinal:</span>
                <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  ±{userGpsLocation.accuracy.toFixed(1)} m
                </span>
              </div>
              <div className="pt-0.5 text-[10px] text-slate-400">
                {userGpsLocation.speed !== null && userGpsLocation.speed > 0.5 ? (
                  <span>Vel: <strong className="text-amber-300">{(userGpsLocation.speed * 3.6).toFixed(1)} km/h</strong></span>
                ) : (
                  <span>Em movimento a pé</span>
                )}
                {deviceHeading !== null && (
                  <span className="ml-1 font-mono text-sky-300">{deviceHeading}° {getCompassDirection(deviceHeading)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center gap-1.5">
            <button
              onClick={() => {
                if (userGpsLocation) {
                  onTransformChange((prev) => ({
                    ...prev,
                    centerLat: userGpsLocation.lat,
                    centerLng: userGpsLocation.lng,
                  }));
                  if ('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
                }
              }}
              title="Mover o centro do projeto DXF para sua posição GPS atual"
              className="flex-1 py-1 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-sky-300 border border-slate-700 text-[10px] font-semibold flex items-center justify-center gap-1 transition-all"
            >
              <Crosshair className="w-3 h-3 text-sky-400" />
              <span>Ancorar DXF na minha posição</span>
            </button>
            {!isGpsFollowMode && (
              <button
                onClick={() => {
                  setIsGpsFollowMode(true);
                  if (userGpsLocation && mapInstanceRef.current) {
                    mapInstanceRef.current.flyTo(
                      [userGpsLocation.lat, userGpsLocation.lng],
                      Math.max(mapInstanceRef.current.getZoom(), 17),
                      { duration: 0.8 }
                    );
                  }
                }}
                className="py-1 px-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[10px] font-semibold active:scale-95 transition-all"
              >
                Re-centralizar
              </button>
            )}
          </div>
        </aside>
      )}

      {/* GPS Error Notification */}
      {gpsError && (
        <div className="absolute top-16 left-3 right-3 sm:left-auto sm:right-16 z-30 bg-red-950/90 border border-red-500/60 text-red-200 text-xs p-3 rounded-xl shadow-xl flex items-center justify-between gap-2">
          <span>{gpsError}</span>
          <button onClick={() => setGpsError(null)} className="p-1 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
