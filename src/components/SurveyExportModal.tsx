import React, { useState } from 'react';
import {
  Check,
  Clipboard,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  MapPin,
  Ruler,
  X,
} from 'lucide-react';
import { SurveySequencePoint } from '../types';
import {
  calculateDistanceMeters,
  calculatePolygonAreaM2,
  formatDistance,
  generateCoordinatesReportCsv,
  generateCoordinatesReportText,
  toDMS,
} from '../utils/geoTransform';

interface SurveyExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  points: SurveySequencePoint[];
  isClosed: boolean;
  projectName?: string;
}

export const SurveyExportModal: React.FC<SurveyExportModalProps> = ({
  isOpen,
  onClose,
  points,
  isClosed,
  projectName,
}) => {
  const [activeFormat, setActiveFormat] = useState<'txt' | 'csv' | 'table'>('txt');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const reportText = generateCoordinatesReportText(points, isClosed, projectName);
  const reportCsv = generateCoordinatesReportCsv(points, isClosed);

  let totalDistance = 0;
  if (points.length > 0) {
    totalDistance = points[points.length - 1].cumulativeDistance || 0;
    if (isClosed && points.length >= 3) {
      totalDistance += calculateDistanceMeters(
        points[points.length - 1].lat,
        points[points.length - 1].lng,
        points[0].lat,
        points[0].lng
      );
    }
  }

  const areaM2 = isClosed && points.length >= 3 ? calculatePolygonAreaM2(points) : null;

  const handleCopyClipboard = async () => {
    try {
      const contentToCopy = activeFormat === 'csv' ? reportCsv : reportText;
      await navigator.clipboard.writeText(contentToCopy);
      setCopied(true);
      if ('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      alert('Não foi possível copiar para a área de transferência.');
    }
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `Carmo_Energy_Coordenadas_${timestamp}.txt`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if ('vibrate' in navigator) navigator.vibrate(15);
  };

  const handleDownloadCsv = () => {
    const blob = new Blob([reportCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `Carmo_Energy_Coordenadas_${timestamp}.csv`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if ('vibrate' in navigator) navigator.vibrate(15);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
    >
      <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <header className="px-4 py-3 sm:px-6 sm:py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  Exportar Lista de Coordenadas
                </h2>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                  Carmo Energy
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Coordenadas geodésicas (Decimais e GMS) com distâncias sequenciais acumuladas
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Stats Strip */}
        <div className="px-4 py-2.5 sm:px-6 bg-slate-950/40 border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block">Total de Pontos</span>
              <strong className="text-slate-100 font-mono text-sm">{points.length} pontos</strong>
            </div>
          </div>

          <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800 flex items-center gap-2">
            <Ruler className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block">Extensão Total</span>
              <strong className="text-amber-300 font-mono text-sm">{formatDistance(totalDistance)}</strong>
            </div>
          </div>

          <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Alinhamento</span>
            <strong className="text-slate-200 text-xs">
              {isClosed && points.length >= 3 ? 'Poligonal Fechada' : 'Trajeto Aberto'}
            </strong>
          </div>

          <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Área Enquadrada</span>
            <strong className="text-emerald-400 font-mono text-xs">
              {areaM2 !== null ? `${areaM2.toFixed(1)} m²` : '--- (Aberto)'}
            </strong>
          </div>
        </div>

        {/* Format Selector Bar */}
        <div className="px-4 py-2 sm:px-6 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveFormat('txt')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                activeFormat === 'txt'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Relatório (.TXT)</span>
            </button>
            <button
              onClick={() => setActiveFormat('table')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                activeFormat === 'table'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Visualização em Tabela</span>
            </button>
            <button
              onClick={() => setActiveFormat('csv')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                activeFormat === 'csv'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Código (.CSV)</span>
            </button>
          </div>

          {/* Quick Copy */}
          <button
            onClick={handleCopyClipboard}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${
              copied
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado para Área de Transferência!' : 'Copiar Lista'}</span>
          </button>
        </div>

        {/* Content Preview Box */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-950/70 font-mono text-xs">
          {activeFormat === 'table' ? (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-300 border-b border-slate-800 text-[11px]">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Vértice</th>
                    <th className="py-2.5 px-3">Latitude (Dec)</th>
                    <th className="py-2.5 px-3">Longitude (Dec)</th>
                    <th className="py-2.5 px-3">Latitude (GMS)</th>
                    <th className="py-2.5 px-3">Longitude (GMS)</th>
                    <th className="py-2.5 px-3 text-right">Trecho</th>
                    <th className="py-2.5 px-3 text-right">Acumulado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200 text-xs">
                  {points.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 px-3 text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                          {p.label || `P${p.index}`}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-cyan-200">{p.lat.toFixed(6)}°</td>
                      <td className="py-2 px-3 font-mono text-cyan-200">{p.lng.toFixed(6)}°</td>
                      <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">{toDMS(p.lat, true)}</td>
                      <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">{toDMS(p.lng, false)}</td>
                      <td className="py-2 px-3 text-right font-mono text-amber-300">
                        {idx === 0 ? '---' : formatDistance(p.distanceFromPrev || 0)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-300 font-bold">
                        {formatDistance(p.cumulativeDistance || 0)}
                      </td>
                    </tr>
                  ))}
                  {isClosed && points.length >= 3 && (
                    <tr className="bg-amber-500/10 text-amber-200 font-semibold">
                      <td className="py-2 px-3 text-amber-400">---</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/30 text-amber-300 border border-amber-500/40">
                          Fechamento
                        </span>
                      </td>
                      <td colSpan={4} className="py-2 px-3 text-slate-400 text-xs">
                        Retorno de {points[points.length - 1].label || `P${points.length}`} ao ponto inicial {points[0].label || 'P1'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-amber-300">
                        {formatDistance(
                          calculateDistanceMeters(
                            points[points.length - 1].lat,
                            points[points.length - 1].lng,
                            points[0].lat,
                            points[0].lng
                          )
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-amber-400 font-bold">
                        {formatDistance(totalDistance)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed select-all">
              {activeFormat === 'csv' ? reportCsv : reportText}
            </pre>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="px-4 py-3 sm:px-6 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <span>Referência: <strong>Datum WGS84</strong></span>
            <span>•</span>
            <span>Carmo Energy Topografia</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar CSV (.csv)</span>
            </button>
            <button
              onClick={handleDownloadTxt}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-500/25 active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Relatório (.txt)</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
