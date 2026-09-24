import { Rule } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export interface MarketData {
  symbol: string;
  current_price: number;
  change_pct: number;
  candles: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }[];
}

export async function fetchRules(): Promise<Rule[]> {
  const res = await fetch(`${API_BASE_URL}/rules`, { cache: 'no-store' });
  if (!res.ok) throw new Error('API yanıt vermedi');
  return await res.json();
}

export async function createRule(
  data: Omit<Rule, 'id' | 'created_at' | 'last_triggered_at' | 'last_state' | 'updated_at'>
): Promise<Rule> {
  const res = await fetch(`${API_BASE_URL}/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Kural eklenemedi');
  return await res.json();
}

export async function fetchMarketData(symbol: string): Promise<MarketData> {
  const res = await fetch(`${API_BASE_URL}/market/${symbol}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Piyasa verisi alınamadı');
  return await res.json();
}