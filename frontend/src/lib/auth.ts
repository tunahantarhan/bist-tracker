// Client-side session storage helpers. Tokens live in localStorage (see services/api.ts for refresh).

const SESSION_KEYS = ['access_token', 'refresh_token', 'is_admin', 'admin_session', 'user_slug'] as const;

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  first_name?: string | null;
  last_name?: string | null;
  is_admin?: boolean;
  /** True only for sessions that passed the admin 2FA step */
  admin_session?: boolean;
}

const isBrowser = () => typeof window !== 'undefined';

export function getAccessToken(): string | null {
  return isBrowser() ? localStorage.getItem('access_token') : null;
}

export function getRefreshToken(): string | null {
  return isBrowser() ? localStorage.getItem('refresh_token') : null;
}

/** The account has the admin role (it may still need the admin sign-in for the panel). */
export function isAdminAccount(): boolean {
  return isBrowser() && localStorage.getItem('is_admin') === 'true';
}

/** The current session is admin-scoped (signed in through /admin/giris with 2FA). */
export function isAdminSession(): boolean {
  return isBrowser() && localStorage.getItem('admin_session') === 'true';
}

/** Only same-origin relative paths are accepted as post-login redirects. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

export function getUserSlug(): string {
  return (isBrowser() && localStorage.getItem('user_slug')) || 'profil';
}

function toSlugPart(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds the profile URL slug ("ad-soyad") and stores it for the header menu. */
export function storeUserName(firstName: string, lastName: string): string {
  const slug = `${toSlugPart(firstName)}-${toSlugPart(lastName)}`;
  if (isBrowser()) localStorage.setItem('user_slug', slug);
  return slug;
}

export function saveSession(data: LoginResponse): void {
  localStorage.setItem('access_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('is_admin', data.is_admin ? 'true' : 'false');
  localStorage.setItem('admin_session', data.admin_session ? 'true' : 'false');
  if (data.first_name && data.last_name) storeUserName(data.first_name, data.last_name);
}

export function clearSession(): void {
  if (!isBrowser()) return;
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

/** Returns true when the JWT `exp` claim is in the past (or within `skewSeconds`). */
export function isTokenExpired(token: string, skewSeconds = 0): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const payload = JSON.parse(window.atob(base64));
    if (!payload.exp) return false;
    return Date.now() >= (payload.exp - skewSeconds) * 1000;
  } catch {
    // Never expire a session just because decoding failed; the backend 401 is authoritative
    return false;
  }
}
