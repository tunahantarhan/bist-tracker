'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Search, ShieldCheck, User, X } from 'lucide-react';
import NotificationBell from '@/components/notifications/NotificationBell';
import StockSearch from '@/components/ui/StockSearch';
import { BrandLogo, BrandMark } from '@/components/brand/BrandMark';
import { clearSession, getUserSlug, isAdminAccount } from '@/lib/auth';
import { formatIstanbulTime, isBistOpen } from '@/lib/scanSummary';

const noopSubscribe = () => () => {};

// Prices from the data provider are delayed by about 15 minutes
const DATA_DELAY_MS = 15 * 60 * 1000;

function MarketClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const open = now ? isBistOpen(now) : false;
  return (
    <div
      className="hidden items-center gap-2.5 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5 md:flex"
      title="Fiyatlar yaklaşık 15 dakika gecikmelidir"
    >
      <span className="relative flex h-2 w-2">
        {open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${open ? 'bg-emerald-400' : 'bg-slate-600'}`} />
      </span>
      <span className="font-data text-[11px] text-slate-400">
        {open ? 'Seans açık' : 'Seans kapalı'}
        <span className="mx-1.5 text-slate-700">|</span>
        <span className="text-slate-300">{now ? formatIstanbulTime(new Date(now.getTime() - DATA_DELAY_MS), true) : '--:--:--'}</span>
      </span>
    </div>
  );
}

function initialsFromSlug(slug: string): string {
  if (!slug || slug === 'profil') return '';
  return slug
    .split('-')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ProfileMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAdmin = useSyncExternalStore(noopSubscribe, isAdminAccount, () => false);
  const slug = useSyncExternalStore(noopSubscribe, getUserSlug, () => 'profil');
  const initials = initialsFromSlug(slug);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Hesabım"
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 font-data text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500"
      >
        {initials || <User className="h-4 w-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-800 bg-[#12161f] p-1.5 text-slate-200 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <p className="px-2.5 pb-2 pt-1.5 font-data text-[10px] uppercase tracking-[0.16em] text-slate-500">Hesabım</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => go(`/kullanici/${slug}`)}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-800/80"
          >
            <User className="h-4 w-4 text-slate-400" /> Profil ve alarmlar
          </button>
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/admin')}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-emerald-300 transition-colors hover:bg-slate-800/80"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> Yönetim paneli
            </button>
          )}
          <div className="my-1.5 h-px bg-slate-800" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              clearSession();
              go('/giris');
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-500/10"
          >
            <LogOut className="h-4 w-4" /> Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}

export default function DashboardHeader({
  watchlist,
  onToggleWatchlist,
  onSelect,
}: {
  watchlist: string[];
  onToggleWatchlist: (symbol: string, isAdded: boolean) => void;
  onSelect: (symbol: string) => void;
}) {
  const [mobileSearch, setMobileSearch] = useState(false);

  // Adding a stock from the mobile search jumps to its chart, so the search can close
  const handleToggle = (symbol: string, isAdded: boolean) => {
    onToggleWatchlist(symbol, isAdded);
    if (!isAdded) setMobileSearch(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#0b0e14]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 md:px-6">
        {mobileSearch ? (
          <div className="flex w-full items-center gap-3 animate-in fade-in duration-200">
            <div className="flex-1">
              <StockSearch
                userWatchlist={watchlist}
                onToggleWatchlist={handleToggle}
                onSelect={(symbol) => {
                  onSelect(symbol);
                  setMobileSearch(false);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileSearch(false)}
              aria-label="Aramayı kapat"
              className="rounded-lg border border-slate-700 bg-slate-800 p-2 transition-colors hover:bg-slate-700"
            >
              <X className="h-5 w-5 text-slate-300" />
            </button>
          </div>
        ) : (
          <>
            <div className="hidden sm:block">
              <BrandLogo href="/" size="sm" />
            </div>
            <Link href="/" className="sm:hidden" aria-label="Ana sayfa">
              <BrandMark className="h-8 w-8" />
            </Link>

            <div className="hidden flex-1 justify-center sm:flex">
              <div className="w-full max-w-md">
                <StockSearch userWatchlist={watchlist} onToggleWatchlist={onToggleWatchlist} onSelect={onSelect} enableShortcut />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2 sm:ml-0 sm:gap-3">
              <MarketClock />
              <button
                type="button"
                onClick={() => setMobileSearch(true)}
                aria-label="Hisse ara"
                className="rounded-full border border-slate-700 bg-slate-800/50 p-2 transition-colors hover:bg-slate-700 sm:hidden"
              >
                <Search className="h-4 w-4 text-slate-300" />
              </button>
              <NotificationBell />
              <ProfileMenu />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
