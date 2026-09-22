'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createRule } from '@/services/api';

export default function CreateRuleDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Form State Tanımları
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState<'RSI' | 'SMA' | 'PRICE'>('RSI');
  const [operator, setOperator] = useState<'<' | '>' | '<=' | '>='>('<');
  const [threshold, setThreshold] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createRule({
        symbol: symbol.toUpperCase(),
        rule_type: type,
        operator: operator,
        threshold: Number(threshold),
        parameters: type === 'RSI' ? { period: 14 } : type === 'SMA' ? { period: 20 } : {},
        is_active: true,
      });
      setOpen(false);
      setSymbol('');
      setThreshold('');
      router.refresh();
      window.location.reload();
    } catch (error) {
      console.error('Kural eklenirken hata oluştu:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        Yeni Kural Ekle
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Yeni Alarm Kuralı</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          {/* Sembol */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="symbol" className="text-right">Sembol</Label>
            <Input
              id="symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Örn: THYAO"
              required
              className="col-span-3 font-mono uppercase"
            />
          </div>

          {/* Tip (Select) */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">Tip</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as 'RSI' | 'SMA' | 'PRICE')}
              className="col-span-3 flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
            >
              <option value="RSI">RSI (Göreceli Güç Endeksi)</option>
              <option value="SMA">SMA (Basit Hareketli Ortalama)</option>
              <option value="PRICE">Fiyat Eşiği (Price)</option>
            </select>
          </div>

          {/* Operatör (Select) */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="operator" className="text-right">Operatör</Label>
            <select
              id="operator"
              value={operator}
              onChange={(e) => setOperator(e.target.value as '<' | '>' | '<=' | '>=')}
              className="col-span-3 flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 font-mono"
            >
              <option value="<">&lt; (Küçüktür)</option>
              <option value="<=">&lt;= (Küçük veya Eşit)</option>
              <option value=">">&gt; (Büyüktür)</option>
              <option value=">=">&gt;= (Büyük veya Eşit)</option>
            </select>
          </div>

          {/* Eşik Değeri */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="threshold" className="text-right">Eşik</Label>
            <Input
              id="threshold"
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="Örn: 30 veya 125.50"
              required
              className="col-span-3"
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}