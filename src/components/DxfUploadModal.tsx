import React, { useState } from 'react';
import { Check, FileText, Info, Sparkles, Upload, X } from 'lucide-react';
import { SAMPLE_DXF_PRESETS } from '../utils/sampleDxf';

interface DxfUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadDxfContent: (text: string, name: string) => void;
  onSelectSample: (presetId: string) => void;
}

export const DxfUploadModal: React.FC<DxfUploadModalProps> = ({
  isOpen,
  onClose,
  onLoadDxfContent,
  onSelectSample,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setErrorMessage('Por favor selecione um arquivo com extensão .DXF');
      return;
    }

    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        onLoadDxfContent(content, file.name);
        onClose();
      }
    };
    reader.onerror = () => {
      setErrorMessage('Erro ao ler o arquivo DXF');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div
        id="dxf-upload-modal"
        className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-950/70 text-cyan-400 border border-cyan-800">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Importar Desenho DXF 2D</h2>
              <p className="text-xs text-slate-400">Sobreponha seu projeto arquitetônico ou topográfico</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Dropzone / Upload Button */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
              isDragging
                ? 'border-cyan-400 bg-cyan-950/30'
                : 'border-slate-700 hover:border-slate-600 bg-slate-950/40'
            }`}
          >
            <Upload className="w-10 h-10 text-cyan-400 mx-auto mb-2" />
            <span className="block font-semibold text-slate-200 text-sm mb-1">
              Arraste o arquivo .DXF ou clique abaixo
            </span>
            <span className="block text-xs text-slate-400 mb-3">
              Suporta polilinhas, linhas, círculos, arcos e textos 2D
            </span>

            <label className="inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-bold text-xs cursor-pointer shadow-lg shadow-cyan-500/20 transition-all">
              <Upload className="w-4 h-4" />
              <span>Selecionar Arquivo DXF</span>
              <input
                type="file"
                accept=".dxf,.DXF"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
              />
            </label>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-200 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Quick Presets Section */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Ou teste com modelos prontos:
            </span>

            <div className="space-y-2">
              {SAMPLE_DXF_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    onSelectSample(preset.id);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 transition-all group flex items-start justify-between"
                >
                  <div className="pr-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-slate-100 group-hover:text-cyan-300">
                        {preset.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{preset.description}</p>
                  </div>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/50 shrink-0 font-medium">
                    Carregar
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Tips info box */}
          <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Dica de Uso no Celular Android:</strong> Após carregar, utilize o Portão de Comando
              Lateral ou a barra inferior para arrastar e girar o desenho sobre o terreno de satélite.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
