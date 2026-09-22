import DxfParser from 'dxf-parser';
import { DxfBounds, DxfEntity, DxfLayer, DxfPoint, ParsedDxfModel } from '../types';

// AutoCAD ACI color table map (first 10 common colors)
const ACI_COLORS: Record<number, string> = {
  1: '#ef4444', // Red
  2: '#eab308', // Yellow
  3: '#22c55e', // Green
  4: '#06b6d4', // Cyan
  5: '#3b82f6', // Blue
  6: '#d946ef', // Magenta
  7: '#f8fafc', // White
  8: '#64748b', // Dark Gray
  9: '#94a3b8', // Light Gray
};

export function getAciColor(colorIndex?: number, defaultColor = '#38bdf8'): string {
  if (colorIndex !== undefined && ACI_COLORS[colorIndex]) {
    return ACI_COLORS[colorIndex];
  }
  return defaultColor;
}

/**
 * Calculates the bounding box of a list of entities
 */
export function calculateBounds(entities: DxfEntity[]): DxfBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const registerPoint = (x: number, y: number) => {
    if (!isNaN(x) && isFinite(x)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (!isNaN(y) && isFinite(y)) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };

  for (const ent of entities) {
    if (ent.startPoint) registerPoint(ent.startPoint.x, ent.startPoint.y);
    if (ent.endPoint) registerPoint(ent.endPoint.x, ent.endPoint.y);
    if (ent.vertices) {
      for (const v of ent.vertices) {
        registerPoint(v.x, v.y);
      }
    }
    if (ent.center && ent.radius) {
      registerPoint(ent.center.x - ent.radius, ent.center.y - ent.radius);
      registerPoint(ent.center.x + ent.radius, ent.center.y + ent.radius);
    }
  }

  // Handle empty or zero bounds safely
  if (minX === Infinity || maxX === -Infinity || minY === Infinity || maxY === -Infinity) {
    minX = -10;
    maxX = 10;
    minY = -10;
    maxY = 10;
  }

  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(0.001, maxY - minY);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX,
    centerY,
  };
}

/**
 * Parses raw DXF text into a normalized ParsedDxfModel
 */
export function parseDxfContent(dxfText: string, fileName = 'desenho.dxf'): ParsedDxfModel {
  const layers: Record<string, DxfLayer> = {};
  const normalizedEntities: DxfEntity[] = [];

  // 1. Attempt library parse
  let parsedFromLib: any = null;
  try {
    const parser = new DxfParser();
    parsedFromLib = parser.parseSync(dxfText);
  } catch (err) {
    console.warn('dxf-parser library failed, using robust fallback ASCII parser:', err);
  }

  if (parsedFromLib && parsedFromLib.entities && parsedFromLib.entities.length > 0) {
    // Process library layers
    if (parsedFromLib.tables && parsedFromLib.tables.layer && parsedFromLib.tables.layer.layers) {
      const libLayers = parsedFromLib.tables.layer.layers;
      for (const layerKey of Object.keys(libLayers)) {
        const l = libLayers[layerKey];
        layers[l.name || layerKey] = {
          name: l.name || layerKey,
          color: getAciColor(l.colorNumber),
          visible: l.visible !== false,
          entityCount: 0,
        };
      }
    }

    // Process library entities
    for (const ent of parsedFromLib.entities) {
      const layerName = ent.layer || '0';
      if (!layers[layerName]) {
        layers[layerName] = {
          name: layerName,
          color: getAciColor(ent.colorNumber),
          visible: true,
          entityCount: 0,
        };
      }
      layers[layerName].entityCount++;

      const color = getAciColor(ent.colorNumber, layers[layerName].color);

      if (ent.type === 'LINE' && ent.vertices && ent.vertices.length >= 2) {
        normalizedEntities.push({
          type: 'LINE',
          layer: layerName,
          color,
          startPoint: { x: ent.vertices[0].x, y: ent.vertices[0].y },
          endPoint: { x: ent.vertices[1].x, y: ent.vertices[1].y },
        });
      } else if (
        (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') &&
        ent.vertices &&
        ent.vertices.length > 0
      ) {
        const verts: DxfPoint[] = ent.vertices.map((v: any) => ({ x: v.x, y: v.y }));
        normalizedEntities.push({
          type: 'LWPOLYLINE',
          layer: layerName,
          color,
          vertices: verts,
          isClosed: !!ent.shape || !!ent.isClosed,
        });
      } else if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
        normalizedEntities.push({
          type: 'CIRCLE',
          layer: layerName,
          color,
          center: { x: ent.center.x, y: ent.center.y },
          radius: ent.radius,
        });
      } else if (ent.type === 'ARC' && ent.center && ent.radius) {
        normalizedEntities.push({
          type: 'ARC',
          layer: layerName,
          color,
          center: { x: ent.center.x, y: ent.center.y },
          radius: ent.radius,
          startAngle: ent.startAngle,
          endAngle: ent.endAngle,
        });
      } else if ((ent.type === 'TEXT' || ent.type === 'MTEXT') && ent.text) {
        const pos = ent.startPoint || ent.position || { x: 0, y: 0 };
        normalizedEntities.push({
          type: 'TEXT',
          layer: layerName,
          color,
          startPoint: { x: pos.x, y: pos.y },
          text: ent.text,
          height: ent.height || 1,
          rotation: ent.rotation || 0,
        });
      }
    }
  }

  // 2. If library yielded no entities or failed, parse via fallback ASCII scanner
  if (normalizedEntities.length === 0) {
    parseAsciiDxfFallback(dxfText, normalizedEntities, layers);
  }

  // Calculate overall bounds
  const bounds = calculateBounds(normalizedEntities);

  return {
    name: fileName,
    fileSize: dxfText.length,
    bounds,
    entities: normalizedEntities,
    layers,
    totalEntities: normalizedEntities.length,
  };
}

