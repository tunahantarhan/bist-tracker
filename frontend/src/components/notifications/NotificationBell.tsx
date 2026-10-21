'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bell, Flame, Trash2 
} from 'lucide-react';
import { 
  fetchNotifications, 
  fetchUnreadNotificationCount, 
  markAllNotificationsAsRead, 
  deleteNotification, 
  clearAllNotifications, 
  AppNotification 
} from '@/services/api';

export default function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [list, count] = await Promise.all([
        fetchNotifications(30).catch(() => []),
        fetchUnreadNotificationCount().catch(() => 0),
      ]);
      setNotifications(list);
      setUnreadCount(count);
    } catch (err) {
      console.warn('Notifications fetch warning:', err);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 15000);
    return () => clearInterval(timer);
  }, []);

  const handleOpen = async () => {
    setIsOpen((prev) => !prev);
    if (!isOpen && unreadCount > 0) {
      await markAllNotificationsAsRead().catch(() => {});
      setUnreadCount(0);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Delete notification failed:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      setLoading(true);
      await clearAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Clear all failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToStock = (symbol: string | null) => {
    setIsOpen(false);
    if (symbol) {
      router.push(`/detay/${symbol}`);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const day = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
      return `${time} · ${day}`;
    } catch {
      return '';
    }
  };

  return (
    <div ref={dropdownRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={handleOpen}
        className="relative p-2 rounded-full border border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
        title="Sinyal Alarmları"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-[0_0_8px_#f43f5e] animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-84 sm:w-92 rounded-xl border border-slate-800 bg-[#12161f] shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-3.5 py-2.5 border-b border-slate-800/80 flex items-center justify-between bg-[#161b26]">
            <div className="flex items-center space-x-2">
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                Sinyal Alarmları
              </h3>
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={loading}
                className="inline-flex items-center space-x-1 text-[10px] font-mono text-slate-400 hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                <span>Temizle</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-800/50 scrollbar-hide">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 font-mono">
                Henüz bir bildirim yok.
              </div>
            ) : (
              notifications.map((item) => {
                const isCustom = 
                  item.message.includes('[ÖZEL ALARM]') ||
                  item.message.includes('Takip ettiğiniz') ||
                  item.message.toLowerCase().includes('özel alarm');
                  
                const cleanMessage = item.message.replace(/^[ÖZEL ALARM]\s*/, '');
                const sym = item.symbol || 'BIST';
                const isUnread = !item.is_read;

                // Subtle background tint for unread items based on type
                const unreadBg = isCustom
                  ? 'bg-purple-500/[0.04] border-l-2 border-l-purple-500/60'
                  : 'bg-amber-500/[0.04] border-l-2 border-l-amber-500/60';

                return (
                  <div
                    key={item.id}
                    onClick={() => handleNavigateToStock(item.symbol)}
                    className={`p-3 transition-colors cursor-pointer group flex items-start space-x-3 ${
                      isUnread ? unreadBg : 'bg-transparent border-l-2 border-l-transparent'
                    } hover:bg-slate-800/35`}
                  >
                    {/* Compact Ticker Badge */}
                    <div
                      className={`h-7 w-7 rounded-lg flex items-center justify-center font-mono font-bold text-[10px] shrink-0 border ${
                        isCustom
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      }`}
                    >
                      {sym.slice(0, 3)}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-bold text-xs text-slate-100">
                            {sym}
                          </span>
                          {/* Subtle Badge */}
                          {isCustom ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              KİŞİSEL
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              SİSTEM
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] font-mono text-slate-500">
                            {formatTime(item.created_at)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, item.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">
                        {cleanMessage}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}