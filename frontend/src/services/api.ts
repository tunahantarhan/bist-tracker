import { Rule } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

// Helper function to safely retrieve the token from localStorage
const getAuthHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
};

// Centralized fetch wrapper that intercepts 401 Unauthorized responses globally
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    // Trigger global session expired modal if we are not already on the auth page
    if (!window.location.pathname.startsWith('/auth')) {
      window.dispatchEvent(new CustomEvent('session-expired'));
    }
    throw new Error('Oturum süreniz doldu.');
  }

  return res;
}

export interface RuleBreakdownItem {
  id: number;
  name: string;
  condition_text: string;
  is_met: boolean;
  score_impact: number;
  earned_score: number;
  current_value?: number;
  target_value?: number;
  error?: string;
}

export interface IndicatorOverlay {
  name: string;
  color: string;
  data: {
    time: string | number;
    value: number;
  }[];
}

export interface MarketData {
  symbol: string;
  current_price: number;
  change_pct: number;
  candles: {
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
  }[];
  score?: number;
  rules_breakdown?: RuleBreakdownItem[];
  indicators?: IndicatorOverlay[];
}

export async function fetchRules(): Promise<Rule[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/rules`, { cache: 'no-store' });
  if (!res.ok) throw new Error('API yanıt vermedi');
  return await res.json();
}

export async function createRule(
  data: Omit<Rule, 'id' | 'created_at' | 'last_triggered_at' | 'last_state' | 'updated_at'>
): Promise<Rule> {
  const res = await fetchWithAuth(`${API_BASE_URL}/rules`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Kural eklenemedi');
  return await res.json();
}

export async function fetchMarketData(symbol: string): Promise<MarketData> {
  const res = await fetchWithAuth(`${API_BASE_URL}/market/${symbol}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Piyasa verisi alınamadı');
  return await res.json();
}

export async function fetchWatchlist(): Promise<{ id: number; symbol: string }[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/watchlist/`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Takip listesi alınamadı');
  return await res.json();
}

export async function addToWatchlist(symbol: string) {
  const res = await fetchWithAuth(`${API_BASE_URL}/watchlist/${symbol}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Hisse eklenemedi');
  }
  return await res.json();
}

export async function removeFromWatchlist(symbol: string) {
  const res = await fetchWithAuth(`${API_BASE_URL}/watchlist/${symbol}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Hisse silinemedi');
  return await res.json();
}

export async function fetchUniverse(): Promise<{ symbol: string; name: string }[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/market/universe`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Hisse evreni alınamadı');
  return await res.json();
}