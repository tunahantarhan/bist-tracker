import { Rule, RuleParams } from '@/types';
import { clearSession, getAccessToken, getRefreshToken, LoginResponse, saveSession } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
export const API_URL = API_BASE_URL;

// ---------------------------------------------------------------------------
// Core HTTP + silent token refresh
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const buildHeaders = (extra?: HeadersInit, tokenOverride?: string | null): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenOverride ?? getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return { ...headers, ...(extra as Record<string, string> | undefined) };
};

let refreshPromise: Promise<string | null> | null = null;

/**
 * Exchanges the refresh token for a new token pair. Concurrent callers share a single
 * in-flight request. Resolves to the new access token, or null when the session is over.
 */
export function refreshSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;
      const data: LoginResponse = await res.json();
      saveSession(data);
      return data.access_token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function endSession(): never {
  clearSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('session-expired'));
  }
  throw new ApiError('Oturum süreniz doldu.', 401);
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const doFetch = (token?: string | null) =>
    fetch(url, { ...options, headers: buildHeaders(options.headers, token) });

  let res: Response;
  try {
    res = await doFetch();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new ApiError('Sunucuya bağlanılamadı. Lütfen biraz bekleyip tekrar deneyin.', 0);
  }

  if (res.status !== 401 || typeof window === 'undefined' || !getAccessToken()) {
    return res;
  }

  const newToken = await refreshSession();
  if (!newToken) endSession();
  return doFetch(newToken);
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (Array.isArray(data.detail)) return data.detail.map((d: { msg?: string }) => d.msg).join(', ');
    return data.detail || fallback;
  } catch {
    return fallback;
  }
}

