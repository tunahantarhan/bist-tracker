import { Rule } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
export const API_URL = API_BASE_URL;

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

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processRefreshQueue = (error: Error | null, token: string | null = null) => {
  refreshQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  refreshQueue = [];
};

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let res: Response;

  try {
    res = await fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    throw new Error('Sunucuya bağlanılamadı. Lütfen biraz bekleyip tekrar deneyin.');
  }

  // Handle 401 with silent token refresh
  if (res.status === 401 && typeof window !== 'undefined') {
    const refreshToken = localStorage.getItem('refresh_token');

    // If no refresh token exists, redirect to login
    if (!refreshToken) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      if (!window.location.pathname.startsWith('/giris')) {
        window.location.href = '/giris';
      }
      throw new Error('Oturum süreniz doldu.');
    }

    // Queue concurrent requests while a refresh is in progress
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      })
        .then(() => fetchWithAuth(url, options))
        .catch((err) => Promise.reject(err));
    }

    isRefreshing = true;

    try {
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Refresh token expired');
      }

      const refreshData = await refreshResponse.json();
      localStorage.setItem('access_token', refreshData.access_token);
      if (refreshData.refresh_token) {
        localStorage.setItem('refresh_token', refreshData.refresh_token);
      }

      processRefreshQueue(null, refreshData.access_token);

      // Retry the original request with the new access token
      return await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshData.access_token}`,
        },
      });
    } catch (refreshErr) {
      processRefreshQueue(refreshErr as Error, null);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      if (!window.location.pathname.startsWith('/giris')) {
        window.location.href = '/giris';
      }
      throw new Error('Oturum süreniz doldu.');
    } finally {
      isRefreshing = false;
    }
  }

  return res;
}

export interface RuleBreakdownItem {
  id: number;
  name: string;
  timeframe?: string;
  is_primary_filter?: boolean;
  condition_text: string;
  is_met: boolean;
  score_impact: number;
  earned_score: number;
  current_value?: number;
  target_value?: number;
  slope?: number | null;
  peak_rsi?: number | null;
  error?: string;
  condition?: string;
}

export interface IndicatorOverlay {
  name: string;
  color: string;
  data: {
    time: string | number;
    value: number;
  }[];
}

export interface RsiPaneData {
  rsi: { time: string | number; value: number }[];
  trendline: { time: string | number; value: number }[];
  slope?: number | null;
  peak_rsi?: number | null;
}

export interface MarketData {
  symbol: string;
  interval?: string;
  period?: string;
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
  primary_filter_passed?: boolean;
  has_primary_filter?: boolean;
  rules_breakdown?: RuleBreakdownItem[];
  indicators?: IndicatorOverlay[];
  rsi_pane?: RsiPaneData;
}

export interface MacroItem {
  symbol: string;
  label: string;
  current_price: number;
  change_pct: number;
  prefix: string;
  suffix: string;
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

// Rule update (for both editing and active/inactive toggle)
export async function updateRule(id: number, ruleData: any): Promise<Rule> {
  const res = await fetchWithAuth(`${API_BASE_URL}/rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(ruleData),
  });
  if (!res.ok) throw new Error('Kural güncellenemedi');
  return await res.json();
}

export async function deleteRule(id: number): Promise<any> {
  const res = await fetchWithAuth(`${API_BASE_URL}/rules/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Kural silinemedi');
  return await res.json();
}

export async function fetchMarketData(
  symbol: string,
  interval: string = '4h',
  period: string = '6mo',
  signal?: AbortSignal
): Promise<MarketData> {
  const params = new URLSearchParams({ interval, period });
  const res = await fetchWithAuth(
    `${API_BASE_URL}/market/${symbol}?${params.toString()}`,
    { cache: 'no-store', signal }
  );
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

export interface StockOverviewItem {
  symbol: string;
  name: string;
  current_price: number;
  change_pct: number;
  score: number;
  primary_filter_passed: boolean;
  has_primary_filter: boolean;
}

export interface MarketOverviewResponse {
  items: StockOverviewItem[];
  rsi_passed: StockOverviewItem[];
  top_scored: StockOverviewItem[];
  top_priced: StockOverviewItem[];
}

export async function fetchMarketOverview(): Promise<MarketOverviewResponse> {
  const res = await fetchWithAuth(`${API_BASE_URL}/market/overview`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Piyasa özeti alınamadı');
  return await res.json();
}

export async function fetchActiveUniverse(): Promise<string[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/market/universe/active`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Aktif hisse evreni alınamadı');
  return await res.json();
}

export const updateActiveUniverse = async (symbols: string[]) => {
  const res = await fetchWithAuth(`${API_BASE_URL}/market/universe/update`, {
    method: 'POST',
    body: JSON.stringify(symbols),
  });
  if (!res.ok) throw new Error('Evren güncellenirken bir hata oluştu');
  return await res.json();
};

export interface AppNotification {
  id: number;
  user_id: number;
  rule_id: number | null;
  symbol: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

export async function fetchNotifications(limit: number = 20): Promise<AppNotification[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/notifications?limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Bildirimler alınamadı');
  return await res.json();
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await fetchWithAuth(`${API_BASE_URL}/notifications/unread-count`, { cache: 'no-store' });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unread_count ?? 0;
}

export async function markNotificationAsRead(id: number): Promise<void> {
  await fetchWithAuth(`${API_BASE_URL}/notifications/${id}/read`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await fetchWithAuth(`${API_BASE_URL}/notifications/read-all`, {
    method: 'PATCH',
  });
}

export async function deleteNotification(id: number): Promise<void> {
  await fetchWithAuth(`${API_BASE_URL}/notifications/${id}`, {
    method: 'DELETE',
  });
}

export async function clearAllNotifications(): Promise<void> {
  await fetchWithAuth(`${API_BASE_URL}/notifications/clear-all`, {
    method: 'DELETE',
  });
}

export async function fetchMacroData(): Promise<MacroItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/market/macro`, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('Macro market data fetch warning:', err);
    return [];
  }
}