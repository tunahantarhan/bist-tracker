'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, CheckCheck, ChevronRight, Radar, Trash2, UserRound, Volume2, VolumeX } from 'lucide-react';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  deleteNotification,
  clearAllNotifications,
  AppNotification,
} from '@/services/api';
import { getUserSlug } from '@/lib/auth';
import { relativeTime } from '@/lib/time';
import {
  isSoundEnabled,
  playNotificationSound,
  primeNotificationSound,
  setSoundEnabled,
} from '@/lib/notificationSound';

type Filter = 'all' | 'unread' | 'system' | 'custom';

const POLL_MS = 15_000;

interface ParsedNotification {
  isCustom: boolean;
  ruleName: string | null;
  price: string | null;
  text: string;
}

/** Pulls the rule name and price out of the dispatcher's message templates. */
function parse(n: AppNotification): ParsedNotification {
  const raw = n.message.replace(/^\[ÖZEL ALARM\]\s*/, '');
  const isCustom =
    n.message.startsWith('[ÖZEL ALARM]') ||
    raw.startsWith('Takip ettiğiniz') ||
    raw.toLowerCase().includes('özel alarm');
  const ruleName = raw.match(/'([^']+)'/)?.[1] ?? null;
  const price = raw.match(/₺\s?([\d.,]+)/)?.[1] ?? null;
  const text = raw.replace(/\s*Güncel fiyat:\s*₺[\d.,]+\.?$/, '').trim();
  return { isCustom, ruleName, price, text };
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
}

function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/** Renders the message with the quoted rule name highlighted. */
function MessageText({ text, ruleName }: { text: string; ruleName: string | null }) {
  if (!ruleName) return <>{text}</>;
  const quoted = `'${ruleName}'`;
  const idx = text.indexOf(quoted);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-medium text-slate-100">{ruleName}</span>
      {text.slice(idx + quoted.length)}
    </>
  );
}

