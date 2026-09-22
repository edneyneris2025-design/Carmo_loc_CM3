import { DxfBounds, DxfPoint, TransformState } from '../types';

const EARTH_METERS_PER_DEG_LAT = 111320; // approximate meters per degree latitude

/**
 * Projects a local DXF point (x, y) into WGS84 (lat, lng) based on center coordinate,
 * scale factor (meters per unit), and rotation (degrees clockwise).
 */
export function dxfPointToLatLng(
  point: DxfPoint,
  bounds: DxfBounds,
  transform: TransformState
): [number, number] {
  // Center relative offsets
  const dxRaw = point.x - bounds.centerX;
  const dyRaw = point.y - bounds.centerY;

  // Scale to real-world meters
  const dxMeters = dxRaw * transform.scale;
  const dyMeters = dyRaw * transform.scale;

  // Clockwise rotation
  const rad = (transform.rotationDeg * Math.PI) / 180;
  const rotX = dxMeters * Math.cos(rad) + dyMeters * Math.sin(rad);
  const rotY = -dxMeters * Math.sin(rad) + dyMeters * Math.cos(rad);

  // Meter to lat/lng
  const centerLatRad = (transform.centerLat * Math.PI) / 180;
  const metersPerLng = EARTH_METERS_PER_DEG_LAT * Math.cos(centerLatRad) || 1;

  const dLat = rotY / EARTH_METERS_PER_DEG_LAT;
  const dLng = rotX / metersPerLng;

  return [transform.centerLat + dLat, transform.centerLng + dLng];
}

/**
 * Calculates current real-world dimensions in meters
 */
export function getRealWorldDimensions(bounds: DxfBounds, scale: number): {
  widthMeters: number;
  heightMeters: number;
  areaM2: number;
} {
  const widthMeters = bounds.width * scale;
  const heightMeters = bounds.height * scale;
  const areaM2 = widthMeters * heightMeters;
  return { widthMeters, heightMeters, areaM2 };
}

/**
 * Formats coordinates for clean display (e.g. -23.550520, -46.633308)
 */
export function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`;
}

/**
 * Convert DXF entities to a GeoJSON FeatureCollection for export or external GIS tools
 */
export function dxfToGeoJson(
  entities: import('../types').DxfEntity[],
  bounds: DxfBounds,
  transform: TransformState,
  modelName: string
): string {
  const features: any[] = [];

  for (const entity of entities) {
    if (entity.type === 'LINE' && entity.startPoint && entity.endPoint) {
      const p1 = dxfPointToLatLng(entity.startPoint, bounds, transform);
      const p2 = dxfPointToLatLng(entity.endPoint, bounds, transform);
      features.push({
        type: 'Feature',
        properties: {
          type: 'LINE',
          layer: entity.layer,
          color: entity.color,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [p1[1], p1[0]],
            [p2[1], p2[0]],
          ],
        },
      });
    } else if (
      (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') &&
      entity.vertices &&
      entity.vertices.length > 1
    ) {
      const coords = entity.vertices.map((v) => {
        const [lat, lng] = dxfPointToLatLng(v, bounds, transform);
        return [lng, lat];
      });

      if (entity.isClosed && coords.length >= 3) {
        // Ensure closed ring
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          coords.push([first[0], first[1]]);
        }
        features.push({
          type: 'Feature',
          properties: {
            type: 'POLYGON',
            layer: entity.layer,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [coords],
          },
        });
      } else {
        features.push({
          type: 'Feature',
          properties: {
            type: 'LINESTRING',
            layer: entity.layer,
          },
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        });
      }
    } else if (entity.type === 'CIRCLE' && entity.center && entity.radius) {
      // Approximate circle with 32 points
      const points: [number, number][] = [];
      const numPts = 32;
      for (let i = 0; i <= numPts; i++) {
        const angle = (i * 2 * Math.PI) / numPts;
        const pt: DxfPoint = {
          x: entity.center.x + entity.radius * Math.cos(angle),
          y: entity.center.y + entity.radius * Math.sin(angle),
        };
        const [lat, lng] = dxfPointToLatLng(pt, bounds, transform);
        points.push([lng, lat]);
      }
      features.push({
        type: 'Feature',
        properties: {
          type: 'CIRCLE',
          radius: entity.radius * transform.scale,
          layer: entity.layer,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [points],
        },
      });
    }
  }

  const geoJson = {
    type: 'FeatureCollection',
    name: modelName || 'DXF_Export',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    features,
  };

  return JSON.stringify(geoJson, null, 2);
}

/**
 * Calculates geodesic distance between two lat/lng points using Haversine formula (in meters)
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371008.8; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates true azimuth / bearing in degrees (0° to 359.9°) from Point 1 to Point 2
 */
export function calculateAzimuth(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/**
 * Formats a metric distance cleanly for surveying and civil engineering
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(3)} km`;
  }
  return `${meters.toFixed(2)} m`;
}

