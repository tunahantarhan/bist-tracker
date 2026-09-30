'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createRule } from '@/services/api';
import { Plus } from 'lucide-react';

interface CreateRuleDialogProps {
  onRuleCreated?: () => void;
}

const INDICATORS = [
  { value: 'RSI', label: 'RSI' },
  { value: 'STOCH_RSI_K', label: 'Stoch RSI (%K)' },
  { value: 'STOCH_RSI_D', label: 'Stoch RSI (%D)' },
  { value: 'MACD_LINE', label: 'MACD Line' },
  { value: 'MACD_SIGNAL', label: 'MACD Signal' },
  { value: 'MACD_HIST', label: 'MACD Histogram' },
  { value: 'SMA', label: 'MA (Hareketli Ortalama)' },
  { value: 'BOLLINGER_UPPER', label: 'Bollinger Üst Bant' },
  { value: 'BOLLINGER_MIDDLE', label: 'Bollinger Orta Bant' },
  { value: 'BOLLINGER_LOWER', label: 'Bollinger Alt Bant' },
  { value: 'PRICE', label: 'Fiyat (Kapanış)' },
];

const CONDITIONS = [
  { value: '>', label: 'Büyüktür (>)' },
  { value: '<', label: 'Küçüktür (<)' },
  { value: '>=', label: 'Büyük Eşittir (>=)' },
  { value: '<=', label: 'Küçük Eşittir (<=)' },
  { value: 'crosses_above', label: 'Yukarı Keser (Crosses Above)' },
  { value: 'crosses_below', label: 'Aşağı Keser (Crosses Below)' },
];

const TARGET_TYPES = [
  { value: 'static', label: 'Sabit Sayı (Örn: 30)' },
  { value: 'indicator', label: 'Başka Bir İndikatör' },
];

// Helper functions to display human-readable labels inside the trigger boxes
const getIndicatorLabel = (val: string) =>
  INDICATORS.find((i) => i.value === val)?.label || val;

const getConditionLabel = (val: string) =>
  CONDITIONS.find((c) => c.value === val)?.label || val;

const getTargetTypeLabel = (val: string) =>
  TARGET_TYPES.find((t) => t.value === val)?.label || val;

