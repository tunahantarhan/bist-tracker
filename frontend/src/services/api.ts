import { Rule } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function fetchRules(): Promise<Rule[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/rules`, { cache: 'no-store' });
    if (!res.ok) throw new Error('API yanıt vermedi');
    return await res.json();
  } catch (error) {
    console.warn('Backend henüz aktif değil, örnek veri yükleniyor:', error);
    // Backend ayakta değilken dashboard'un canlı görünmesini sağlayan mock veri
    return [
      {
        id: 1,
        symbol: 'THYAO',
        rule_type: 'RSI',
        operator: '<',
        threshold: 30,
        parameters: { period: 14 },
        is_active: true,
        last_triggered_at: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        symbol: 'GARAN',
        rule_type: 'PRICE',
        operator: '>=',
        threshold: 125.5,
        parameters: {},
        is_active: true,
        last_triggered_at: null,
        created_at: new Date().toISOString(),
      },
    ];
  }
}

export async function createRule(data: Omit<Rule, 'id' | 'created_at' | 'last_triggered_at'>): Promise<Rule> {
  const res = await fetch(`${API_BASE_URL}/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Kural oluşturulamadı');
  return res.json();
}