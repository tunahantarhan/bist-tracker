'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Clock, LogIn } from 'lucide-react';
import { clearSession, getAccessToken, getRefreshToken, isTokenExpired } from '@/lib/auth';
import { refreshSession } from '@/services/api';

export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const [expired, setExpired] = useState(false);
  const hadTokenRef = useRef(false);

  const isPublicRoute = pathname === '/' || pathname?.startsWith('/giris');

  const triggerExpirationModal = useCallback(() => {
    if (isPublicRoute) return;
    clearSession();
    setExpired(true);
  }, [isPublicRoute]);

  // Leaving to a public route (e.g. the login page) clears a previous expiry
  if (isPublicRoute && expired) setExpired(false);

  useEffect(() => {
    if (isPublicRoute) {
      hadTokenRef.current = false;
      return;
    }

    const initialToken = getAccessToken();

    if (!initialToken && !getRefreshToken()) {
      if (!expired) {
        router.replace('/giris');
      }
      return;
    }

    hadTokenRef.current = true;

    // An expired access token is not the end of the session: try the refresh token first
    const checkSession = async () => {
      const token = getAccessToken();
      if (token && !isTokenExpired(token, 30)) return;
      if (!token && !hadTokenRef.current) return;
      if (getRefreshToken() && (await refreshSession())) return;
      triggerExpirationModal();
    };
    checkSession();

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
    clearSession();
    setExpired(false);
    router.push('/giris');
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