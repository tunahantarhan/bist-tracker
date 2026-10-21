'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, User, Mail, Calendar, Shield, Bell, 
  Trash2, ExternalLink, RefreshCw, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { API_URL, fetchRules } from '@/services/api';
import { Rule } from '@/types';

interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  tier: string;
  is_active: boolean;
  terms_accepted_at: string;
}

interface CustomAlertItem {
  id: number;
  symbol: string;
  rule_id: number | null;
  timeframe: string;
  is_active: boolean;
  created_at: string;
  last_triggered_at: string | null;
}

export default function UserProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [alerts, setAlerts] = useState<CustomAlertItem[]>([]);
  const [rulesMap, setRulesMap] = useState<Record<number, Rule>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadData = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/giris');
      return;
    }

    try {
      setLoading(true);
      const [userRes, alertsRes, rulesData] = await Promise.all([
        fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/alerts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchRules().catch(() => []),
      ]);

      if (userRes.ok) {
        const u = await userRes.json();
        setProfile(u);
      }

      if (alertsRes.ok) {
        const a = await alertsRes.json();
        setAlerts(a);
      }

      const map: Record<number, Rule> = {};
      rulesData.forEach((r) => {
        map[r.id] = r;
      });
      setRulesMap(map);
    } catch (err) {
      console.error('Profil verileri yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteAlert = async (alertId: number, symbol: string) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    setDeletingId(alertId);
    try {
      const res = await fetch(`${API_URL}/alerts/${alertId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        showToast(`${symbol} alarmı başarıyla kaldırıldı.`);
      }
    } catch (err) {
      console.error('Alarm silme hatası:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Tetiklenmedi';
    try {
      return new Date(dateStr).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="px-4 sm:px-8 py-3.5 border-b border-slate-800/80 bg-[#12161f]/80 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => router.push('/ana-sayfa')}
            className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Panele Dön"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-100">Kullanıcı Profili</h1>
            <p className="text-[10px] text-slate-400">Hesap bilgileri ve aktif alarm yönetimi</p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="p-2 rounded-lg border border-slate-700 bg-[#161b26] hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Yenile"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 space-y-8">
        
        {/* User Identity Card */}
        <div className="rounded-2xl border border-slate-800/80 bg-[#12161f]/80 backdrop-blur-md p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xl shadow-[0_0_20px_rgba(37,99,235,0.2)]">
                {profile ? `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase() : <User className="h-7 w-7" />}
              </div>
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {profile ? `${profile.first_name} ${profile.last_name}` : 'Kullanıcı'}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    {profile?.tier ? profile.tier.toUpperCase() : 'STANDART'}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
                  <Mail className="h-3.5 w-3.5 text-slate-500" />
                  <span>{profile?.email || '---'}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 text-xs text-slate-400 border-t sm:border-t-0 border-slate-800/80 pt-4 sm:pt-0">
              <div className="flex items-center space-x-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                <span>Kayıt Tarihi: <strong className="text-slate-300 font-mono">{formatDate(profile?.terms_accepted_at)}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Alerts Management Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="h-5 w-5 text-amber-400" />
              <h2 className="text-base font-bold text-white tracking-tight">Aktif Hisse Alarmlarım</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                {alerts.length}
              </span>
            </div>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Şartlar sağlandığında bildirim çanına ve kayıtlı e-postanıza uyarı iletilir.
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#12161f]/80 backdrop-blur-md overflow-hidden shadow-xl">
            {loading ? (
              <div className="p-12 text-center text-xs font-mono text-slate-500 flex items-center justify-center space-x-2">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                <span>Alarmlar yükleniyor...</span>
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-500">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-300">Henüz kurulu bir özel alarmınız yok.</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Panelden veya hisse detay sayfalarındaki <strong className="text-amber-400">"Alarm Kur"</strong> butonuna tıklayarak istediğiniz hisseler için teknik kural alarmları oluşturabilirsiniz.
                </p>
                <div className="pt-2">
                  <Link
                    href="/ana-sayfa"
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                  >
                    <span>Hisseleri İncele</span>
                    <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 divide-y divide-slate-800/80">
                  <thead className="bg-[#161b26] text-slate-400 uppercase font-mono text-[10px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Hisse</th>
                      <th className="px-5 py-3.5">Takip Edilen Kural</th>
                      <th className="px-5 py-3.5">Periyot</th>
                      <th className="px-5 py-3.5">Kurulum Tarihi</th>
                      <th className="px-5 py-3.5">Son Tetiklenme</th>
                      <th className="px-5 py-3.5 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {alerts.map((item) => {
                      const ruleObj = item.rule_id ? rulesMap[item.rule_id] : null;
                      const ruleTitle = ruleObj ? ruleObj.name : 'RSI Düşen Trend Kırılımı';
                      const isDeleting = deletingId === item.id;

                      return (
                        <tr key={item.id} className="hover:bg-slate-800/25 transition-colors">
                          <td className="px-5 py-4 whitespace-nowrap">
                            <Link
                              href={`/detay/${item.symbol}`}
                              className="font-mono font-bold text-white hover:text-blue-400 transition-colors inline-flex items-center space-x-1 group"
                            >
                              <span>{item.symbol}</span>
                              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <span className="font-medium text-slate-200">{ruleTitle}</span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-amber-300">
                              {item.timeframe.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap font-mono text-slate-400 text-[11px]">
                            {formatDate(item.created_at)}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap font-mono text-slate-400 text-[11px]">
                            {item.last_triggered_at ? (
                              <span className="text-emerald-400 font-semibold">{formatDate(item.last_triggered_at)}</span>
                            ) : (
                              <span className="text-slate-500">Henüz tetiklenmedi</span>
                            )}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap text-right">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDeleteAlert(item.id, item.symbol)}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
                              title="Alarmı Sil"
                            >
                              {isDeleting ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}