/**
 * Returns cardinal / intercardinal abbreviation
 */
export function getCompassDirection(azimuthDeg: number): string {
  const directions = [
    'Norte (N)',
    'Nordeste (NE)',
    'Leste (L)',
    'Sudeste (SE)',
    'Sul (S)',
    'Sudoeste (SO)',
    'Oeste (O)',
    'Noroeste (NO)',
  ];
  const index = Math.round(azimuthDeg / 45) % 8;
  return directions[index];
}

/**
 * Converts decimal degrees to Graus, Minutos e Segundos (DMS)
 */
export function toDMS(val: number, isLat: boolean): string {
  const absolute = Math.abs(val);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(2);
  let direction = '';
  if (isLat) {
    direction = val >= 0 ? 'N' : 'S';
  } else {
    direction = val >= 0 ? 'L' : 'O';
  }
  return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
}

/**
 * Recalculates sequence indices and segment distances for an array of points
 */
export function recalculateSurveyPoints(
  rawPoints: { id: string; lat: number; lng: number; label?: string; timestamp?: number; createdAt?: string }[]
): import('../types').SurveySequencePoint[] {
  let cumulative = 0;
  return rawPoints.map((pt, idx) => {
    let distFromPrev = 0;
    if (idx > 0) {
      const prev = rawPoints[idx - 1];
      distFromPrev = calculateDistanceMeters(prev.lat, prev.lng, pt.lat, pt.lng);
      cumulative += distFromPrev;
    }
    return {
      id: pt.id,
      index: idx + 1,
      lat: pt.lat,
      lng: pt.lng,
      label: pt.label || `P${idx + 1}`,
      distanceFromPrev: distFromPrev,
      cumulativeDistance: cumulative,
      timestamp: pt.timestamp || Date.now(),
      createdAt: pt.createdAt || new Date().toISOString(),
    };
  });
}

/**
 * Calculates planar enclosed area in m² for closed polygon
 */
export function calculatePolygonAreaM2(points: { lat: number; lng: number }[]): number {
  if (points.length < 3) return 0;
  const latRef = points[0].lat;
  const latMeters = 111320;
  const lngMeters = 111320 * Math.cos((latRef * Math.PI) / 180);

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const xi = (points[i].lng - points[0].lng) * lngMeters;
    const yi = (points[i].lat - points[0].lat) * latMeters;
    const xj = (points[j].lng - points[0].lng) * lngMeters;
    const yj = (points[j].lat - points[0].lat) * latMeters;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}

/**
 * Formats a comprehensive topographic coordinates list report as plain text
 */
