export interface DxfPoint {
  x: number;
  y: number;
  z?: number;
}

export interface DxfEntity {
  type: 'LINE' | 'LWPOLYLINE' | 'POLYLINE' | 'CIRCLE' | 'ARC' | 'ELLIPSE' | 'SPLINE' | 'TEXT' | 'MTEXT' | 'SOLID' | 'POINT';
  layer: string;
  color?: string;
  colorNumber?: number;
  vertices?: DxfPoint[];
  startPoint?: DxfPoint;
  endPoint?: DxfPoint;
  center?: DxfPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  text?: string;
  height?: number;
  rotation?: number;
  isClosed?: boolean;
}

export interface DxfLayer {
  name: string;
  color?: string;
  visible: boolean;
  entityCount: number;
}

export interface DxfBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface ParsedDxfModel {
  name: string;
  fileSize: number;
  bounds: DxfBounds;
  entities: DxfEntity[];
  layers: Record<string, DxfLayer>;
  totalEntities: number;
}

export interface TransformState {
  centerLat: number;
  centerLng: number;
  rotationDeg: number; // 0 to 360 clockwise
  scale: number; // 1 unit in DXF = scale meters
  unitType: 'meters' | 'centimeters' | 'millimeters' | 'custom';
  opacity: number; // 0.1 to 1.0
  strokeColor: string; // e.g. '#22c55e' or 'layer'
  strokeWidth: number; // 1, 2, 3, 4, etc.
  fillPolygons: boolean;
  isLocked: boolean;
}

export type MapTileProvider = 'esri_satellite' | 'esri_clarity' | 'osm_streets' | 'satellite_hybrid';

export interface MeasurementPoint {
  lat: number;
  lng: number;
}

export interface MeasurementResult {
  pointA: MeasurementPoint;
  pointB: MeasurementPoint;
  distanceMeters: number;
  azimuthDeg: number;
}

export interface MapAnnotation {
  id: string;
  lat: number;
  lng: number;
  text: string;
  color?: string;
  createdAt: number;
}

export interface UserGpsLocation {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  altitude: number | null;
  timestamp: number;
}

export interface SurveySequencePoint {
  id: string;
  index: number; // 1, 2, 3...
  lat: number;
  lng: number;
  label?: string; // e.g. "P1", "P2"
  distanceFromPrev?: number; // distance in meters from previous point
  cumulativeDistance?: number; // distance in meters from start
  timestamp?: number;
  createdAt?: string;
}

