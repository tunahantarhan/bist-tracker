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
        <span className="inline-flex items-center space-x-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-[0_0_12px_rgba(37,99,235,0.4)] transition hover:bg-blue-500 cursor-pointer">
          <Plus className="h-4 w-4" />
          <span>Yeni Algoritmik Kural Ekle</span>
        </span>
      </DialogTrigger>
      <DialogContent className="border-slate-800 bg-[#12161f] text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Dinamik Skor Kuralı Tanımla</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-slate-300">Kural Adı / Açıklaması</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Golden Cross (MA 50 Yukarı Keser MA 200)"
              className="border-slate-700 bg-slate-900 text-slate-100"
              required
            />
          </div>

          {/* 1. Indicator Selection */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label className="text-slate-300">1. İndikatör</Label>
              <Select value={indicator1} onValueChange={(val) => val && setIndicator1(val)}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-[#12161f] text-slate-100">
                  {INDICATORS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(indicator1 === 'SMA' || indicator1 === 'RSI') && (
              <div className="space-y-2">
                <Label className="text-slate-300">Periyot (Gün)</Label>
                <Input
                  type="number"
                  value={ind1Length}
                  onChange={(e) => setInd1Length(e.target.value)}
                  placeholder="9, 14, 21, 50..."
                  className="border-slate-700 bg-slate-900 text-slate-100"
                />
              </div>
            )}
          </div>

          {/* Condition & Target Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300">Koşul Operatörü</Label>
              <Select value={condition} onValueChange={(val) => val && setCondition(val)}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-[#12161f] text-slate-100">
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Hedef Türü</Label>
              <Select value={targetType} onValueChange={(v) => setTargetType(v as 'static' | 'indicator')}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-[#12161f] text-slate-100">
                  <SelectItem value="static">Sabit Sayı (Örn: 30)</SelectItem>
                  <SelectItem value="indicator">Başka Bir İndikatör</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Target Value or 2nd Indicator */}
          {targetType === 'static' ? (
            <div className="space-y-2">
              <Label className="text-slate-300">Sabit Eşik Değer</Label>
              <Input
                type="number"
                step="any"
                value={staticValue}
                onChange={(e) => setStaticValue(e.target.value)}
                placeholder="Örn: RSI için 30 veya 70"
                className="border-slate-700 bg-slate-900 text-slate-100"
                required
              />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label className="text-slate-300">2. İndikatör (Hedef)</Label>
                <Select value={indicator2} onValueChange={(val) => val && setIndicator2(val)}>
                  <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-800 bg-[#12161f] text-slate-100">
                    {INDICATORS.map((i) => (
                      <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(indicator2 === 'SMA' || indicator2 === 'RSI') && (
                <div className="space-y-2">
                  <Label className="text-slate-300">Periyot (Gün)</Label>
                  <Input
                    type="number"
                    value={ind2Length}
                    onChange={(e) => setInd2Length(e.target.value)}
                    placeholder="50, 100, 200..."
                    className="border-slate-700 bg-slate-900 text-slate-100"
                  />
                </div>
              )}
            </div>
          )}

          {/* Millimetric Score Impact */}
          <div className="space-y-2">
            <Label className="text-slate-300">Skor Etkisi (Milimetrik Puan)</Label>
            <Input
              type="number"
              step="0.01"
              value={scoreImpact}
              onChange={(e) => setScoreImpact(e.target.value)}
              placeholder="Örn: 12.50 veya 15.75"
              className="border-slate-700 bg-slate-900 text-slate-100 font-mono"
              required
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800"
            >
              İptal
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {loading ? 'Kaydediliyor...' : 'Kuralı Kaydet'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}