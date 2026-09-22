import { ParsedDxfModel } from '../types';
import { calculateBounds } from './dxfParser';

export interface SampleDxfPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultScale: number; // default meters per unit
  generate: () => ParsedDxfModel;
}

export const SAMPLE_DXF_PRESETS: SampleDxfPreset[] = [
  {
    id: 'terreno-topografia',
    name: 'Loteamento & Terreno Topográfico',
    category: 'Topografia / Urbanismo',
    description: 'Perímetro de terreno 45m x 70m com recuos, testada e divisão em 3 lotes com cotas.',
    defaultScale: 1.0,
    generate: () => {
      const entities: import('../types').DxfEntity[] = [
        // Perimeter polygon (closed)
        {
          type: 'LWPOLYLINE',
          layer: 'PERIMETRO',
          color: '#eab308',
          isClosed: true,
          vertices: [
            { x: 0, y: 0 },
            { x: 45, y: 0 },
            { x: 48, y: 40 },
            { x: 45, y: 70 },
            { x: 0, y: 70 },
            { x: -3, y: 35 },
          ],
        },
        // Recuo frontal & laterais (offset dashed line)
        {
          type: 'LWPOLYLINE',
          layer: 'RECUOS',
          color: '#38bdf8',
          isClosed: true,
          vertices: [
            { x: 3, y: 5 },
            { x: 42, y: 5 },
            { x: 44, y: 38 },
            { x: 42, y: 65 },
            { x: 3, y: 65 },
            { x: 0, y: 35 },
          ],
        },
        // Lote 01 division
        {
          type: 'LINE',
          layer: 'LOTES',
          color: '#22c55e',
          startPoint: { x: 0, y: 24 },
          endPoint: { x: 46.5, y: 24 },
        },
        // Lote 02 division
        {
          type: 'LINE',
          layer: 'LOTES',
          color: '#22c55e',
          startPoint: { x: 0, y: 48 },
          endPoint: { x: 46.5, y: 48 },
        },
        // Street frontage alignment
        {
          type: 'LINE',
          layer: 'VIA_PUBLICA',
          color: '#f97316',
          startPoint: { x: -10, y: -2 },
          endPoint: { x: 55, y: -2 },
        },
        {
          type: 'LINE',
          layer: 'VIA_PUBLICA',
          color: '#f97316',
          startPoint: { x: -10, y: -12 },
          endPoint: { x: 55, y: -12 },
        },
        // Road centerline
        {
          type: 'LINE',
          layer: 'VIA_PUBLICA',
          color: '#fdba74',
          startPoint: { x: -10, y: -7 },
          endPoint: { x: 55, y: -7 },
        },
        // Round boundary survey markers
        { type: 'CIRCLE', layer: 'MARCOS_GPS', color: '#ef4444', center: { x: 0, y: 0 }, radius: 0.8 },
        { type: 'CIRCLE', layer: 'MARCOS_GPS', color: '#ef4444', center: { x: 45, y: 0 }, radius: 0.8 },
        { type: 'CIRCLE', layer: 'MARCOS_GPS', color: '#ef4444', center: { x: 48, y: 40 }, radius: 0.8 },
        { type: 'CIRCLE', layer: 'MARCOS_GPS', color: '#ef4444', center: { x: 45, y: 70 }, radius: 0.8 },
        { type: 'CIRCLE', layer: 'MARCOS_GPS', color: '#ef4444', center: { x: 0, y: 70 }, radius: 0.8 },
        { type: 'CIRCLE', layer: 'MARCOS_GPS', color: '#ef4444', center: { x: -3, y: 35 }, radius: 0.8 },
        // Text annotations
        { type: 'TEXT', layer: 'TEXTOS', color: '#f8fafc', startPoint: { x: 20, y: 12 }, text: 'LOTE 01 - 1.050 m²', height: 2 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#f8fafc', startPoint: { x: 20, y: 36 }, text: 'LOTE 02 - 1.120 m²', height: 2 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#f8fafc', startPoint: { x: 20, y: 58 }, text: 'LOTE 03 - 980 m²', height: 2 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#f97316', startPoint: { x: 15, y: -5 }, text: 'AVENIDA PRINCIPAL (TESTADA 45.00m)', height: 1.8 },
      ];

      const layers = {
        PERIMETRO: { name: 'PERIMETRO', color: '#eab308', visible: true, entityCount: 1 },
        RECUOS: { name: 'RECUOS', color: '#38bdf8', visible: true, entityCount: 1 },
        LOTES: { name: 'LOTES', color: '#22c55e', visible: true, entityCount: 2 },
        VIA_PUBLICA: { name: 'VIA_PUBLICA', color: '#f97316', visible: true, entityCount: 3 },
        MARCOS_GPS: { name: 'MARCOS_GPS', color: '#ef4444', visible: true, entityCount: 6 },
        TEXTOS: { name: 'TEXTOS', color: '#f8fafc', visible: true, entityCount: 4 },
      };

      return {
        name: 'terreno_loteamento_padrao.dxf',
        fileSize: 4280,
        bounds: calculateBounds(entities),
        entities,
        layers,
        totalEntities: entities.length,
      };
    },
  },
  {
    id: 'planta-residencial',
    name: 'Planta Baixa Residencial',
    category: 'Arquitetura',
    description: 'Casa térrea 12m x 16m com sala integrada, 3 quartos, suíte, cozinha e garagem.',
    defaultScale: 1.0,
    generate: () => {
      const entities: import('../types').DxfEntity[] = [
        // External walls (Perímetro da casa)
        {
          type: 'LWPOLYLINE',
          layer: 'PAREDES_EXTERNAS',
          color: '#f8fafc',
          isClosed: true,
          vertices: [
            { x: 0, y: 0 },
            { x: 12, y: 0 },
            { x: 12, y: 16 },
            { x: 4, y: 16 },
            { x: 4, y: 12 },
            { x: 0, y: 12 },
          ],
        },
        // Garagem / Abrigo de carros
        {
          type: 'LWPOLYLINE',
          layer: 'GARAGEM',
          color: '#38bdf8',
          isClosed: true,
          vertices: [
            { x: 0, y: 12 },
            { x: 4, y: 12 },
            { x: 4, y: 16 },
            { x: 0, y: 16 },
          ],
        },
        // Paredes internas
        // Divisão Sala / Cozinha x Quartos
        {
          type: 'LINE',
          layer: 'PAREDES_INTERNAS',
          color: '#94a3b8',
          startPoint: { x: 6, y: 0 },
          endPoint: { x: 6, y: 12 },
        },
        // Quarto Suíte
        {
          type: 'LINE',
          layer: 'PAREDES_INTERNAS',
          color: '#94a3b8',
          startPoint: { x: 6, y: 6 },
          endPoint: { x: 12, y: 6 },
        },
        // Banheiro Suíte
        {
          type: 'LINE',
          layer: 'PAREDES_INTERNAS',
          color: '#94a3b8',
          startPoint: { x: 9.5, y: 6 },
          endPoint: { x: 9.5, y: 10 },
        },
        // Quarto 02
        {
          type: 'LINE',
          layer: 'PAREDES_INTERNAS',
          color: '#94a3b8',
          startPoint: { x: 6, y: 10 },
          endPoint: { x: 12, y: 10 },
        },
        // Cozinha americana
        {
          type: 'LINE',
          layer: 'PAREDES_INTERNAS',
          color: '#94a3b8',
          startPoint: { x: 0, y: 6 },
          endPoint: { x: 4.5, y: 6 },
        },
        // Portas (arcos 90°)
        { type: 'ARC', layer: 'ESQUADRIAS', color: '#f59e0b', center: { x: 0.8, y: 0 }, radius: 0.8, startAngle: 0, endAngle: 90 },
        { type: 'ARC', layer: 'ESQUADRIAS', color: '#f59e0b', center: { x: 6, y: 6.8 }, radius: 0.8, startAngle: 90, endAngle: 180 },
        { type: 'ARC', layer: 'ESQUADRIAS', color: '#f59e0b', center: { x: 6, y: 10.8 }, radius: 0.8, startAngle: 90, endAngle: 180 },
        // Janelas (linhas duplas)
        { type: 'LINE', layer: 'ESQUADRIAS', color: '#06b6d4', startPoint: { x: 2, y: 0 }, endPoint: { x: 4.5, y: 0 } },
        { type: 'LINE', layer: 'ESQUADRIAS', color: '#06b6d4', startPoint: { x: 8, y: 0 }, endPoint: { x: 10.5, y: 0 } },
        { type: 'LINE', layer: 'ESQUADRIAS', color: '#06b6d4', startPoint: { x: 12, y: 2 }, endPoint: { x: 12, y: 4.5 } },
        { type: 'LINE', layer: 'ESQUADRIAS', color: '#06b6d4', startPoint: { x: 12, y: 7.5 }, endPoint: { x: 12, y: 9.5 } },
        { type: 'LINE', layer: 'ESQUADRIAS', color: '#06b6d4', startPoint: { x: 12, y: 12 }, endPoint: { x: 12, y: 14.5 } },
        // Textos
        { type: 'TEXT', layer: 'TEXTOS', color: '#f8fafc', startPoint: { x: 2, y: 3 }, text: 'SALA DE ESTAR', height: 0.7 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#f8fafc', startPoint: { x: 2, y: 9 }, text: 'COZINHA / COPA', height: 0.7 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#f8fafc', startPoint: { x: 8, y: 3 }, text: 'SUÍTE MASTER', height: 0.7 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#f8fafc', startPoint: { x: 8, y: 8 }, text: 'DORMITÓRIO 01', height: 0.7 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#f8fafc', startPoint: { x: 7, y: 13 }, text: 'DORMITÓRIO 02', height: 0.7 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#38bdf8', startPoint: { x: 0.5, y: 14 }, text: 'GARAGEM (2 VAGAS)', height: 0.6 },
      ];

      const layers = {
        PAREDES_EXTERNAS: { name: 'PAREDES_EXTERNAS', color: '#f8fafc', visible: true, entityCount: 1 },
        PAREDES_INTERNAS: { name: 'PAREDES_INTERNAS', color: '#94a3b8', visible: true, entityCount: 5 },
        GARAGEM: { name: 'GARAGEM', color: '#38bdf8', visible: true, entityCount: 1 },
        ESQUADRIAS: { name: 'ESQUADRIAS', color: '#06b6d4', visible: true, entityCount: 8 },
        TEXTOS: { name: 'TEXTOS', color: '#f8fafc', visible: true, entityCount: 6 },
      };

      return {
        name: 'planta_baixa_residencia_160m2.dxf',
        fileSize: 3840,
        bounds: calculateBounds(entities),
        entities,
        layers,
        totalEntities: entities.length,
      };
    },
  },
  {
    id: 'galpao-industrial',
    name: 'Galpão Industrial & Logístico',
    category: 'Engenharia Civil',
    description: 'Galpão 30m x 70m com 4 docas de carga, pilares metálicos e bloco administrativo.',
    defaultScale: 1.0,
    generate: () => {
      const entities: import('../types').DxfEntity[] = [
        // Main warehouse perimeter
        {
          type: 'LWPOLYLINE',
          layer: 'ESTRUTURA_GALPAO',
          color: '#10b981',
          isClosed: true,
          vertices: [
            { x: 0, y: 0 },
            { x: 30, y: 0 },
            { x: 30, y: 70 },
            { x: 0, y: 70 },
          ],
        },
        // Office block (Administração anexa)
        {
          type: 'LWPOLYLINE',
          layer: 'ADMINISTRACAO',
          color: '#3b82f6',
          isClosed: true,
          vertices: [
            { x: -10, y: 5 },
            { x: 0, y: 5 },
            { x: 0, y: 35 },
            { x: -10, y: 35 },
          ],
        },
        // Truck Docks (Docas de expedição/recebimento)
        {
          type: 'LWPOLYLINE',
          layer: 'DOCAS',
          color: '#f59e0b',
          isClosed: true,
          vertices: [
            { x: 5, y: -4 },
            { x: 25, y: -4 },
            { x: 25, y: 0 },
            { x: 5, y: 0 },
          ],
        },
        // Individual dock bay lines
        { type: 'LINE', layer: 'DOCAS', color: '#f59e0b', startPoint: { x: 10, y: -4 }, endPoint: { x: 10, y: 0 } },
        { type: 'LINE', layer: 'DOCAS', color: '#f59e0b', startPoint: { x: 15, y: -4 }, endPoint: { x: 15, y: 0 } },
        { type: 'LINE', layer: 'DOCAS', color: '#f59e0b', startPoint: { x: 20, y: -4 }, endPoint: { x: 20, y: 0 } },
        // Pátio de manobras / Caminhões
        {
          type: 'LWPOLYLINE',
          layer: 'PATIO_MANOBRA',
          color: '#64748b',
          isClosed: false,
          vertices: [
            { x: -15, y: -18 },
            { x: 45, y: -18 },
            { x: 45, y: 75 },
          ],
        },
      ];

      // Columns grid (Pilares a cada 10 metros)
      for (let y = 10; y <= 60; y += 10) {
        // Left column
        entities.push({ type: 'CIRCLE', layer: 'PILARES', color: '#ef4444', center: { x: 10, y }, radius: 0.6 });
        // Right column
        entities.push({ type: 'CIRCLE', layer: 'PILARES', color: '#ef4444', center: { x: 20, y }, radius: 0.6 });
      }

      // Annotations
      entities.push(
        { type: 'TEXT', layer: 'TEXTOS', color: '#f8fafc', startPoint: { x: 10, y: 35 }, text: 'GALPÃO LOGÍSTICO (2.100 m²)', height: 2 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#3b82f6', startPoint: { x: -8, y: 20 }, text: 'ADM / ESCRITÓRIOS (300 m²)', height: 1.2 },
        { type: 'TEXT', layer: 'TEXTOS', color: '#f59e0b', startPoint: { x: 7, y: -2.5 }, text: 'DOCAS NIVELADORAS 1 A 4', height: 1.2 }
      );

      const layers = {
        ESTRUTURA_GALPAO: { name: 'ESTRUTURA_GALPAO', color: '#10b981', visible: true, entityCount: 1 },
        ADMINISTRACAO: { name: 'ADMINISTRACAO', color: '#3b82f6', visible: true, entityCount: 1 },
        DOCAS: { name: 'DOCAS', color: '#f59e0b', visible: true, entityCount: 4 },
        PILARES: { name: 'PILARES', color: '#ef4444', visible: true, entityCount: 12 },
        PATIO_MANOBRA: { name: 'PATIO_MANOBRA', color: '#64748b', visible: true, entityCount: 1 },
        TEXTOS: { name: 'TEXTOS', color: '#f8fafc', visible: true, entityCount: 3 },
      };

      return {
        name: 'galpao_logistico_industrial_30x70m.dxf',
        fileSize: 5120,
        bounds: calculateBounds(entities),
        entities,
        layers,
        totalEntities: entities.length,
      };
    },
  },
];
