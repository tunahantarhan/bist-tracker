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
import { RuleOperator, RuleType } from '@/types';
import { Plus } from 'lucide-react';

interface CreateRuleDialogProps {
  onRuleCreated?: () => void;
}

export default function CreateRuleDialog({ onRuleCreated }: CreateRuleDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState('THYAO');
  const [ruleType, setRuleType] = useState<RuleType>(RuleType.PRICE);
  const [operator, setOperator] = useState<RuleOperator>(RuleOperator.GREATER_THAN);
  const [threshold, setThreshold] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!threshold) return;

  setLoading(true);
  try {
    await createRule({
      symbol: symbol.toUpperCase(),
      rule_type: ruleType,
      operator: operator,
      threshold: parseFloat(threshold),
      parameters: ruleType === RuleType.RSI ? { period: 14 } : {},
      is_active: true,
    });
    setOpen(false);
    setThreshold('');
    if (onRuleCreated) {
      onRuleCreated();
    }
  } catch (error) {
    console.error('Kural eklenirken hata oluştu:', error);
  } finally {
    setLoading(false);
  }
};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <span className="inline-flex items-center space-x-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-[0_0_12px_rgba(37,99,235,0.4)] transition hover:bg-blue-500 cursor-pointer">
          <Plus className="h-4 w-4" />
          <span>Yeni Kural Ekle</span>
        </span>
      </DialogTrigger>
      <DialogContent className="border-slate-800 bg-[#12161f] text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Yeni Takip Kuralı Tanımla</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="symbol" className="text-slate-300">Hisse Sembolü</Label>
            <Input
              id="symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="örn: THYAO, GARAN"
              className="border-slate-700 bg-slate-900 text-slate-100 uppercase"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">İndikatör / Tür</Label>
              <Select value={ruleType} onValueChange={(val) => setRuleType(val as RuleType)}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-[#12161f] text-slate-100">
                  <SelectItem value={RuleType.PRICE}>Fiyat (PRICE)</SelectItem>
                  <SelectItem value={RuleType.RSI}>RSI</SelectItem>
                  <SelectItem value={RuleType.SMA}>SMA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Koşul Operatörü</Label>
              <Select value={operator} onValueChange={(val) => setOperator(val as RuleOperator)}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-[#12161f] text-slate-100">
                  <SelectItem value={RuleOperator.GREATER_THAN}>Büyüktür (&gt;)</SelectItem>
                  <SelectItem value={RuleOperator.LESS_THAN}>Küçüktür (&lt;)</SelectItem>
                  <SelectItem value={RuleOperator.GREATER_OR_EQUAL}>Büyük Eşittir (&gt;=)</SelectItem>
                  <SelectItem value={RuleOperator.LESS_OR_EQUAL}>Küçük Eşittir (&lt;=)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="threshold" className="text-slate-300">Eşik Değer (Threshold)</Label>
            <Input
              id="threshold"
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="örn: 285.50 veya RSI için 30"
              className="border-slate-700 bg-slate-900 text-slate-100"
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
              {loading ? 'Kaydediliyor...' : 'Kuralı Oluştur'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}