export function generateCoordinatesReportText(
  points: import('../types').SurveySequencePoint[],
  isClosed: boolean,
  projectName?: string
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR');

  let totalDistance = 0;
  if (points.length > 0) {
    totalDistance = points[points.length - 1].cumulativeDistance || 0;
    if (isClosed && points.length >= 3) {
      const closingDist = calculateDistanceMeters(
        points[points.length - 1].lat,
        points[points.length - 1].lng,
        points[0].lat,
        points[0].lng
      );
      totalDistance += closingDist;
    }
  }

  const areaM2 = isClosed && points.length >= 3 ? calculatePolygonAreaM2(points) : null;
  const areaHectares = areaM2 !== null ? (areaM2 / 10000).toFixed(4) : null;

  let report = '';
  report += '================================================================================\n';
  report += '                     RELATÓRIO DE COORDENADAS TOPOGRÁFICAS\n';
  report += '                              CARMO ENERGY\n';
  report += '================================================================================\n';
  report += `Projeto / DXF: ${projectName || 'Levantamento em Campo'}\n`;
  report += `Data de Emissão: ${dateStr} às ${timeStr}\n`;
  report += `Sistema Geodésico de Referência: WGS84 (Graus Decimais e GMS)\n`;
  report += `Total de Vértices: ${points.length} ponto(s)\n`;
  report += `Tipo de Alinhamento: ${isClosed && points.length >= 3 ? 'Poligonal Fechada (Perímetro)' : 'Alinhamento Aberto (Trajeto Sequencial)'}\n`;
  report += `Extensão Total: ${formatDistance(totalDistance)}\n`;
  if (areaM2 !== null) {
    report += `Área Enquadrada: ${areaM2.toFixed(2)} m² (${areaHectares} ha)\n`;
  }
  report += '================================================================================\n\n';

  report += 'LISTA TABULADA DE VÉRTICES E COORDENADAS GEOGRÁFICAS:\n';
  report += '------------------------------------------------------------------------------------------------------------------------\n';
  report += 'Item | Ponto | Latitude (Dec) | Longitude (Dec)| Latitude (GMS)         | Longitude (GMS)        | Dist. Trecho | Acumulado\n';
  report += '------------------------------------------------------------------------------------------------------------------------\n';

  points.forEach((p, idx) => {
    const itemNum = String(idx + 1).padStart(4, ' ');
    const label = (p.label || `P${p.index}`).padEnd(5, ' ');
    const latDec = `${p.lat.toFixed(6)}°`.padEnd(14, ' ');
    const lngDec = `${p.lng.toFixed(6)}°`.padEnd(14, ' ');
    const latGms = toDMS(p.lat, true).padEnd(22, ' ');
    const lngGms = toDMS(p.lng, false).padEnd(22, ' ');
    const distTrecho = idx === 0 ? '       ---  ' : formatDistance(p.distanceFromPrev || 0).padStart(12, ' ');
    const distAcum = formatDistance(p.cumulativeDistance || 0).padStart(10, ' ');

    report += `${itemNum} | ${label} | ${latDec} | ${lngDec} | ${latGms} | ${lngGms} | ${distTrecho} | ${distAcum}\n`;
  });

  if (isClosed && points.length >= 3) {
    const last = points[points.length - 1];
    const first = points[0];
    const closingDist = calculateDistanceMeters(last.lat, last.lng, first.lat, first.lng);
    report += `---- | Fecham| ${''.padEnd(14, ' ')} | ${''.padEnd(14, ' ')} | ${''.padEnd(22, ' ')} | ${''.padEnd(22, ' ')} | ${formatDistance(closingDist).padStart(12, ' ')} | ${formatDistance(totalDistance).padStart(10, ' ')}\n`;
  }

  report += '------------------------------------------------------------------------------------------------------------------------\n\n';
  report += 'NOTAS TÉCNICAS:\n';
  report += '1. Coordenadas obtidas por georreferenciamento de precisão sobre imagens orbitais e satélite de alta resolução.\n';
  report += '2. As distâncias geodésicas foram calculadas pelo modelo esferoidal elipsoidal do Datum WGS84.\n';
  report += '3. Documento gerado pela plataforma Carmo Energy - Visualizador de Satélite e Topografia DXF.\n';

  return report;
}

/**
 * Formats a CSV file of the coordinates list
 */
export function generateCoordinatesReportCsv(
  points: import('../types').SurveySequencePoint[],
  isClosed: boolean
): string {
  let csv = 'Ponto,Numero,Latitude_Decimal,Longitude_Decimal,Latitude_GMS,Longitude_GMS,Distancia_Trecho_m,Distancia_Acumulada_m\n';

  points.forEach((p, idx) => {
    const label = p.label || `P${p.index}`;
    const latDec = p.lat.toFixed(6);
    const lngDec = p.lng.toFixed(6);
    const latGms = `"${toDMS(p.lat, true)}"`;
    const lngGms = `"${toDMS(p.lng, false)}"`;
    const distTrecho = idx === 0 ? '0.00' : (p.distanceFromPrev || 0).toFixed(2);
    const distAcum = (p.cumulativeDistance || 0).toFixed(2);

    csv += `${label},${idx + 1},${latDec},${lngDec},${latGms},${lngGms},${distTrecho},${distAcum}\n`;
  });

  if (isClosed && points.length >= 3) {
    const last = points[points.length - 1];
    const first = points[0];
    const closingDist = calculateDistanceMeters(last.lat, last.lng, first.lat, first.lng);
    const totalDist = (points[points.length - 1].cumulativeDistance || 0) + closingDist;
    csv += `Fechamento_${last.label || `P${last.index}`}_a_${first.label || `P1`},0,,,,"Fechamento Poligonal",${closingDist.toFixed(2)},${totalDist.toFixed(2)}\n`;
  }

  return csv;
}

