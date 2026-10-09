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
import { Plus, Filter, Sparkles } from 'lucide-react';

interface CreateRuleDialogProps {
  onRuleCreated?: () => void;
}

const TIMEFRAMES = [
  { value: '5m', label: '5 Dakikalık (5dk)' },
  { value: '15m', label: '15 Dakikalık (15dk)' },
  { value: '1h', label: '1 Saatlik (1s)' },
  { value: '4h', label: '4 Saatlik (4s)' },
  { value: '1d', label: '1 Günlük (1g)' },
];

const INDICATORS = [
  { value: 'RSI', label: 'RSI' },
  { value: 'RSI_TRENDLINE', label: 'RSI Düşen Trend Çizgisi (Mavi Çizgi)' },
  { value: 'SMA', label: 'MA (Basit Hareketli Ortalama)' },
  { value: 'EMA', label: 'EMA (Üssel Hareketli Ortalama)' },
  { value: 'STOCH_RSI_K', label: 'Stoch RSI (%K)' },
  { value: 'STOCH_RSI_D', label: 'Stoch RSI (%D)' },
  { value: 'MACD_LINE', label: 'MACD Line' },
  { value: 'MACD_SIGNAL', label: 'MACD Signal' },
  { value: 'MACD_HIST', label: 'MACD Histogram' },
  { value: 'BOLLINGER_UPPER', label: 'Bollinger Üst Bant' },
  { value: 'BOLLINGER_MIDDLE', label: 'Bollinger Orta Bant' },
  { value: 'BOLLINGER_LOWER', label: 'Bollinger Alt Bant' },
  { value: 'PRICE', label: 'Fiyat (Kapanış)' },
];

const CONDITIONS = [
  { value: 'crosses_above', label: 'Yukarı Keser (Crosses Above)' },
  { value: 'crosses_below', label: 'Aşağı Keser (Crosses Below)' },
  { value: '>', label: 'Büyüktür (>)' },
  { value: '<', label: 'Küçüktür (<)' },
  { value: '>=', label: 'Büyük Eşittir (>=)' },
  { value: '<=', label: 'Küçük Eşittir (<=)' },
];

const TARGET_TYPES = [
  { value: 'indicator', label: 'Başka Bir İndikatör / Trend Çizgisi' },
  { value: 'static', label: 'Sabit Sayı (Örn: 30 veya 50)' },
];

