'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Bell, BellRing, ChevronRight, LayoutGrid, Settings } from 'lucide-react';
import {
  addToWatchlist,
  clearAllNotifications,
  deleteAlert,
  deleteNotification,
  fetchAlerts,
  fetchMarketOverview,
  fetchMe,
  fetchNotifications,
  fetchRules,
  fetchWatchlist,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  removeFromWatchlist,
  setAlertActive,
  type AppNotification,
  type CustomAlert,
  type StockOverviewItem,
  type UserProfile,
} from '@/services/api';
import type { Rule } from '@/types';
import { getAccessToken, storeUserName } from '@/lib/auth';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import AppFooter from '@/components/dashboard/AppFooter';
import { FeedbackProvider, useFeedback } from '@/components/ui/feedback';
import ProfileHero from '@/components/profile/ProfileHero';
import { GettingStarted, RecentNotifications, WatchlistCards } from '@/components/profile/OverviewTab';
import AlertsTab from '@/components/profile/AlertsTab';
import NotificationsTab from '@/components/profile/NotificationsTab';
import AccountTab from '@/components/profile/AccountTab';

type Tab = 'ozet' | 'alarmlar' | 'bildirimler' | 'hesap';

const TABS: { key: Tab; label: string; short?: string; icon: LucideIcon }[] = [
  { key: 'ozet', label: 'Özet', icon: LayoutGrid },
  { key: 'alarmlar', label: 'Alarmlar', icon: Bell },
  { key: 'bildirimler', label: 'Bildirimler', icon: BellRing },
  { key: 'hesap', label: 'Hesap ve güvenlik', short: 'Hesap', icon: Settings },
];

function tabFromHash(hash: string): Tab {
  const key = hash.replace('#', '') as Tab;
  return TABS.some((t) => t.key === key) ? key : 'ozet';
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Profil yükleniyor">
      <div className="h-56 animate-pulse rounded-2xl border border-slate-800/80 bg-[#12161f] xl:h-40" />
      <div className="h-11 w-full max-w-lg animate-pulse rounded-xl bg-[#12161f]" />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="h-80 animate-pulse rounded-2xl border border-slate-800/80 bg-[#12161f]" />
        <div className="h-80 animate-pulse rounded-2xl border border-slate-800/80 bg-[#12161f]" />
      </div>
    </div>
  );
}

