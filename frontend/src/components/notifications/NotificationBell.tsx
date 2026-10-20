'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCheck, ExternalLink, Flame, Sparkles, Trash2 } from 'lucide-react';
import { 
  fetchNotifications, 
  fetchUnreadNotificationCount, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  deleteNotification,
  clearAllNotifications,
  AppNotification 
} from '@/services/api';

// Synthesizes a crisp, professional two-tone notification chime using browser Web Audio API
const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.28);
    gain2.gain.setValueAtTime(0.10, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.55);
  } catch {
    // Audio Context might wait for initial user interaction on strict autoplay policies
  }
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const loadUnreadCount = useCallback(async () => {
    try {
      const count = await fetchUnreadNotificationCount();
      
      // Play alert chime when unread notifications increase while dashboard is open/in background
      if (prevCountRef.current !== null && count > prevCountRef.current) {
        playNotificationSound();
      }
      prevCountRef.current = count;
      setUnreadCount(count);
    } catch {
      // Silent error handling
    }
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications(25);
      setNotifications(data);
    } catch (err) {
      console.warn('Bildirimler yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUnreadCount();
    const timer = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(timer);
  }, [loadUnreadCount]);

  const handleToggleOpen = () => {
    if (!isOpen) {
      loadNotifications();
      loadUnreadCount();
    }
    setIsOpen((prev) => !prev);
  };

  const handleItemClick = async (notif: AppNotification) => {
    if (!notif.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      prevCountRef.current = Math.max(0, (prevCountRef.current || 1) - 1);
      markNotificationAsRead(notif.id).catch(console.warn);
    }

    if (notif.symbol) {
      setIsOpen(false);
      window.open(`/detay/${notif.symbol}`, '_blank');
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent, id: number, isRead: boolean) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (!isRead) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
      prevCountRef.current = Math.max(0, (prevCountRef.current || 1) - 1);
    }
    try {
      await deleteNotification(id);
    } catch (err) {
      console.warn('Bildirim silinemedi:', err);
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    prevCountRef.current = 0;
    try {
      await markAllNotificationsAsRead();
    } catch (err) {
      console.warn('Tümünü okundu işaretleme hatası:', err);
    }
  };

  const handleClearAll = async () => {
    setNotifications([]);
    setUnreadCount(0);
    prevCountRef.current = 0;
    try {
      await clearAllNotifications();
    } catch (err) {
      console.warn('Tüm bildirimler silinemedi:', err);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + ' · ' +
             d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={handleToggleOpen}
        title="Bildirimler"
        className="relative h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-all outline-none cursor-pointer"
      >
        <Bell className="h-4 w-4 text-slate-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-mono font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-800 bg-[#12161f] text-slate-200 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between bg-[#161b26]">
            <div className="flex items-center space-x-2">
              <Flame className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Sinyal Alarmları
              </span>
              {unreadCount > 0 && (
                <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded-md">
                  {unreadCount} Yeni
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  title="Tümünü Okundu İşaretle"
                  className="inline-flex items-center space-x-1 text-[11px] font-medium text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Okundu</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  title="Tüm Bildirimleri Temizle"
                  className="inline-flex items-center space-x-1 text-[11px] font-medium text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Temizle</span>
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto scrollbar-hide">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono">
                Yükleniyor...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center justify-center space-y-1">
                <Sparkles className="h-5 w-5 text-slate-600 mb-1" />
                <span>Henüz bir sinyal alarmı bulunmuyor.</span>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className={`group p-3.5 flex items-start space-x-3 transition-colors cursor-pointer relative ${
                    notif.is_read
                      ? 'bg-transparent hover:bg-slate-800/30'
                      : 'bg-amber-500/[0.04] border-l-2 border-l-amber-400 hover:bg-amber-500/[0.08]'
                  }`}
                >
                  <div className="h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0 mt-0.5 text-amber-400 font-mono text-xs font-bold">
                    {notif.symbol ? notif.symbol.slice(0, 3) : 'RSI'}
                  </div>

                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-100 truncate">
                        {notif.symbol || 'BIST Sinyali'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {formatTime(notif.created_at)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed line-clamp-2">
                      {notif.message}
                    </p>

                    {notif.symbol && (
                      <div className="mt-1.5 flex items-center space-x-1 text-[10px] font-medium text-blue-400 hover:text-blue-300">
                        <span>Grafiğe Git</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteItem(e, notif.id, notif.is_read)}
                    title="Bu bildirimi sil"
                    className="absolute top-3.5 right-3 p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}