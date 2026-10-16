'use client';

import { Rule } from '@/types';
import { Trash2, Sliders, Clock, Pencil, CheckSquare, Square, Check } from 'lucide-react';

interface RuleListProps {
  rules: Rule[];
  onDeleteRule?: (id: number) => void;
  onDeleteMultiple?: (ids: number[]) => void; 
  onSelectRules?: (ids: number[]) => void;
  selectedRules?: number[];
  onEditRule?: (rule: Rule) => void;
  onToggleRule?: (id: number, isActive: boolean) => void;
}

const TIMEFRAME_BADGE: Record<string, string> = {
  '5m': '5 DK',
  '15m': '15 DK',
  '1h': '1 SAAT',
  '4h': '4 SAAT',
  '1d': '1 GÜN',
};

export default function RuleList({ 
  rules, 
  onDeleteRule,
  onDeleteMultiple,
  onSelectRules, 
  selectedRules = [],
  onEditRule,
  onToggleRule,
}: RuleListProps) {
  
  // Calculate total active scoring weight
  const totalScorePotential = rules
    .filter((r) => r.is_active)
    .reduce((sum, r) => sum + (Number(r.score_impact) || 0), 0);

  const handleSelectAll = () => {
    if (!onSelectRules) return;
    if (selectedRules.length === rules.length) {
      onSelectRules([]);
    } else {
      onSelectRules(rules.map((r) => r.id).filter((id): id is number => id !== undefined));
    }
  };

  const toggleSelection = (id: number) => {
    if (!onSelectRules) return;
    if (selectedRules.includes(id)) {
      onSelectRules(selectedRules.filter((rId) => rId !== id));
    } else {
      onSelectRules([...selectedRules, id]);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedRules.length === 0) return;
    if (window.confirm(`${selectedRules.length} adet puanlama kuralını silmek istediğinize emin misiniz?`)) {
      if (onDeleteMultiple) {
        onDeleteMultiple(selectedRules);
      } else if (onDeleteRule) {
        selectedRules.forEach((id) => onDeleteRule(id));
      }
      if (onSelectRules) onSelectRules([]);
    }
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md flex flex-col">
      <div className="border-b border-slate-800 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-[#161b26] to-[#12161f]">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-blue-600/15 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wider text-slate-200 uppercase truncate">
              Dinamik Puanlama Kuralları
            </h2>
            <span className="text-[10px] text-slate-500 font-mono">
              Aktif Ağırlık: <strong className="text-blue-400">+{totalScorePotential.toFixed(2)} Puan</strong>
            </span>
          </div>
          <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-xs font-mono font-semibold text-blue-400 shrink-0">
            {rules.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSelectRules && rules.length > 0 && (
            <button 
              type="button"
              onClick={handleSelectAll} 
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 cursor-pointer ${
                selectedRules.length === rules.length && rules.length > 0
                  ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                  : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              }`}
            >
              {selectedRules.length === rules.length && rules.length > 0 ? (
                <CheckSquare className="h-3.5 w-3.5 text-blue-400" />
              ) : (
                <Square className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>Tümünü Seç</span>
            </button>
          )}
          
          {selectedRules.length > 0 && (
            <button 
              type="button"
              onClick={handleDeleteSelected} 
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 text-xs font-bold text-rose-300 hover:bg-rose-500/25 transition-all duration-200 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Seçilileri Sil ({selectedRules.length})</span>
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-800/60 font-sans text-sm max-h-[520px] overflow-y-auto scrollbar-hide p-2 space-y-2">
        {rules.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 space-y-2">
            <Sliders className="h-7 w-7 opacity-25" />
            <p className="text-center px-4 text-xs">Tanımlanmış ek puanlama kuralı bulunmuyor.</p>
          </div>
        ) : (
          rules.map((rule) => {
            const tfLabel = TIMEFRAME_BADGE[rule.timeframe || '1d'] || (rule.timeframe || '1D').toUpperCase();
            const targetText =
              rule.target_type === 'static'
                ? rule.static_value
                : `${rule.indicator_2} ${rule.indicator_2_params?.length ? `(${rule.indicator_2_params.length})` : ''}`;
            
            const isSelected = rule.id !== undefined && selectedRules.includes(rule.id);

            return (
              <div
                key={rule.id}
                className={`group flex flex-col xl:flex-row xl:items-center justify-between p-3.5 rounded-xl border transition-all duration-200 gap-3 ${
                  isSelected 
                    ? 'border-blue-500/40 bg-blue-950/20 shadow-[0_0_15px_rgba(37,99,235,0.08)]' 
                    : 'border-slate-800/80 bg-[#161b26]/50 hover:border-slate-700 hover:bg-[#1a202e]'
                }`}
              >
                <div className="flex items-start space-x-3 w-full min-w-0">
                  {onSelectRules && (
                    <div className="pt-1 shrink-0">
                      <div 
                        onClick={() => rule.id !== undefined && toggleSelection(rule.id)}
                        className={`h-5 w-5 rounded border flex items-center justify-center cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-800/80 border-slate-600 text-transparent hover:border-slate-500'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  )}

                  {/* Active / Inactive Toggle */}
                  <div className="pt-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleRule && rule.id && onToggleRule(rule.id, !rule.is_active)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        rule.is_active ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                      title={rule.is_active ? "Kuralı Devre Dışı Bırak" : "Kuralı Aktifleştir"}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                          rule.is_active ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className={`font-semibold text-sm break-words ${rule.is_active ? 'text-slate-100' : 'text-slate-400 line-through'}`}>
                        {rule.name}
                      </span>

                      <span className="inline-flex items-center space-x-1 rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-300 shrink-0">
                        <Clock className="h-2.5 w-2.5 text-slate-400" />
                        <span>{tfLabel}</span>
                      </span>

                      <span className="rounded bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-blue-300 shrink-0">
                        +{Number(rule.score_impact).toFixed(2)} Puan
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center gap-1 bg-slate-900/60 px-2 py-1 rounded border border-slate-800/60 w-fit">
                      <span>{rule.indicator_1} {rule.indicator_1_params?.length ? `(${rule.indicator_1_params.length})` : ''}</span>
                      <span className="text-amber-400 font-bold">{rule.condition}</span>
                      <span className="text-slate-300 break-words">{targetText}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-1.5 border-t border-slate-800/80 xl:border-0 pt-2 xl:pt-0 shrink-0">
                  {onEditRule && (
                    <button
                      type="button"
                      onClick={() => onEditRule(rule)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-500/15 hover:text-blue-300 transition-colors cursor-pointer"
                      title="Kuralı Düzenle"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {onDeleteRule && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Bu puanlama kuralını silmek istediğinize emin misiniz?')) {
                          onDeleteRule(rule.id!);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors cursor-pointer"
                      title="Kuralı Sil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}