function ProfileConsole() {
  const router = useRouter();
  const { toast, confirm } = useFeedback();

  const [tab, setTab] = useState<Tab>(() => (typeof window === 'undefined' ? 'ozet' : tabFromHash(window.location.hash)));
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [market, setMarket] = useState<Record<string, StockOverviewItem>>({});
  const [alerts, setAlerts] = useState<CustomAlert[]>([]);
  const [rules, setRules] = useState<Record<number, Rule>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [busyAlert, setBusyAlert] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const watchInFlight = useRef(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/giris');
      return;
    }
    Promise.all([
      fetchMe(),
      fetchWatchlist().catch(() => []),
      fetchAlerts().catch(() => [] as CustomAlert[]),
      fetchRules().catch(() => [] as Rule[]),
      fetchNotifications(50).catch(() => [] as AppNotification[]),
    ])
      .then(([me, wl, alertList, ruleList, notes]) => {
        setProfile(me);
        setWatchlist(wl.map((w) => w.symbol));
        setAlerts(alertList);
        setRules(Object.fromEntries(ruleList.map((r) => [r.id, r])));
        setNotifications(notes);
      })
      .catch(() => setLoadError(true));

    // Prices and scores come from the latest scan; the page works without them
    fetchMarketOverview()
      .then((o) => setMarket(Object.fromEntries(o.items.map((i) => [i.symbol, i]))))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((t: Tab) => {
    setTab(t);
    window.history.replaceState(null, '', t === 'ozet' ? window.location.pathname : `#${t}`);
  }, []);

  // ---- Watchlist ---------------------------------------------------------
  const toggleWatch = useCallback(
    async (symbol: string, isAdded: boolean) => {
      if (watchInFlight.current) return;
      watchInFlight.current = true;
      try {
        if (isAdded) {
          await removeFromWatchlist(symbol);
          setWatchlist((prev) => prev.filter((s) => s !== symbol));
          toast(`${symbol} takip listesinden çıkarıldı.`, 'info');
        } else {
          await addToWatchlist(symbol);
          setWatchlist((prev) => [...prev, symbol]);
          toast(`${symbol} takip listesine eklendi.`);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Takip listesi güncellenemedi.', 'error');
      } finally {
        watchInFlight.current = false;
      }
    },
    [toast]
  );

  // ---- Alerts ------------------------------------------------------------
  const toggleAlert = async (alert: CustomAlert) => {
    setBusyAlert(alert.id);
    try {
      const updated = await setAlertActive(alert.id, !alert.is_active);
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast(updated.is_active ? `${alert.symbol} alarmı yeniden aktif.` : `${alert.symbol} alarmı duraklatıldı.`, 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Alarm güncellenemedi.', 'error');
    } finally {
      setBusyAlert(null);
    }
  };

  const removeAlert = async (alert: CustomAlert) => {
    const ok = await confirm({
      title: `${alert.symbol} alarmı silinsin mi?`,
      message: 'Alarm kaldırılır; istersen daha sonra hisse detay sayfasından yeniden kurabilirsin.',
      confirmLabel: 'Sil',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyAlert(alert.id);
    try {
      await deleteAlert(alert.id);
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      toast(`${alert.symbol} alarmı silindi.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Alarm silinemedi.', 'error');
    } finally {
      setBusyAlert(null);
    }
  };

  // ---- Notifications -----------------------------------------------------
  const readNotification = async (n: AppNotification) => {
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    await markNotificationAsRead(n.id).catch(() => {});
  };

  const readAll = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((x) => ({ ...x, is_read: true })));
    } catch {
      toast('Bildirimler güncellenemedi.', 'error');
    }
  };

  const removeNotification = async (n: AppNotification) => {
    try {
      await deleteNotification(n.id);
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    } catch {
      toast('Bildirim silinemedi.', 'error');
    }
  };

  const clearNotifications = async () => {
    const ok = await confirm({
      title: 'Tüm bildirimler silinsin mi?',
      message: 'Bildirim geçmişin temizlenir. Alarmların etkilenmez.',
      confirmLabel: 'Temizle',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await clearAllNotifications();
      setNotifications([]);
      toast('Bildirimler temizlendi.');
    } catch {
      toast('Bildirimler temizlenemedi.', 'error');
    }
  };

  // ---- Profile -----------------------------------------------------------
  const onProfileUpdated = (p: UserProfile) => {
    setProfile(p);
    if (p.first_name && p.last_name) {
      const slug = storeUserName(p.first_name, p.last_name);
      window.history.replaceState(null, '', `/kullanici/${slug}${window.location.hash}`);
    }
  };

  const stats = useMemo(
    () => ({
      watchlist: watchlist.length,
      activeAlerts: alerts.filter((a) => a.is_active).length,
      totalAlerts: alerts.length,
      triggeredAlerts: alerts.filter((a) => a.last_triggered_at).length,
      unread: notifications.filter((n) => !n.is_read).length,
    }),
    [watchlist, alerts, notifications]
  );

  const steps = profile
    ? [
        { label: 'E-posta adresini doğrula', hint: 'Giriş ve bildirimler için gerekli', done: profile.is_verified },
        { label: 'Takip listene hisse ekle', hint: 'Üstteki aramayı kullan ("/" kısayolu)', done: watchlist.length > 0, href: '/ana-sayfa' },
        { label: 'İlk alarmını kur', hint: 'Hisse detayında "Alarm kur" düğmesi', done: alerts.length > 0, href: '/ana-sayfa' },
        { label: 'Bir bildirim al', hint: 'Alarmın tetiklendiğinde burada görünür', done: notifications.length > 0, onClick: () => navigate('alarmlar') },
      ]
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0e14] text-slate-200">
      <DashboardHeader watchlist={watchlist} onToggleWatchlist={toggleWatch} onSelect={(s) => router.push(`/detay/${s}`)} />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 md:px-6">
        <nav aria-label="Konum" className="flex items-center gap-1.5 font-data text-[11px] text-slate-500">
          <Link href="/ana-sayfa" className="hover:text-slate-300">
            Panel
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-300">Hesabım</span>
        </nav>

        {loadError ? (
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-8 text-center text-sm text-rose-200">
            Profil bilgileri alınamadı. Lütfen sayfayı yenile.
          </div>
        ) : !profile ? (
          <ProfileSkeleton />
        ) : (
          <>
            <ProfileHero profile={profile} stats={stats} onNavigate={navigate} />

            <div role="tablist" aria-label="Profil bölümleri" className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-800/80 px-4 md:mx-0 md:px-0">
              {TABS.map((t) => {
                const active = tab === t.key;
                const badge = t.key === 'alarmlar' ? stats.totalAlerts : t.key === 'bildirimler' ? stats.unread : 0;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => navigate(t.key)}
                    className={`relative inline-flex shrink-0 cursor-pointer items-center gap-2 px-2.5 py-3 sm:px-3.5 text-sm transition-colors ${
                      active ? 'text-white' : 'text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    <t.icon className={`h-4 w-4 ${active ? 'text-blue-400' : ''}`} />
                    {t.short ? (
                      <>
                        <span className="sm:hidden">{t.short}</span>
                        <span className="hidden sm:inline">{t.label}</span>
                      </>
                    ) : (
                      t.label
                    )}
                    {badge > 0 && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-data text-[10px] ${
                          t.key === 'bildirimler' ? 'bg-blue-500/15 text-blue-300' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                    <span
                      className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-500 transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
                    />
                  </button>
                );
              })}
            </div>

            <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
              {tab === 'ozet' && (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="min-w-0">
                    <WatchlistCards symbols={watchlist} market={market} onRemove={(s) => toggleWatch(s, true)} />
                  </div>
                  <div className="min-w-0 space-y-5">
                    <GettingStarted steps={steps} />
                    <RecentNotifications items={notifications.slice(0, 5)} onShowAll={() => navigate('bildirimler')} />
                  </div>
                </div>
              )}
              {tab === 'alarmlar' && (
                <AlertsTab alerts={alerts} rules={rules} market={market} busyId={busyAlert} onToggle={toggleAlert} onDelete={removeAlert} />
              )}
              {tab === 'bildirimler' && (
                <NotificationsTab
                  items={notifications}
                  onRead={readNotification}
                  onReadAll={readAll}
                  onDelete={removeNotification}
                  onClear={clearNotifications}
                />
              )}
              {tab === 'hesap' && <AccountTab profile={profile} onUpdated={onProfileUpdated} />}
            </div>
          </>
        )}
      </main>

      <AppFooter />
    </div>
  );
}

export default function UserProfilePage() {
  return (
    <FeedbackProvider>
      <ProfileConsole />
    </FeedbackProvider>
  );
}
