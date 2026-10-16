'use client';

import { useState, useEffect } from 'react';
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
import { createRule, updateRule } from '@/services/api';
import { Plus, Sparkles, Flame, Sliders } from 'lucide-react';
import { Rule } from '@/types';

interface CreateRuleDialogProps {
  onRuleCreated?: () => void;
  editingRule?: Rule | null;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  { value: 'indicator', label: 'Başka Bir İndikatör' },
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

export default function CreateRuleDialog({ 
  onRuleCreated, 
  editingRule, 
  isOpen, 
  onOpenChange 
}: CreateRuleDialogProps) {
  
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = isOpen !== undefined;
  const open = isControlled ? isOpen : internalOpen;

  const handleOpenChange = (val: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(val);
    } else {
      setInternalOpen(val);
    }
  };

  const isEditingPrimary = Boolean(editingRule?.is_primary_filter);

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [timeframe, setTimeframe] = useState('4h');

  const [indicator1, setIndicator1] = useState('SMA');
  const [ind1Length, setInd1Length] = useState('9');
  const [condition, setCondition] = useState('>');
  const [targetType, setTargetType] = useState<'static' | 'indicator'>('indicator');
  const [staticValue, setStaticValue] = useState('30');

  const [indicator2, setIndicator2] = useState('SMA');
  const [ind2Length, setInd2Length] = useState('14');

  // Trendline parameters specifically for the primary filter
  const [trendLookback, setTrendLookback] = useState('60');
  const [trendMinPeak, setTrendMinPeak] = useState('55');
  const [trendSlope, setTrendSlope] = useState('');
  const [trendMaxEnd, setTrendMaxEnd] = useState('30');

  const [scoreImpact, setScoreImpact] = useState('10.00');

  useEffect(() => {
    if (editingRule && open) {
      setName(editingRule.name || '');
      setTimeframe(editingRule.timeframe || '4h');
      setIndicator1(editingRule.indicator_1 || 'SMA');
      setInd1Length(editingRule.indicator_1_params?.length?.toString() || '14');
      setCondition(editingRule.condition || '>');
      setTargetType((editingRule.target_type as 'static' | 'indicator') || 'indicator');
      setStaticValue(editingRule.static_value !== null && editingRule.static_value !== undefined ? String(editingRule.static_value) : '30');
      setIndicator2(editingRule.indicator_2 || 'SMA');
      setInd2Length(editingRule.indicator_2_params?.length?.toString() || '14');

      if (editingRule.indicator_2_params) {
        setTrendLookback(editingRule.indicator_2_params.lookback?.toString() || '60');
        setTrendMinPeak(editingRule.indicator_2_params.min_peak?.toString() || '55');
        setTrendMaxEnd(editingRule.indicator_2_params.max_trend_end?.toString() || '30');
        setTrendSlope(editingRule.indicator_2_params.slope !== undefined && editingRule.indicator_2_params.slope !== null ? String(editingRule.indicator_2_params.slope) : '');
      }
      setScoreImpact(editingRule.score_impact !== undefined ? String(editingRule.score_impact) : '10.00');
    } else if (!editingRule && open) {
      setName('');
      setTimeframe('15m');
      setIndicator1('SMA');
      setInd1Length('9');
      setCondition('>');
      setTargetType('indicator');
      setStaticValue('30');
      setIndicator2('SMA');
      setInd2Length('14');
      setTrendLookback('60');
      setTrendMinPeak('55');
      setTrendSlope('');
      setTrendMaxEnd('30');
      setScoreImpact('10.00');
    }
  }, [editingRule, open]);

  // Scoring Presets for new rules
  const applyPreset = (preset: 'ma_cross_15m' | 'ma_cross_5m' | 'macd_4h' | 'bollinger_4h') => {
    if (preset === 'ma_cross_15m') {
      setName('Kısa Vade: MA(9) > MA(14) Trendi');
      setTimeframe('15m');
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
      setIndicator1('SMA');
      setInd1Length('9');
      setCondition('crosses_above');
      setTargetType('indicator');
      setIndicator2('SMA');
      setInd2Length('21');
      setScoreImpact('10.00');
    } else if (preset === 'macd_4h') {
      setName('MACD (12,26,9) Pozitif Momentum');
      setTimeframe('4h');
      setIndicator1('MACD_LINE');
      setCondition('>');
      setTargetType('indicator');
      setIndicator2('MACD_SIGNAL');
      setScoreImpact('10.00');
    } else if (preset === 'bollinger_4h') {
      setName('Bollinger (22, 2) Orta Bant Üzeri');
      setTimeframe('4h');
      setIndicator1('PRICE');
      setCondition('>');
      setTargetType('indicator');
      setIndicator2('BOLLINGER_MIDDLE');
      setScoreImpact('10.00');
    }
  };