export default function CreateRuleDialog({ onRuleCreated }: CreateRuleDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [indicator1, setIndicator1] = useState('SMA');
  const [ind1Length, setInd1Length] = useState('50');
  const [condition, setCondition] = useState('crosses_above');
  const [targetType, setTargetType] = useState<'static' | 'indicator'>('indicator');
  const [staticValue, setStaticValue] = useState('30');
  const [indicator2, setIndicator2] = useState('SMA');
  const [ind2Length, setInd2Length] = useState('200');
  const [scoreImpact, setScoreImpact] = useState('12.50');

  // Helper to build JSONB parameters based on selected indicator
  const buildParams = (ind: string, lengthVal: string) => {
    const len = parseInt(lengthVal, 10) || 14;
    if (ind === 'SMA' || ind === 'RSI') return { length: len };
    if (ind.startsWith('BOLLINGER')) return { length: 22, std_dev: 2.0 };
    if (ind.startsWith('STOCH_RSI')) return { length: 14, rsi_length: 14, k: 3, d: 3 };
    if (ind.startsWith('MACD')) return { fast: 12, slow: 26, signal: 9 };
    return {};
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !scoreImpact) return;

    setLoading(true);
    try {
      await createRule({
        name,
        description: name,
        indicator_1: indicator1,
        indicator_1_params: buildParams(indicator1, ind1Length),
        condition,
        target_type: targetType,
        static_value: targetType === 'static' ? parseFloat(staticValue) : null,
        indicator_2: targetType === 'indicator' ? indicator2 : null,
        indicator_2_params: targetType === 'indicator' ? buildParams(indicator2, ind2Length) : null,
        score_impact: parseFloat(scoreImpact),
        is_active: true,
      } as any);

      setOpen(false);
      setName('');
      if (onRuleCreated) onRuleCreated();
    } catch (error) {
      console.error('Failed to create rule:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <span className="inline-flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all duration-200 hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer">
          <Plus className="h-4 w-4" />
          <span>Yeni Algoritmik Kural Ekle</span>
        </span>
      </DialogTrigger>
      <DialogContent className="border border-slate-700/80 bg-[#12161f] text-slate-100 sm:max-w-xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-100">
            Dinamik Skor Kuralı Tanımla
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-3">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-300">Kural Adı / Açıklaması</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Golden Cross (MA 50 Yukarı Keser MA 200)"
              className="border-slate-700/80 bg-[#161b26] text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-500"
              required
            />
          </div>

          {/* 1. Indicator Selection */}
          <div className="grid grid-cols-12 gap-4">
            <div className={`${indicator1 === 'SMA' || indicator1 === 'RSI' ? 'col-span-8' : 'col-span-12'} space-y-2`}>
              <Label className="text-xs font-medium text-slate-300">1. İndikatör</Label>
              <Select value={indicator1} onValueChange={(val) => val && setIndicator1(val)}>
                <SelectTrigger>
                  <SelectValue>{getIndicatorLabel(indicator1)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {INDICATORS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(indicator1 === 'SMA' || indicator1 === 'RSI') && (
              <div className="col-span-4 space-y-2">
                <Label className="text-xs font-medium text-slate-300">Periyot (Gün)</Label>
                <Input
                  type="number"
                  value={ind1Length}
                  onChange={(e) => setInd1Length(e.target.value)}
                  placeholder="9, 14, 21, 50..."
                  className="border-slate-700/80 bg-[#161b26] text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* Condition & Target Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-300">Koşul Operatörü</Label>
              <Select value={condition} onValueChange={(val) => val && setCondition(val)}>
                <SelectTrigger>
                  <SelectValue>{getConditionLabel(condition)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-300">Hedef Türü</Label>
              <Select value={targetType} onValueChange={(v) => v && setTargetType(v as 'static' | 'indicator')}>
                <SelectTrigger>
                  <SelectValue>{getTargetTypeLabel(targetType)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TARGET_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Target Value or 2nd Indicator */}
          {targetType === 'static' ? (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-300">Sabit Eşik Değer</Label>
              <Input
                type="number"
                step="any"
                value={staticValue}
                onChange={(e) => setStaticValue(e.target.value)}
                placeholder="Örn: RSI için 30 veya 70"
                className="border-slate-700/80 bg-[#161b26] text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-500"
                required
              />
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-4">
              <div className={`${indicator2 === 'SMA' || indicator2 === 'RSI' ? 'col-span-8' : 'col-span-12'} space-y-2`}>
                <Label className="text-xs font-medium text-slate-300">2. İndikatör (Hedef)</Label>
                <Select value={indicator2} onValueChange={(val) => val && setIndicator2(val)}>
                  <SelectTrigger>
                    <SelectValue>{getIndicatorLabel(indicator2)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {INDICATORS.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(indicator2 === 'SMA' || indicator2 === 'RSI') && (
                <div className="col-span-4 space-y-2">
                  <Label className="text-xs font-medium text-slate-300">Periyot (Gün)</Label>
                  <Input
                    type="number"
                    value={ind2Length}
                    onChange={(e) => setInd2Length(e.target.value)}
                    placeholder="50, 100, 200..."
                    className="border-slate-700/80 bg-[#161b26] text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Millimetric Score Impact */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-300">Skor Etkisi (Milimetrik Puan)</Label>
            <Input
              type="number"
              step="0.01"
              value={scoreImpact}
              onChange={(e) => setScoreImpact(e.target.value)}
              placeholder="Örn: 12.50 veya 15.75"
              className="border-slate-700/80 bg-[#161b26] text-slate-100 font-mono transition-colors hover:border-slate-600 focus:border-blue-500"
              required
            />
          </div>

          <div className="pt-3 flex justify-end space-x-3 border-t border-slate-800/80">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100 cursor-pointer transition-all duration-200"
            >
              İptal
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)] hover:shadow-[0_0_18px_rgba(37,99,235,0.5)] cursor-pointer transition-all duration-200"
            >
              {loading ? 'Kaydediliyor...' : 'Kuralı Kaydet'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}