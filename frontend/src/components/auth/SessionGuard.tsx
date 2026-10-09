'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Clock, LogIn } from 'lucide-react';

// Safely decode JWT payload with proper Base64URL padding
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    const decoded = window.atob(base64);
    const payload = JSON.parse(decoded);
    if (!payload.exp) return false;

    return Date.now() >= payload.exp * 1000;
  } catch {
    // Do not falsely expire session if client-side decoding fails; rely on backend 401
    return false;
  }
}

export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const [expired, setExpired] = useState(false);
  const hadTokenRef = useRef(false);

  const isPublicRoute = pathname === '/' || pathname?.startsWith('/auth');

  const clearSessionStorage = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_slug');
    localStorage.removeItem('is_admin');
  };

  const triggerExpirationModal = useCallback(() => {
    if (isPublicRoute) return;
    clearSessionStorage();
    setExpired(true);
  }, [isPublicRoute]);

  useEffect(() => {
    if (isPublicRoute) {
      setExpired(false);
      hadTokenRef.current = false;
      return;
    }

    const initialToken = localStorage.getItem('access_token');

    if (!initialToken) {
      if (!expired) {
        router.replace('/auth');
      }
      return;
    }

    if (isTokenExpired(initialToken)) {
      triggerExpirationModal();
      return;
    }

    hadTokenRef.current = true;

    const checkSession = () => {
      const currentToken = localStorage.getItem('access_token');
      if (!currentToken) {
        if (hadTokenRef.current) {
          triggerExpirationModal();
        }
        return;
      }
      if (isTokenExpired(currentToken)) {
        triggerExpirationModal();
      }
    };

    const intervalId = setInterval(checkSession, 30000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    };

    window.addEventListener('session-expired', triggerExpirationModal);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('session-expired', triggerExpirationModal);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [pathname, isPublicRoute, expired, router, triggerExpirationModal]);

  const handleRedirectToAuth = () => {
    clearSessionStorage();
    setExpired(false);
    router.push('/auth');
  };

  if (!expired || isPublicRoute) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0e14]/85 backdrop-blur-md animate-in fade-in duration-200 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-[#12161f] p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.9)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
          <Clock className="h-7 w-7" />
        </div>

        <h3 className="text-lg font-bold text-slate-100">
          Oturum Süreniz Doldu
        </h3>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
          Güvenliğiniz için aktif oturumunuz sonlandırıldı. Verileri ve grafikleri görüntülemeye devam etmek için lütfen yeniden giriş yapın.
        </p>

        <div className="mt-6">
          <button
            type="button"
            onClick={handleRedirectToAuth}
            className="w-full inline-flex items-center justify-center space-x-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(37,99,235,0.6)] transition-all duration-200 cursor-pointer"
          >
            <LogIn className="h-4 w-4" />
            <span>Yeniden Giriş Yap</span>
          </button>
        </div>
      </div>
    </div>
  );
}