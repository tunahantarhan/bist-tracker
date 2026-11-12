'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Database, Gauge, LayoutDashboard, LogOut, Menu, ShieldCheck, Sliders, Users, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandMark';
import { clearSession, getUserSlug } from '@/lib/auth';

export type AdminSection = 'overview' | 'rules' | 'users' | 'universe';

export const SECTION_HASH: Record<AdminSection, string> = {
  overview: '',
  rules: 'kurallar',
  users: 'kullanicilar',
  universe: 'evren',
};

export function sectionFromHash(hash: string): AdminSection {
  const key = hash.replace('#', '');
  return (Object.entries(SECTION_HASH).find(([, v]) => v && v === key)?.[0] as AdminSection) ?? 'overview';
}

const NAV: { key: AdminSection; label: string; icon: LucideIcon; countKey?: 'rules' | 'users' | 'stocks' }[] = [
  { key: 'overview', label: 'Genel bakış', icon: Gauge },
  { key: 'rules', label: 'Kural motoru', icon: Sliders, countKey: 'rules' },
  { key: 'users', label: 'Kullanıcılar', icon: Users, countKey: 'users' },
  { key: 'universe', label: 'Hisse evreni', icon: Database, countKey: 'stocks' },
];

const noopSubscribe = () => () => {};

function initials(slug: string) {
  if (!slug || slug === 'profil') return 'Y';
  return slug
    .split('-')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function SidebarContent({
  section,
  counts,
  onNavigate,
}: {
  section: AdminSection;
  counts: { rules: number; users: number; stocks: number };
  onNavigate: (s: AdminSection) => void;
}) {
  const router = useRouter();
  const slug = useSyncExternalStore(noopSubscribe, getUserSlug, () => 'profil');

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-slate-800/80 px-5">
        <BrandLogo href="/ana-sayfa" size="sm" suffix="Yönetim konsolu" />
      </div>

      <nav className="flex-1 space-y-1 p-3" aria-label="Yönetim bölümleri">
        <p className="px-3 pb-2 pt-3 font-data text-[10px] uppercase tracking-[0.18em] text-slate-600">Yönetim</p>
        {NAV.map(({ key, label, icon: Icon, countKey }) => {
          const active = section === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active ? 'bg-emerald-500/10 text-emerald-200' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
              }`}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-emerald-400" />}
              <Icon className={`h-4 w-4 ${active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="flex-1 text-left">{label}</span>
              {countKey && (
                <span className={`font-data text-[11px] ${active ? 'text-emerald-300' : 'text-slate-600'}`}>{counts[countKey]}</span>
              )}
            </button>
          );
        })}

        <p className="px-3 pb-2 pt-6 font-data text-[10px] uppercase tracking-[0.18em] text-slate-600">Uygulama</p>
        <Link
          href="/ana-sayfa"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-slate-100"
        >
          <LayoutDashboard className="h-4 w-4 text-slate-500" /> Kullanıcı paneli
        </Link>
      </nav>

      <div className="border-t border-slate-800/80 p-3">
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 font-data text-xs font-semibold text-emerald-200">
            {initials(slug)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">Yönetici</p>
            <p className="flex items-center gap-1 text-[11px] text-emerald-400/80">
              <ShieldCheck className="h-3 w-3" /> 2FA ile doğrulandı
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              clearSession();
              router.push('/admin/giris');
            }}
            title="Çıkış yap"
            aria-label="Çıkış yap"
            className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminShell({
  section,
  onNavigate,
  counts,
  title,
  subtitle,
  actions,
  children,
}: {
  section: AdminSection;
  onNavigate: (s: AdminSection) => void;
  counts: { rules: number; users: number; stocks: number };
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const navigate = (s: AdminSection) => {
    setDrawerOpen(false);
    onNavigate(s);
  };

  return (
    <div className="flex min-h-screen bg-[#0b0e14] text-slate-200">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-800/80 bg-[#0d1118] lg:block">
        <SidebarContent section={section} counts={counts} onNavigate={navigate} />
      </aside>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? '' : 'pointer-events-none'}`} aria-hidden={!drawerOpen}>
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          inert={!drawerOpen}
          className={`absolute inset-y-0 left-0 w-72 border-r border-slate-800 bg-[#0d1118] shadow-2xl transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Menüyü kapat"
            className="absolute right-3 top-4 z-10 cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarContent section={section} counts={counts} onNavigate={navigate} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0b0e14]/85 backdrop-blur-md">
          <div className="flex min-h-16 items-center gap-3 px-4 py-3 md:px-8">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Menüyü aç"
              className="cursor-pointer rounded-lg border border-slate-800 p-2 text-slate-400 transition-colors hover:text-white lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-50">{title}</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