export default function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Only rendered inside the dropdown (client-side), so no hydration mismatch.
  const [soundOn, setSoundOn] = useState(() => (typeof window === 'undefined' ? true : isSoundEnabled()));
  const [ring, setRing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Highest notification id seen so far; null until the first load so the
  // existing inbox never plays a sound on page open.
  const lastSeenId = useRef<number | null>(null);

  useEffect(() => primeNotificationSound(), []);

  // Close on outside click / Escape
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  // Poll inbox and unread badge
  useEffect(() => {
    const loadData = async () => {
      const [list, count] = await Promise.all([
        fetchNotifications(30).catch(() => null),
        fetchUnreadNotificationCount().catch(() => null),
      ]);
      if (list) {
        const maxId = list.reduce((m, n) => Math.max(m, n.id), 0);
        if (lastSeenId.current !== null && list.some((n) => n.id > lastSeenId.current! && !n.is_read)) {
          playNotificationSound();
          setRing(true);
          setTimeout(() => setRing(false), 1200);
        }
        lastSeenId.current = Math.max(lastSeenId.current ?? 0, maxId);
        setNotifications(list);
      }
      if (count !== null) setUnreadCount(count);
    };
    loadData();
    const timer = setInterval(loadData, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playNotificationSound(true);
  };

  const markRead = (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    markNotificationAsRead(id).catch(() => {});
  };

  const handleOpenItem = (n: AppNotification) => {
    if (!n.is_read) markRead(n.id);
    setIsOpen(false);
    if (n.symbol) router.push(`/detay/${n.symbol}`);
  };

  const handleMarkRead = (e: React.MouseEvent, n: AppNotification) => {
    e.stopPropagation();
    markRead(n.id);
  };

  const handleDelete = async (e: React.MouseEvent, n: AppNotification) => {
    e.stopPropagation();
    try {
      await deleteNotification(n.id);
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      if (!n.is_read) setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Delete notification failed:', err);
    }
  };

  const handleReadAll = async () => {
    setBusy(true);
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Mark all read failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await clearAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Clear all failed:', err);
    } finally {
      setBusy(false);
      setConfirmClear(false);
    }
  };

  const parsed = notifications.map((n) => ({ n, p: parse(n) }));
  const counts = {
    all: parsed.length,
    unread: parsed.filter(({ n }) => !n.is_read).length,
    system: parsed.filter(({ p }) => !p.isCustom).length,
    custom: parsed.filter(({ p }) => p.isCustom).length,
  };
  const visible = parsed.filter(({ n, p }) =>
    filter === 'unread' ? !n.is_read : filter === 'system' ? !p.isCustom : filter === 'custom' ? p.isCustom : true,
  );

  const groups: { label: string; rows: typeof visible }[] = [];
  for (const row of visible) {
    const label = dayLabel(row.n.created_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }

  const tabs: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Tümü' },
    { value: 'unread', label: 'Okunmamış' },
    { value: 'system', label: 'Sistem' },
    { value: 'custom', label: 'Kişisel' },
  ];

  return (
    <div ref={dropdownRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={`Bildirimler${unreadCount ? `, ${unreadCount} okunmamış` : ''}`}
        aria-expanded={isOpen}
        className={`relative cursor-pointer rounded-full border p-2 transition-colors ${
          isOpen
            ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
            : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white'
        }`}
        title="Bildirimler"
      >
        <Bell className={`h-4 w-4 ${ring ? 'animate-[bell-ring_0.9s_ease-in-out]' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 font-data text-[10px] font-bold text-white ring-2 ring-[#0b0e14]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <style>{`
        @keyframes bell-ring {
          0%, 100% { transform: rotate(0); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-12deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-5deg); }
          75% { transform: rotate(2deg); }
        }
      `}</style>

      {isOpen && (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-slate-800 bg-[#12161f] shadow-2xl shadow-black/50 animate-in fade-in zoom-in-95 duration-150 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#161b26] px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-100">Bildirimler</h3>
              {unreadCount > 0 && (
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 font-data text-[10px] font-semibold text-blue-300">
                  {unreadCount} yeni
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSound}
                className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                title={soundOn ? 'Bildirim sesini kapat' : 'Bildirim sesini aç'}
                aria-label={soundOn ? 'Bildirim sesini kapat' : 'Bildirim sesini aç'}
              >
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-slate-500" />}
              </button>
              <button
                type="button"
                onClick={handleReadAll}
                disabled={busy || unreadCount === 0}
                className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                title="Tümünü okundu say"
                aria-label="Tümünü okundu say"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={busy || notifications.length === 0}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-md p-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  confirmClear ? 'bg-rose-500/15 text-rose-300' : 'text-slate-400 hover:bg-slate-800 hover:text-rose-300'
                }`}
                title="Tümünü sil"
                aria-label="Tümünü sil"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmClear && <span className="pr-0.5">Emin misin?</span>}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-1 border-b border-slate-800/80 px-3 py-2">
            {tabs.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setFilter(t.value)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                  filter === t.value ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.label}
                <span className={`font-data text-[10px] ${filter === t.value ? 'text-slate-400' : 'text-slate-600'}`}>
                  {counts[t.value]}
                </span>
              </button>
            ))}
          </div>

          {/* List */}
          <div className="max-h-[min(420px,60vh)] overflow-y-auto scrollbar-hide">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900/60">
                  <BellOff className="h-4 w-4 text-slate-500" />
                </span>
                <p className="text-xs text-slate-400">
                  {notifications.length === 0 ? 'Henüz bildirim yok' : 'Bu filtrede bildirim yok'}
                </p>
                {notifications.length === 0 && (
                  <p className="max-w-[260px] text-[11px] leading-relaxed text-slate-600">
                    Ana filtre sinyalleri ve kişisel alarmların seans saatlerinde burada görünür.
                  </p>
                )}
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.label}>
                  <div className="sticky top-0 z-10 border-b border-slate-800/60 bg-[#12161f]/95 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur">
                    {g.label}
                  </div>
                  <div className="divide-y divide-slate-800/50">
                    {g.rows.map(({ n, p }) => {
                      const unread = !n.is_read;
                      const accent = p.isCustom
                        ? { dot: 'bg-violet-400', icon: 'border-violet-500/30 bg-violet-500/10 text-violet-300', badge: 'border-violet-500/30 bg-violet-500/10 text-violet-300' }
                        : { dot: 'bg-blue-400', icon: 'border-blue-500/30 bg-blue-500/10 text-blue-300', badge: 'border-blue-500/25 bg-blue-500/10 text-blue-300' };
                      const Icon = p.isCustom ? UserRound : Radar;
                      return (
                        <div
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleOpenItem(n)}
                          onKeyDown={(e) => e.key === 'Enter' && handleOpenItem(n)}
                          className={`group relative flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-800/40 focus:outline-none focus-visible:bg-slate-800/40 ${
                            unread ? 'bg-slate-800/20' : ''
                          }`}
                        >
                          {unread && <span className={`absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${accent.dot}`} />}

                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${accent.icon}`}>
                            <Icon className="h-4 w-4" />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-data text-sm font-semibold ${unread ? 'text-slate-50' : 'text-slate-300'}`}>
                                {n.symbol || 'BIST'}
                              </span>
                              <span className={`rounded border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${accent.badge}`}>
                                {p.isCustom ? 'Kişisel' : 'Sistem'}
                              </span>
                              {p.price && (
                                <span className="ml-auto font-data text-xs text-slate-300">₺{p.price}</span>
                              )}
                            </div>
                            <p className={`mt-1 line-clamp-2 text-xs leading-snug ${unread ? 'text-slate-300' : 'text-slate-500'}`}>
                              <MessageText text={p.text} ruleName={p.ruleName} />
                            </p>
                            <div className="mt-1.5 flex items-center justify-between">
                              <span className="font-data text-[10px] text-slate-500" title={new Date(n.created_at).toLocaleString('tr-TR')}>
                                {clockOf(n.created_at)} · {relativeTime(n.created_at)}
                              </span>
                              <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                {unread && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleMarkRead(e, n)}
                                    className="cursor-pointer rounded p-1 text-slate-500 transition-colors hover:bg-slate-700/60 hover:text-emerald-300"
                                    title="Okundu say"
                                    aria-label="Okundu say"
                                  >
                                    <CheckCheck className="h-3 w-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => handleDelete(e, n)}
                                  className="cursor-pointer rounded p-1 text-slate-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                                  title="Sil"
                                  aria-label="Sil"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <Link
            href={`/kullanici/${getUserSlug()}#bildirimler`}
            onClick={() => setIsOpen(false)}
            className="flex items-center justify-center gap-1 border-t border-slate-800/80 bg-[#161b26] px-4 py-2.5 text-xs text-slate-400 transition-colors hover:text-blue-300"
          >
            Tüm bildirimler ve alarm ayarları <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