  const buildParams = (ind: string, lengthVal: string) => {
    const len = parseInt(lengthVal, 10) || 14;
    if (ind === 'SMA' || ind === 'EMA' || ind === 'RSI') return { length: len };
    if (ind === 'RSI_TRENDLINE') {
      const p: Record<string, any> = {
        length: 14,
        lookback: parseInt(trendLookback, 10) || 60,
        min_peak: parseFloat(trendMinPeak) || 55.0,
        max_trend_end: parseFloat(trendMaxEnd) || 30.0,
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
    
    // Primary filter keeps its unique structure
    const payload = isEditingPrimary ? {
      name,
      description: name,
      timeframe: '4h',
      is_primary_filter: true,
      indicator_1: 'RSI',
      indicator_1_params: { length: 14 },
      condition: '>',
      target_type: 'indicator',
      indicator_2: 'RSI_TRENDLINE',
      indicator_2_params: buildParams('RSI_TRENDLINE', '14'),
      score_impact: parseFloat(scoreImpact),
      is_active: editingRule ? editingRule.is_active : true,
    } : {
      name,
      description: name,
      timeframe,
      is_primary_filter: false, // All created rules are scoring rules
      indicator_1: indicator1,
      indicator_1_params: buildParams(indicator1, ind1Length),
      condition,
      target_type: targetType,
      static_value: targetType === 'static' ? parseFloat(staticValue) : null,
      indicator_2: targetType === 'indicator' ? indicator2 : null,
      indicator_2_params: targetType === 'indicator' ? buildParams(indicator2, ind2Length) : null,
      score_impact: parseFloat(scoreImpact),
      is_active: editingRule ? editingRule.is_active : true,
    };

    try {
      if (editingRule && editingRule.id) {
        await updateRule(editingRule.id, payload);
      } else {
        await createRule(payload as any);
      }

      handleOpenChange(false);
      if (onRuleCreated) onRuleCreated();
      if (!editingRule) setName('');
    } catch (error) {
      console.error('Failed to save rule:', error);
    } finally {
      setLoading(false);
    }
  };

  const showInd1Period = indicator1 === 'SMA' || indicator1 === 'EMA' || indicator1 === 'RSI';
  const showInd2Period = indicator2 === 'SMA' || indicator2 === 'EMA' || indicator2 === 'RSI';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger>
          <span className="inline-flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all duration-200 hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer">
            <Plus className="h-4 w-4" />
            <span>Yeni Puanlama Kuralı Ekle</span>
          </span>
        </DialogTrigger>
      )}
      <DialogContent className="border border-slate-700/80 bg-[#12161f] text-slate-100 sm:max-w-xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-100 flex items-center space-x-2">
            {isEditingPrimary ? (
              <>
                <Flame className="h-5 w-5 text-amber-400" />
                <span>Ana Filtre Parametrelerini Düzenle</span>
              </>
            ) : editingRule ? (
              <>
                <Sliders className="h-5 w-5 text-blue-400" />
                <span>Puanlama Kuralını Düzenle</span>
              </>
            ) : (
              <>
                <Sliders className="h-5 w-5 text-blue-400" />
                <span>Yeni Puanlama Kuralı Tanımla</span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Quick Presets for New Scoring Rules */}
        {!editingRule && (
          <div className="rounded-xl border border-blue-500/30 bg-[#161b26] p-3.5 space-y-2.5">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-blue-400">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Hızlı Puanlama Şablonları:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset('ma_cross_15m')}
                className="text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md px-2.5 py-1 transition-colors cursor-pointer"
              >
                📈 15Dk MA(9) &gt; MA(14) (+10 Puan)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('ma_cross_5m')}
                className="text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md px-2.5 py-1 transition-colors cursor-pointer"
              >
                🚀 5Dk MA(9) x MA(21) (+10 Puan)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('macd_4h')}
                className="text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md px-2.5 py-1 transition-colors cursor-pointer"
              >
                📊 4S MACD Pozitif Momentum (+10 Puan)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('bollinger_4h')}
                className="text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md px-2.5 py-1 transition-colors cursor-pointer"
              >
                🌊 4S Bollinger Bant Gücü (+10 Puan)
              </button>
            </div>
          </div>
        )}

        {/* PRIMARY FILTER SPECIALIZED EDIT FORM */}
        {isEditingPrimary ? (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 leading-relaxed">
              Bu kural sistemin <strong>ana filtresidir</strong>. Hisseler bu kuralı geçemezse kişisel olarak tercih edilmediği sürece sistem kural bildirimi vermez.
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-300">Kural Tanımı</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-slate-700/80 bg-[#161b26] text-slate-100 font-medium"
                required
              />
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-[#161b26] p-4 space-y-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
                <span>📐 4S RSI (14) Düşen Trend Matematiksel Parametreleri</span>
                <span className="text-[10px] font-mono text-slate-400">4 Saatlik Periyot</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-400 font-sans">Lookback (Mum)</Label>
                  <Input 
                    type="number" 
                    value={trendLookback} 
                    onChange={(e) => setTrendLookback(e.target.value)} 
                    className="h-8 text-xs border-slate-700 bg-[#12161f] text-slate-100" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-400 font-sans">Min. Tepe RSI</Label>
                  <Input 
                    type="number" 
                    step="any" 
                    value={trendMinPeak} 
                    onChange={(e) => setTrendMinPeak(e.target.value)} 
                    className="h-8 text-xs border-slate-700 bg-[#12161f] text-slate-100" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-amber-300 font-semibold font-sans">Maks. Dip RSI (0 - X)</Label>
                  <Input 
                    type="number" 
                    step="any" 
                    value={trendMaxEnd} 
                    onChange={(e) => setTrendMaxEnd(e.target.value)} 
                    className="h-8 text-xs border-amber-500/50 bg-[#12161f] text-amber-300 font-bold" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-400 font-sans">Sabit Eğim</Label>
                  <Input 
                    type="number" 
                    step="0.05" 
                    value={trendSlope} 
                    onChange={(e) => setTrendSlope(e.target.value)} 
                    placeholder="Oto" 
                    className="h-8 text-xs border-slate-700 bg-[#12161f] text-slate-100" 
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-300">Skor Etkisi Puanı</Label>
              <Input
                type="number"
                step="0.01"
                value={scoreImpact}
                onChange={(e) => setScoreImpact(e.target.value)}
                className="border-slate-700/80 bg-[#161b26] text-slate-100 font-mono"
                required
              />
            </div>

            <div className="pt-3 flex justify-end space-x-3 border-t border-slate-800/80">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              >
                İptal
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
              >
                {loading ? 'Kaydediliyor...' : 'Ana Filtre Parametrelerini Kaydet'}
              </Button>
            </div>
          </form>
        ) : (
          /* REGULAR SCORING RULE FORM */
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-300">Kural Adı / Açıklaması</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: 15Dk MA(9) > MA(14)"
                className="border-slate-700/80 bg-[#161b26] text-slate-100 transition-colors hover:border-slate-600 focus:border-blue-500"
                required
              />
            </div>

            <div className="space-y-1.5">
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

            <div className="grid grid-cols-12 gap-4">
              <div className={`${showInd1Period ? 'col-span-8' : 'col-span-12'} space-y-1.5`}>
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
              {showInd1Period && (
                <div className="col-span-4 space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">Mum Periyodu</Label>
                  <Input
                    type="number"
                    value={ind1Length}
                    onChange={(e) => setInd1Length(e.target.value)}
                    className="border-slate-700/80 bg-[#161b26] text-slate-100"
                  />
                </div>
              )}
            </div>

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

            {targetType === 'static' ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-300">Sabit Eşik Değer</Label>
                <Input
                  type="number"
                  step="any"
                  value={staticValue}
                  onChange={(e) => setStaticValue(e.target.value)}
                  className="border-slate-700/80 bg-[#161b26] text-slate-100"
                  required
                />
              </div>
            ) : (
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
                      className="border-slate-700/80 bg-[#161b26] text-slate-100"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-300">Skor Etkisi Puanı</Label>
              <Input
                type="number"
                step="0.01"
                value={scoreImpact}
                onChange={(e) => setScoreImpact(e.target.value)}
                className="border-slate-700/80 bg-[#161b26] text-slate-100 font-mono"
                required
              />
            </div>

            <div className="pt-3 flex justify-end space-x-3 border-t border-slate-800/80">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              >
                İptal
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              >
                {loading ? 'Kaydediliyor...' : editingRule ? 'Değişiklikleri Kaydet' : 'Puanlama Kuralını Kaydet'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}