const getTimeframeLabel = (val: string) =>
  TIMEFRAMES.find((tf) => tf.value === val)?.label || val;

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
  const [timeframe, setTimeframe] = useState('4h');
  const [isPrimaryFilter, setIsPrimaryFilter] = useState(false);

  const [indicator1, setIndicator1] = useState('RSI');
  const [ind1Length, setInd1Length] = useState('14');
  const [condition, setCondition] = useState('>');
  const [targetType, setTargetType] = useState<'static' | 'indicator'>('indicator');
  const [staticValue, setStaticValue] = useState('30');

  const [indicator2, setIndicator2] = useState('RSI_TRENDLINE');
  const [ind2Length, setInd2Length] = useState('21');

  // RSI Trendline specific parameters
  const [trendLookback, setTrendLookback] = useState('60');
  const [trendMinPeak, setTrendMinPeak] = useState('55');
  const [trendSlope, setTrendSlope] = useState(''); // Optional manual negative slope

  const [scoreImpact, setScoreImpact] = useState('25.00');

  // Quick preset loader for Consultant's 4h RSI Breakout or 5m/15m MA Crossover
  const applyPreset = (preset: 'rsi_breakout_4h' | 'ma_cross_15m' | 'ma_cross_5m') => {
    if (preset === 'rsi_breakout_4h') {
      setName('4S RSI (14) Düşen Trend Kırılımı (Mavi Çizgi)');
      setTimeframe('4h');
      setIsPrimaryFilter(true);
      setIndicator1('RSI');
      setInd1Length('14');
      setCondition('>');
      setTargetType('indicator');
      setIndicator2('RSI_TRENDLINE');
      setTrendLookback('60');
      setTrendMinPeak('55');
      setScoreImpact('25.00');
    } else if (preset === 'ma_cross_15m') {
      setName('Kısa Vade: MA(9) > MA(14) Trendi');
      setTimeframe('15m');
      setIsPrimaryFilter(false);
      setIndicator1('SMA');
      setInd1Length('9');
      setCondition('>');
      setTargetType('indicator');
      setIndicator2('SMA');
      setInd2Length('14');
      setScoreImpact('10.00');
    } else if (preset === 'ma_cross_5m') {
      setName('5Dk MA(9) Yukarı Keser MA(21)');
      setTimeframe('5m');
      setIsPrimaryFilter(false);
      setIndicator1('SMA');
      setInd1Length('9');
      setCondition('crosses_above');
      setTargetType('indicator');
      setIndicator2('SMA');
      setInd2Length('21');
      setScoreImpact('10.00');
    }
  };

  const buildParams = (ind: string, lengthVal: string) => {
    const len = parseInt(lengthVal, 10) || 14;
    if (ind === 'SMA' || ind === 'EMA' || ind === 'RSI') return { length: len };
    if (ind === 'RSI_TRENDLINE') {
      const p: Record<string, any> = {
        length: parseInt(ind1Length, 10) || 14,
        lookback: parseInt(trendLookback, 10) || 60,
        min_peak: parseFloat(trendMinPeak) || 55.0,
      };
      if (trendSlope.trim() !== '' && !isNaN(parseFloat(trendSlope))) {
        p.slope = parseFloat(trendSlope);
      }
      return p;
    }
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
        timeframe,
        is_primary_filter: isPrimaryFilter,
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

  const handleSeedConsultantSuite = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('http://127.0.0.1:8000/api/v1/rules/seed-defaults', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        setOpen(false);
        if (onRuleCreated) onRuleCreated();
      }
    } catch (error) {
      console.error('Failed to seed default consultant rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const showInd1Period = indicator1 === 'SMA' || indicator1 === 'EMA' || indicator1 === 'RSI';
  const showInd2Period = indicator2 === 'SMA' || indicator2 === 'EMA' || indicator2 === 'RSI';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <span className="inline-flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all duration-200 hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer">
          <Plus className="h-4 w-4" />
          <span>Yeni Algoritmik Kural Ekle</span>
        </span>
      </DialogTrigger>
      <DialogContent className="border border-slate-700/80 bg-[#12161f] text-slate-100 sm:max-w-xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-100">
            Çoklu Periyot & Dinamik Skor Kuralı Tanımla
          </DialogTitle>
        </DialogHeader>

        {/* Highlighted Quick Strategy Presets & 1-Click Full Suite Seeder */}
        <div className="rounded-xl border border-blue-500/30 bg-[#161b26] p-3.5 space-y-3">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-blue-400">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Hızlı Şablonlar (Tek Tıkla Doldur):</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset('rsi_breakout_4h')}
              className="text-[11px] font-mono bg-blue-600/15 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-md px-2.5 py-1 transition-colors cursor-pointer"
            >
              ⚡ 4S RSI Mavi Çizgi Kırılımı (Ana Filtre)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('ma_cross_15m')}
              className="text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md px-2.5 py-1 transition-colors cursor-pointer"
            >
              📈 15Dk MA(9) &gt; MA(14)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('ma_cross_5m')}
              className="text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md px-2.5 py-1 transition-colors cursor-pointer"
            >
              🚀 5Dk MA(9) x MA(21)
            </button>
          </div>

          {/* 1-Click Full 8-Rule Consultant Suite Button */}
          <div className="pt-2.5 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              RSI + Stoch + MACD + 6 Adet MA (9-200) + Bollinger (22,2):
            </span>
            <button
              type="button"
              disabled={loading}
              onClick={handleSeedConsultantSuite}
              className="text-[11px] font-mono font-semibold bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded-lg px-3 py-1.5 transition-all cursor-pointer shrink-0"
            >
              {loading ? 'Yükleniyor...' : '📦 Tüm Paketi Tek Tıkla Yükle (8 Kural)'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Rule Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-300">Kural Adı / Açıklaması</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: 4S RSI Düşen Trend Kırılımı"
              className="border-slate-700/80 bg-[#161b26] text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-500"
              required
            />
          </div>

          {/* Timeframe & Funnel Role (Primary Filter vs Score Rule) */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <Label className="text-xs font-medium text-slate-300">Zaman Dilimi (Mum Periyodu)</Label>
              <Select value={timeframe} onValueChange={(val) => val && setTimeframe(val)}>
                <SelectTrigger>
                  <SelectValue>{getTimeframeLabel(timeframe)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIMEFRAMES.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-6 space-y-1.5">
              <Label className="text-xs font-medium text-slate-300">Huni Rolü (Öncelik)</Label>
              <button
                type="button"
                onClick={() => setIsPrimaryFilter(!isPrimaryFilter)}
                className={`w-full h-9 px-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${
                  isPrimaryFilter
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                    : 'bg-[#161b26] border-slate-700/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="flex items-center space-x-1.5 truncate">
                  <Filter className="h-3.5 w-3.5 shrink-0" />
                  <span>{isPrimaryFilter ? 'Ana Filtre (Hisse Daraltıcı)' : 'Ek Skor Kuralı'}</span>
                </span>
                <span className={`h-2 w-2 rounded-full ${isPrimaryFilter ? 'bg-amber-400' : 'bg-slate-600'}`} />
              </button>
            </div>
          </div>

          {/* 1. Indicator Selection */}
          <div className="grid grid-cols-12 gap-4">
            <div className={`${showInd1Period ? 'col-span-8' : 'col-span-12'} space-y-1.5`}>
              <Label className="text-xs font-medium text-slate-300">1. İndikatör</Label>
              <Select value={indicator1} onValueChange={(val) => val && setIndicator1(val)}>
                <SelectTrigger>
                  <SelectValue>{getIndicatorLabel(indicator1)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {INDICATORS.filter((i) => i.value !== 'RSI_TRENDLINE').map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showInd1Period && (
              <div className="col-span-4 space-y-1.5">
                <Label className="text-xs font-medium text-slate-300">Mum Periyodu</Label>
                <Input
                  type="number"
                  value={ind1Length}
                  onChange={(e) => setInd1Length(e.target.value)}
                  placeholder="9, 14, 21..."
                  className="border-slate-700/80 bg-[#161b26] text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* Condition & Target Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
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

            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-300">Sabit Eşik Değer</Label>
              <Input
                type="number"
                step="any"
                value={staticValue}
                onChange={(e) => setStaticValue(e.target.value)}
                placeholder="Örn: RSI için 30 veya 50"
                className="border-slate-700/80 bg-[#161b26] text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-500"
                required
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-4">
                <div className={`${showInd2Period ? 'col-span-8' : 'col-span-12'} space-y-1.5`}>
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
                {showInd2Period && (
                  <div className="col-span-4 space-y-1.5">
                    <Label className="text-xs font-medium text-slate-300">Mum Periyodu</Label>
                    <Input
                      type="number"
                      value={ind2Length}
                      onChange={(e) => setInd2Length(e.target.value)}
                      placeholder="14, 21, 50..."
                      className="border-slate-700/80 bg-[#161b26] text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Extra mathematical parameters when RSI Blue Trendline is selected */}
              {indicator2 === 'RSI_TRENDLINE' && (
                <div className="rounded-lg border border-blue-500/25 bg-blue-950/20 p-3 space-y-3">
                  <div className="text-[11px] text-blue-300 font-medium">
                    📐 Mavi Çizgi (RSI Düşen Trend) Matematiksel Parametreleri
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-400">Tepe Arama (Mum)</Label>
                      <Input
                        type="number"
                        value={trendLookback}
                        onChange={(e) => setTrendLookback(e.target.value)}
                        placeholder="60"
                        className="h-8 text-xs border-slate-700 bg-[#161b26] text-slate-100 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-400">Min. Tepe RSI</Label>
                      <Input
                        type="number"
                        step="any"
                        value={trendMinPeak}
                        onChange={(e) => setTrendMinPeak(e.target.value)}
                        placeholder="55"
                        className="h-8 text-xs border-slate-700 bg-[#161b26] text-slate-100 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-400">Sabit Eğim (Opsiyonel)</Label>
                      <Input
                        type="number"
                        step="0.05"
                        value={trendSlope}
                        onChange={(e) => setTrendSlope(e.target.value)}
                        placeholder="Otomatik (-0.35)"
                        className="h-8 text-xs border-slate-700 bg-[#161b26] text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Millimetric Score Impact */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-300">Skor Etkisi (Milimetrik Puan)</Label>
            <Input
              type="number"
              step="0.01"
              value={scoreImpact}
              onChange={(e) => setScoreImpact(e.target.value)}
              placeholder="Örn: 25.00 veya 12.50"
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