/**
 * Resilient ASCII group-code parser for standard AutoCAD DXF files
 */
function parseAsciiDxfFallback(
  text: string,
  entities: DxfEntity[],
  layers: Record<string, DxfLayer>
) {
  const lines = text.split(/\r?\n/);
  let i = 0;

  let inEntitiesSection = false;
  let currentEntityType: string | null = null;
  let currentProps: Record<number, string[]> = {};

  const flushEntity = () => {
    if (!currentEntityType) return;

    const layerName = currentProps[8]?.[0] || '0';
    const colorNum = currentProps[62]?.[0] ? parseInt(currentProps[62][0], 10) : undefined;
    const color = getAciColor(colorNum);

    if (!layers[layerName]) {
      layers[layerName] = {
        name: layerName,
        color,
        visible: true,
        entityCount: 0,
      };
    }
    layers[layerName].entityCount++;

    if (currentEntityType === 'LINE') {
      const x1 = parseFloat(currentProps[10]?.[0] || '0');
      const y1 = parseFloat(currentProps[20]?.[0] || '0');
      const x2 = parseFloat(currentProps[11]?.[0] || '0');
      const y2 = parseFloat(currentProps[21]?.[0] || '0');
      entities.push({
        type: 'LINE',
        layer: layerName,
        color,
        startPoint: { x: x1, y: y1 },
        endPoint: { x: x2, y: y2 },
      });
    } else if (currentEntityType === 'LWPOLYLINE' || currentEntityType === 'POLYLINE') {
      const xs = currentProps[10] || [];
      const ys = currentProps[20] || [];
      const len = Math.min(xs.length, ys.length);
      const vertices: DxfPoint[] = [];
      for (let k = 0; k < len; k++) {
        vertices.push({ x: parseFloat(xs[k]), y: parseFloat(ys[k]) });
      }
      const isClosed = currentProps[70]?.[0] === '1';
      if (vertices.length > 0) {
        entities.push({
          type: 'LWPOLYLINE',
          layer: layerName,
          color,
          vertices,
          isClosed,
        });
      }
    } else if (currentEntityType === 'CIRCLE') {
      const cx = parseFloat(currentProps[10]?.[0] || '0');
      const cy = parseFloat(currentProps[20]?.[0] || '0');
      const r = parseFloat(currentProps[40]?.[0] || '1');
      entities.push({
        type: 'CIRCLE',
        layer: layerName,
        color,
        center: { x: cx, y: cy },
        radius: r,
      });
    } else if (currentEntityType === 'ARC') {
      const cx = parseFloat(currentProps[10]?.[0] || '0');
      const cy = parseFloat(currentProps[20]?.[0] || '0');
      const r = parseFloat(currentProps[40]?.[0] || '1');
      const sa = parseFloat(currentProps[50]?.[0] || '0');
      const ea = parseFloat(currentProps[51]?.[0] || '360');
      entities.push({
        type: 'ARC',
        layer: layerName,
        color,
        center: { x: cx, y: cy },
        radius: r,
        startAngle: sa,
        endAngle: ea,
      });
    } else if (currentEntityType === 'TEXT' || currentEntityType === 'MTEXT') {
      const x = parseFloat(currentProps[10]?.[0] || '0');
      const y = parseFloat(currentProps[20]?.[0] || '0');
      const txt = currentProps[1]?.[0] || '';
      const h = parseFloat(currentProps[40]?.[0] || '1');
      entities.push({
        type: 'TEXT',
        layer: layerName,
        color,
        startPoint: { x, y },
        text: txt,
        height: h,
      });
    }

    currentEntityType = null;
    currentProps = {};
  };

  while (i < lines.length - 1) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1]?.trim() || '';
    i += 2;

    if (code === 2 && value === 'ENTITIES') {
      inEntitiesSection = true;
      continue;
    }
    if (code === 0 && value === 'ENDSEC') {
      flushEntity();
      inEntitiesSection = false;
      continue;
    }

    if (!inEntitiesSection) continue;

    if (code === 0) {
      flushEntity();
      if (['LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'TEXT', 'MTEXT'].includes(value)) {
        currentEntityType = value;
        currentProps = {};
      }
    } else if (currentEntityType) {
      if (!currentProps[code]) {
        currentProps[code] = [];
      }
      currentProps[code].push(value);
    }
  }

  flushEntity();
}