async function requestJson<T>(path: string, options: RequestInit = {}, errorMessage = 'İstek başarısız oldu'): Promise<T> {
  const res = await fetchWithAuth(`${API_BASE_URL}${path}`, { cache: 'no-store', ...options });
  if (!res.ok) throw new ApiError(await readError(res, errorMessage), res.status);
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleBreakdownItem {
  id: number;
  name: string;
  timeframe?: string;
  is_primary_filter?: boolean;
  condition_text: string;
  condition?: string;
  target_type?: 'static' | 'indicator' | string;
  indicator_1?: string;
  indicator_1_params?: RuleParams | null;
  indicator_2?: string | null;
  indicator_2_params?: RuleParams | null;
  static_value?: number | null;
  is_met: boolean;
  score_impact: number;
  earned_score: number;
  current_value?: number | null;
  target_value?: number | null;
  slope?: number | null;
  peak_rsi?: number | null;
  peak_qualifies?: boolean | null;
  error?: string;
}

export interface IndicatorOverlay {
  name: string;
  color: string;
  data: { time: string | number; value: number }[];
}

export interface RsiPaneData {
  rsi: { time: string | number; value: number }[];
  trendline: { time: string | number; value: number }[];
  slope?: number | null;
  peak_rsi?: number | null;
}

export interface Candle {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PeriodicReturnItem {
  label: string;
  period: string;
  change_pct: number;
}

export interface StockFundamentals {
  market_cap?: number | null;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  free_float_pct?: number | null;
  year_high?: number | null;
  year_low?: number | null;
}

export interface MarketData {
  symbol: string;
  name?: string;
  interval?: string;
  period?: string | null;
  current_price: number;
  change_pct: number;
  candles: Candle[];
  score?: number;
  primary_filter_passed?: boolean;
  primary_filter_timeframe?: string;
  has_primary_filter?: boolean;
  rules_breakdown?: RuleBreakdownItem[];
  indicators?: IndicatorOverlay[];
  rsi_pane?: RsiPaneData;
  periodic_returns?: PeriodicReturnItem[];
  fundamentals?: StockFundamentals;
}

export interface TickerItem {
  symbol: string;
  current_price: number;
  change_pct: number;
}

export interface MacroItem {
  symbol: string;
  label: string;
  current_price: number;
  change_pct: number;
  prefix: string;
  suffix: string;
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
  primary_filter_timeframe?: string;
}

export interface AppNotification {
  id: number;
  user_id: number;
  rule_id: number | null;
  symbol: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface CustomAlert {
  id: number;
  symbol: string;
  rule_id: number | null;
  timeframe: string;
  is_active: boolean;
  created_at: string;
  last_triggered_at?: string | null;
}

export interface UserProfile {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  tier: string;
  is_active: boolean;
  is_admin: boolean;
  terms_accepted_at: string;
}

export interface AdminStats {
  total_users: number;
  active_stocks: number;
  active_rules: number;
}

export interface AdminUserItem {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  tier: 'FREE' | 'STANDARD' | 'PREMIUM';
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function postPublic<T>(path: string, body: unknown, errorMessage: string): Promise<T> {
  // Auth endpoints never go through the refresh flow (a wrong password is also a 401)
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sunucuya bağlanılamadı. Lütfen biraz bekleyip tekrar deneyin.', 0);
  }
  if (!res.ok) throw new ApiError(await readError(res, errorMessage), res.status);
  return res.json();
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return postPublic('/auth/login', { email, password }, 'Giriş başarısız oldu.');
}

export async function register(payload: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  terms_accepted: boolean;
}): Promise<UserProfile> {
  return postPublic('/auth/register', payload, 'Kayıt başarısız oldu.');
}

export async function fetchMe(): Promise<UserProfile> {
  return requestJson('/auth/me', {}, 'Profil alınamadı');
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function fetchRules(): Promise<Rule[]> {
  return requestJson('/rules', {}, 'Kurallar alınamadı');
}

export async function createRule(
  data: Omit<Rule, 'id' | 'created_at' | 'updated_at'>
): Promise<Rule> {
  return requestJson('/rules', { method: 'POST', body: JSON.stringify(data) }, 'Kural eklenemedi');
}

// Used for both editing and the active/passive toggle
export async function updateRule(id: number, ruleData: Partial<Rule>): Promise<Rule> {
  return requestJson(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify(ruleData) }, 'Kural güncellenemedi');
}

export async function deleteRule(id: number): Promise<{ detail: string }> {
  return requestJson(`/rules/${id}`, { method: 'DELETE' }, 'Kural silinemedi');
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export async function fetchMarketData(
  symbol: string,
  interval: string = '4h',
  period: string = '6mo',
  signal?: AbortSignal
): Promise<MarketData> {
  const params = new URLSearchParams({ interval, period });
  return requestJson(`/market/${encodeURIComponent(symbol)}?${params.toString()}`, { signal }, 'Piyasa verisi alınamadı');
}

export async function fetchMarketOverview(): Promise<MarketOverviewResponse> {
  return requestJson('/market/overview', {}, 'Piyasa özeti alınamadı');
}

export async function fetchTicker(): Promise<TickerItem[]> {
  try {
    return await requestJson<TickerItem[]>('/market/ticker');
  } catch (err) {
    console.warn('Ticker fetch warning:', err);
    return [];
  }
}

export async function fetchMacroData(): Promise<MacroItem[]> {
  try {
    return await requestJson<MacroItem[]>('/market/macro');
  } catch (err) {
    console.warn('Macro market data fetch warning:', err);
    return [];
  }
}

/** Full selectable catalog (symbol + company name). */
export async function fetchUniverse(): Promise<{ symbol: string; name: string }[]> {
  return requestJson('/market/universe', {}, 'Hisse evreni alınamadı');
}

/** Symbols currently scanned by the engine. */
export async function fetchActiveUniverse(): Promise<string[]> {
  return requestJson('/market/universe/active', {}, 'Aktif hisse evreni alınamadı');
}

export async function updateActiveUniverse(symbols: string[]): Promise<{ status: string; active_count: number }> {
  return requestJson(
    '/market/universe/update',
    { method: 'POST', body: JSON.stringify(symbols) },
    'Evren güncellenirken bir hata oluştu'
  );
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export async function fetchWatchlist(): Promise<{ id: number; symbol: string }[]> {
  return requestJson('/watchlist/', {}, 'Takip listesi alınamadı');
}

export async function addToWatchlist(symbol: string) {
  return requestJson(`/watchlist/${encodeURIComponent(symbol)}`, { method: 'POST' }, 'Hisse eklenemedi');
}

export async function removeFromWatchlist(symbol: string) {
  return requestJson(`/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' }, 'Hisse silinemedi');
}

// ---------------------------------------------------------------------------
// Custom alerts
// ---------------------------------------------------------------------------

export async function fetchAlerts(): Promise<CustomAlert[]> {
  return requestJson('/alerts', {}, 'Alarmlar alınamadı');
}

export async function createAlert(payload: { symbol: string; rule_id: number | null; timeframe: string }): Promise<CustomAlert> {
  return requestJson('/alerts', { method: 'POST', body: JSON.stringify(payload) }, 'Alarm eklenirken bir hata oluştu.');
}

export async function deleteAlert(id: number): Promise<void> {
  await requestJson(`/alerts/${id}`, { method: 'DELETE' }, 'Alarm silinirken bir hata oluştu.');
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function fetchNotifications(limit: number = 20): Promise<AppNotification[]> {
  return requestJson(`/notifications?limit=${limit}`, {}, 'Bildirimler alınamadı');
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  try {
    const data = await requestJson<{ unread_count: number }>('/notifications/unread-count');
    return data.unread_count ?? 0;
  } catch {
    return 0;
  }
}

export async function markNotificationAsRead(id: number): Promise<void> {
  await requestJson(`/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await requestJson('/notifications/read-all', { method: 'PATCH' });
}

export async function deleteNotification(id: number): Promise<void> {
  await requestJson(`/notifications/${id}`, { method: 'DELETE' });
}

export async function clearAllNotifications(): Promise<void> {
  await requestJson('/notifications/clear-all', { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function fetchAdminStats(): Promise<AdminStats> {
  return requestJson('/admin/stats', {}, 'İstatistikler alınamadı');
}

export async function fetchAdminUsers(): Promise<AdminUserItem[]> {
  return requestJson('/admin/users', {}, 'Kullanıcılar alınamadı');
}

export async function updateAdminUser(
  userId: number,
  data: { tier?: string; is_active?: boolean; is_admin?: boolean }
): Promise<{ status: string; user: AdminUserItem }> {
  return requestJson(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }, 'Kullanıcı güncellenemedi');
}
