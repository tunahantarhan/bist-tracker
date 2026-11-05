'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, Settings, Users, LogOut, LayoutDashboard, LineChart, 
  ArrowRight, Sliders, Database, Search, RefreshCw,
  Calendar, X, Shield, UserCheck, UserX, Menu
} from 'lucide-react';
import RuleList from '@/components/rules/RuleList';
import CreateRuleDialog from '@/components/rules/CreateRuleDialog';
import PrimaryFilterCard from '@/components/rules/PrimaryFilterCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { 
  fetchMarketData, fetchUniverse, fetchActiveUniverse, fetchRules, deleteRule, updateRule,
  updateActiveUniverse, MarketData, fetchAdminStats, 
  fetchAdminUsers, updateAdminUser, AdminStats, AdminUserItem 
} from '@/services/api';
import { Rule } from '@/types';
import { clearSession, getAccessToken, isAdminSession } from '@/lib/auth';

type AdminTab = 'rules' | 'users' | 'settings' | null;

const CHART_INTERVALS = [
  { value: '5m', label: '5Dk' }, { value: '15m', label: '15Dk' },
  { value: '1h', label: '1S' }, { value: '4h', label: '4S' }, { value: '1d', label: '1G' },
];

const CHART_PERIODS = [
  { value: '1mo', label: '1A' }, { value: '3mo', label: '3A' },
  { value: '6mo', label: '6A' }, { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' }, { value: '5y', label: '5Y' },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
  // Rule being edited in the dialog (null = dialog closed)
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  // Mobile drawer state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Platform Metrics
  const [stats, setStats] = useState<AdminStats>({ total_users: 0, active_stocks: 0, active_rules: 0 });

  // User Management State
  const [usersList, setUsersList] = useState<AdminUserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);

  // Universe & Chart Preview State
  const [universe, setUniverse] = useState<{ symbol: string; name: string }[]>([]);
  const [activeUniverseTokens, setActiveUniverseTokens] = useState<string[]>([]);
  const [isSavingUniverse, setIsSavingUniverse] = useState(false);
  const [universeQuery, setUniverseQuery] = useState('');

  const [previewSymbol, setPreviewSymbol] = useState('GARAN');
  const [previewConfig, setPreviewConfig] = useState<{ interval: string; period: string }>({
    interval: '4h', period: '6mo',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [previewData, setPreviewData] = useState<MarketData | null>(null);
  // The spinner shows until data for the current symbol/interval/period has arrived
  const [loadedPreviewKey, setLoadedPreviewKey] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      const data = await fetchAdminStats();
      setStats(data);
    } catch (e) {
      console.warn('Stats fetch warning:', e);
    }
  };

  // Reload after mutations (initial load happens in the mount effect)
  const loadRules = async () => {
    try {
      setRules(await fetchRules());
    } catch (error) {
      console.warn('Kurallar alınamadı:', error);
    }
  };

  useEffect(() => {
    if (!getAccessToken()) {
      router.push('/giris');
      return;
    }
    if (!isAdminSession()) {
      router.push('/ana-sayfa');
      return;
    }
    fetchRules()
      .then(setRules)
      .catch((error) => console.warn('Kurallar alınamadı:', error))
      .finally(() => setLoading(false));
    fetchAdminStats().then(setStats).catch((e) => console.warn('Stats fetch warning:', e));
    // Catalog drives the selectable chips; the DB universe drives which ones are selected
    Promise.all([fetchUniverse(), fetchActiveUniverse()])
      .then(([catalog, active]) => {
        setUniverse(catalog);
        setActiveUniverseTokens(active);
      })
      .catch((error) => console.warn('Hisse evreni alınamadı:', error));
  }, [router]);

  useEffect(() => {
    if (activeTab !== 'users') return;
    fetchAdminUsers()
      .then(setUsersList)
      .catch((error) => console.warn('Kullanıcılar alınamadı:', error))
      .finally(() => setLoadingUsers(false));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'rules' || !previewSymbol) return;

    const controller = new AbortController();
    const key = `${previewSymbol}-${previewConfig.interval}-${previewConfig.period}`;
    const loadPreview = async () => {
      try {
        const data = await fetchMarketData(previewSymbol, previewConfig.interval, previewConfig.period, controller.signal);
        setPreviewData(data);
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) console.warn('Önizleme verisi alınamadı:', error);
      } finally {
        if (!controller.signal.aborted) setLoadedPreviewKey(key);
      }
    };

    loadPreview();
    return () => controller.abort();
  }, [activeTab, previewSymbol, previewConfig, rules]);

  const primaryRule = rules.find((r) => r.is_primary_filter) ?? null;
  const scoringRules = rules.filter((r) => !r.is_primary_filter);

  const refreshAfterRuleChange = () => {
    loadRules();
    loadStats();
  };

  const handleDeleteRules = async (ids: number[]) => {
    try {
      await Promise.all(ids.map((id) => deleteRule(id)));
      setSelectedRuleIds((prev) => prev.filter((id) => !ids.includes(id)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Kural silinemedi');
    } finally {
      refreshAfterRuleChange();
    }
  };

  const handleToggleRule = async (id: number, isActive: boolean) => {
    // Optimistic update; reverted by the reload if the request fails
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: isActive } : r)));
    try {
      await updateRule(id, { is_active: isActive });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Kural güncellenemedi');
    } finally {
      refreshAfterRuleChange();
    }
  };

  const handleSaveUniverse = async () => {
    setIsSavingUniverse(true);
    try {
      await updateActiveUniverse(activeUniverseTokens);
      await loadStats();
      alert('Hisse evreni başarıyla güncellendi!');
    } catch (e) {
      alert('Evren güncellenirken hata oluştu: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setIsSavingUniverse(false);
    }
  };

  const toggleUniverseStock = (sym: string) => {
    setActiveUniverseTokens((prev) => 
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const handleUpdateUserTier = async (userId: number, newTier: AdminUserItem['tier']) => {
    setUpdatingUserId(userId);
    try {
      await updateAdminUser(userId, { tier: newTier });
      setUsersList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, tier: newTier } : u))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Kullanıcı güncellenemedi');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleUserStatus = async (userId: number, currentStatus: boolean) => {
    setUpdatingUserId(userId);
    try {
      await updateAdminUser(userId, { is_active: !currentStatus });
      setUsersList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: !currentStatus } : u))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Kullanıcı güncellenemedi');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const universeQueryNorm = universeQuery.trim().toLocaleLowerCase('tr-TR');
  // Chips shown in the universe tab (filtered by the tab's own search box)
  const universeChips = universeQueryNorm
    ? universe.filter((u) => u.symbol.toLocaleLowerCase('tr-TR').includes(universeQueryNorm) || u.name.toLocaleLowerCase('tr-TR').includes(universeQueryNorm))
    : universe;

  const filteredUsers = usersList.filter((u) => {
    const q = userSearchQuery.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q)
    );
  });

  const selectedStockInfo = universe.find((u) => u.symbol === previewSymbol);
  const loadingPreview = loadedPreviewKey !== `${previewSymbol}-${previewConfig.interval}-${previewConfig.period}`;
  const filteredUniverse = universe.filter((u) => {
    const q = searchQuery.toLowerCase();
    return u.symbol.toLowerCase().includes(q) || u.name.toLowerCase().includes(q);
  });

  const headerInfo = {
    rules: { title: 'Kural Motoru', subtitle: 'Teknik kuralları, eşik değerlerini ve ağırlıkları yönetin.' },
    users: { title: 'Kullanıcı Yönetimi', subtitle: 'Kayıtlı kullanıcıları ve abonelik paketlerini yönetin.' },
    settings: { title: 'Sistem Ayarları', subtitle: 'Arka planda taranan BIST hisse havuzunu yapılandırın.' },
  }[activeTab || 'rules'] || { title: 'Admin Paneli', subtitle: 'BIST Tracker Sistem Kontrol Merkezi' };

  return (
    <div className="flex h-screen bg-[#0b0e14] text-slate-100 overflow-hidden font-sans">
      
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Responsive Left Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-800/80 bg-[#12161f] flex flex-col shrink-0 select-none transition-transform duration-300 ease-in-out
        md:static md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800/80">
          <div 
            onClick={() => { setActiveTab(null); setIsMobileMenuOpen(false); }}
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center shadow-[0_0_12px_#059669] transition-transform duration-300 group-hover:scale-105">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-slate-100 tracking-tight transition-colors duration-200 group-hover:text-emerald-400">
              Admin Panel
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
          <button 
            onClick={() => router.push('/ana-sayfa')} 
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 hover:translate-x-1 transition-all duration-200 cursor-pointer"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="text-sm font-medium">Kullanıcı Ekranı</span>
          </button>

          <div className="my-2 border-t border-slate-800/60" />
          
          <button 
            onClick={() => { setActiveTab('rules'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === 'rules'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 hover:translate-x-1'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span className="text-sm font-medium">Kural Motoru</span>
          </button>

          <button 
            onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 hover:translate-x-1'
            }`}
          >
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">Kullanıcılar</span>
          </button>

          <button 
            onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 hover:translate-x-1'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span className="text-sm font-medium">Sistem Ayarları</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800/80">
          <button 
            onClick={() => {
              clearSession();
              router.push('/giris');
            }}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg bg-rose-950/25 border border-rose-500/10 text-rose-400 hover:bg-rose-900/40 hover:border-rose-500/30 hover:text-rose-200 transition-all duration-200 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        
        {/* Top Header with Dynamic Platform Stats & Mobile Menu Trigger */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-8 border-b border-slate-800/80 bg-[#0b0e14]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors shrink-0"
              title="Menüyü Aç"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="truncate">
              <h1 className="text-base sm:text-lg font-semibold text-slate-100 truncate">{headerInfo.title}</h1>
              <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block truncate">{headerInfo.subtitle}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-3 select-none shrink-0">
            {/* Responsive Platform Stats */}
            <div className="hidden lg:flex items-center space-x-2 bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1 font-mono text-xs">
              <span className="text-slate-500">Kullanıcı:</span>
              <span className="font-bold text-slate-200">{stats.total_users}</span>
            </div>
            <div className="hidden sm:flex items-center space-x-2 bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1 font-mono text-xs">
              <span className="text-slate-500">Aktif Hisse:</span>
              <span className="font-bold text-cyan-400">{stats.active_stocks || activeUniverseTokens.length}</span>
            </div>
            <div className="flex items-center space-x-1.5 sm:space-x-2 bg-slate-900/60 border border-slate-800 rounded-lg px-2 sm:px-2.5 py-1 font-mono text-xs">
              <span className="text-slate-500 hidden sm:inline">Aktif Kural:</span>
              <span className="text-slate-500 sm:hidden">Kural:</span>
              <span className="font-bold text-emerald-400">{stats.active_rules || rules.length}</span>
            </div>

            {activeTab === 'rules' && (
              <CreateRuleDialog onRuleCreated={refreshAfterRuleChange} />
            )}
          </div>
        </header>

        {/* Shared edit dialog for the primary filter and scoring rules */}
        <CreateRuleDialog
          isOpen={editingRule !== null}
          onOpenChange={(open) => { if (!open) setEditingRule(null); }}
          editingRule={editingRule}
          onRuleCreated={refreshAfterRuleChange}
        />

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          
          {/* Welcome Dashboard View */}
          {activeTab === null && (
            <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
              <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#12161f] to-[#0f131a] p-5 sm:p-8 shadow-2xl">
                <div className="inline-flex items-center space-x-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400 mb-4">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Sistem Yöneticisi Erişimi Aktif</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
                  Admin Paneline Hoş Geldiniz
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
                  Bu panel üzerinden BIST Tracker platformunun kural motorunu, arka planda taranan aktif hisse evrenini ve kayıtlı kullanıcıların abonelik katmanlarını yönetebilirsiniz.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mt-6 sm:mt-8">
                  <div 
                    onClick={() => setActiveTab('rules')}
                    className="group rounded-xl border border-slate-800 bg-[#161b26]/70 p-5 hover:border-blue-500/40 hover:bg-[#1a202e] transition-all duration-200 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="h-10 w-10 rounded-lg bg-blue-600/15 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
                        <Sliders className="h-5 w-5" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
                        Kural Motoru & İndikatörler
                      </h3>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        RSI düşen direnç kırılımlarını, hareketli ortalama kesişimlerini ve puan ağırlıklarını yönetin.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-medium text-blue-400">
                      <span>{rules.length} Aktif Kural</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>

                  <div 
                    onClick={() => setActiveTab('users')}
                    className="group rounded-xl border border-slate-800 bg-[#161b26]/70 p-5 hover:border-emerald-500/40 hover:bg-[#1a202e] transition-all duration-200 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="h-10 w-10 rounded-lg bg-emerald-600/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
                        <Users className="h-5 w-5" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors">
                        Kullanıcılar & Paketler
                      </h3>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Kullanıcı listesini, Ücretsiz/Standart/Premium paket limitlerini ve hesap durumlarını yönetin.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-medium text-emerald-400">
                      <span>{stats.total_users} Kullanıcı</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>

                  <div 
                    onClick={() => setActiveTab('settings')}
                    className="group rounded-xl border border-slate-800 bg-[#161b26]/70 p-5 hover:border-amber-500/40 hover:bg-[#1a202e] transition-all duration-200 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="h-10 w-10 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
                        <Database className="h-5 w-5" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
                        Hisse Evreni & Ayarlar
                      </h3>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Arka planda taranacak BIST hisse havuzunu ve taranma periyotlarını belirleyin.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-medium text-amber-400">
                      <span>{activeUniverseTokens.length} Aktif Hisse</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rules Tab */}
          {activeTab === 'rules' && (
            <div className="max-w-[1440px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-6 sm:gap-8 items-start">
              <div className="xl:col-span-5 space-y-6">
                {loading ? (
                  <div className="h-64 flex items-center justify-center border border-slate-800/80 rounded-xl bg-[#12161f]/50 text-sm text-slate-500 font-mono">
                    Kurallar yükleniyor...
                  </div>
                ) : (
                  <>
                    {primaryRule && (
                      <PrimaryFilterCard rule={primaryRule} onEdit={setEditingRule} onToggle={handleToggleRule} />
                    )}
                    <RuleList
                      rules={scoringRules}
                      onDeleteRule={(id) => handleDeleteRules([id])}
                      onDeleteMultiple={handleDeleteRules}
                      onSelectRules={setSelectedRuleIds}
                      selectedRules={selectedRuleIds}
                      onEditRule={setEditingRule}
                      onToggleRule={handleToggleRule}
                    />
                  </>
                )}
              </div>

              <div className="xl:col-span-7 space-y-6">
                <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-4 sm:p-6 shadow-2xl backdrop-blur-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <LineChart className="h-5 w-5 text-blue-400" />
                        <h3 className="text-sm font-semibold tracking-wider text-slate-200 uppercase">
                          Görsel Önizleme & Kural Testi
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Mum periyodunu ve tarihsel menzili seçerek RSI mavi trend çizgisini inceleyin.
                      </p>
                    </div>

                    <div className="relative w-full sm:w-64">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onFocus={() => setIsSearchOpen(true)}
                          onBlur={() => setTimeout(() => setIsSearchOpen(false), 180)}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsSearchOpen(true);
                          }}
                          placeholder={`${previewSymbol} (${selectedStockInfo?.name || 'Hisse Ara...'})`}
                          className="w-full rounded-lg border border-slate-700/80 bg-[#161b26] py-1.5 pl-9 pr-3 text-xs font-mono text-slate-100 placeholder:text-slate-300 focus:border-blue-500 focus:outline-none transition-colors"
                        />
                      </div>

                      {isSearchOpen && (
                        <div className="absolute right-0 mt-1.5 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-[#1a202e] p-1 shadow-2xl z-50">
                          {filteredUniverse.length === 0 ? (
                            <div className="py-3 px-3 text-xs text-slate-500 text-center">
                              Hisse bulunamadı.
                            </div>
                          ) : (
                            filteredUniverse.map((item) => (
                              <button
                                key={item.symbol}
                                type="button"
                                onMouseDown={() => {
                                  setPreviewSymbol(item.symbol);
                                  setSearchQuery('');
                                  setIsSearchOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left text-xs transition-colors cursor-pointer ${
                                  previewSymbol === item.symbol
                                    ? 'bg-blue-600/20 text-blue-400 font-semibold'
                                    : 'text-slate-200 hover:bg-slate-800'
                                }`}
                              >
                                <span className="font-mono font-bold">{item.symbol}</span>
                                <span className="text-slate-400 truncate max-w-[140px]">{item.name}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-medium text-slate-400">Mum:</span>
                      <div className="flex items-center bg-[#161b26] p-1 rounded-lg border border-slate-800">
                        {CHART_INTERVALS.map((tf) => (
                          <button
                            key={tf.value}
                            type="button"
                            onClick={() => setPreviewConfig((p) => ({ ...p, interval: tf.value }))}
                            className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all cursor-pointer ${
                              previewConfig.interval === tf.value
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {tf.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-[11px] font-medium text-slate-400">Menzil:</span>
                      <div className="flex items-center bg-[#161b26] p-1 rounded-lg border border-slate-800">
                        {CHART_PERIODS.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setPreviewConfig((prev) => ({ ...prev, period: p.value }))}
                            className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all cursor-pointer ${
                              previewConfig.period === p.value
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="w-full rounded-xl border border-slate-800/80 bg-[#0b0e14]/60 p-3 min-h-[440px] flex items-center justify-center">
                    {loadingPreview ? (
                      <div className="flex items-center space-x-2 text-sm font-mono text-slate-400">
                        <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                        <span>{previewSymbol} verileri hesaplanıyor...</span>
                      </div>
                    ) : previewData?.candles ? (
                      <ChartWrapper
                        candles={previewData.candles}
                        indicators={previewData.indicators}
                        rsiPane={previewData.rsi_pane}
                        height={340}
                      />
                    ) : (
                      <span className="text-sm text-slate-500">Grafik verisi bulunamadı.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab (Full User Management Table) */}
          {activeTab === 'users' && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-4 sm:p-6 shadow-2xl backdrop-blur-md">
                
                {/* Search & Actions Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5 mb-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                      <Users className="h-5 w-5 text-emerald-400" />
                      <span>Kayıtlı Kullanıcı Listesi</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Kullanıcıların abonelik paketlerini ve hesap erişim durumlarını yönetin.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="E-posta veya isim ara..."
                      className="w-full rounded-lg border border-slate-700/80 bg-[#161b26] py-1.5 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Users Table */}
                {loadingUsers ? (
                  <div className="py-16 text-center text-xs font-mono text-slate-400 flex items-center justify-center space-x-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                    <span>Kullanıcı listesi yükleniyor...</span>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-500">
                    Kullanıcı bulunamadı.
                  </div>
                ) : (
                  <>
                  {/* Mobile: one card per user */}
                  <ul className="space-y-3 md:hidden">
                    {filteredUsers.map((user) => {
                      const isMutating = updatingUserId === user.id;
                      return (
                        <li key={user.id} className="rounded-xl border border-slate-800 bg-[#161b26]/60 p-3.5 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-slate-200">{user.email}</div>
                              <div className="text-[11px] text-slate-500">
                                {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'} · {user.created_at}
                              </div>
                            </div>
                            {user.is_admin && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-purple-300">
                                <Shield className="h-3 w-3" />
                                Yönetici
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              disabled={isMutating}
                              value={user.tier}
                              onChange={(e) => handleUpdateUserTier(user.id, e.target.value as AdminUserItem['tier'])}
                              className="min-w-0 flex-1 cursor-pointer rounded-md border border-slate-700 bg-[#12161f] px-2 py-2 font-mono text-[11px] font-bold text-slate-200 outline-none"
                            >
                              <option value="FREE">Ücretsiz (3 Hisse)</option>
                              <option value="STANDARD">Standart (10 Hisse)</option>
                              <option value="PREMIUM">Premium (50 Hisse)</option>
                            </select>
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => handleToggleUserStatus(user.id, user.is_active)}
                              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-2 text-[11px] font-semibold transition-colors ${
                                user.is_active
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                  : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                              }`}
                            >
                              {user.is_active ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                              {user.is_active ? 'Aktif' : 'Askıda'}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-left text-xs min-w-[640px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                          <th className="py-3 px-4">Kullanıcı</th>
                          <th className="py-3 px-4">Yetki</th>
                          <th className="py-3 px-4">Abonelik Paketi</th>
                          <th className="py-3 px-4">Durum</th>
                          <th className="py-3 px-4">Kayıt Tarihi</th>
                          <th className="py-3 px-4 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredUsers.map((user) => {
                          const isMutating = updatingUserId === user.id;

                          return (
                            <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                              {/* Email & Name */}
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-slate-200">{user.email}</div>
                                {(user.first_name || user.last_name) && (
                                  <div className="text-[11px] text-slate-500">
                                    {user.first_name} {user.last_name}
                                  </div>
                                )}
                              </td>

                              {/* Role */}
                              <td className="py-3.5 px-4">
                                {user.is_admin ? (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300">
                                    <Shield className="h-3 w-3" />
                                    <span>Yönetici</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700/60">
                                    Kullanıcı
                                  </span>
                                )}
                              </td>

                              {/* Subscription Tier Selector */}
                              <td className="py-3.5 px-4">
                                <select
                                  disabled={isMutating}
                                  value={user.tier}
                                  onChange={(e) => handleUpdateUserTier(user.id, e.target.value as AdminUserItem['tier'])}
                                  className={`rounded-md border px-2 py-1 text-[11px] font-mono font-bold outline-none cursor-pointer bg-[#161b26] transition-colors ${
                                    user.tier === 'PREMIUM'
                                      ? 'border-amber-500/40 text-amber-300'
                                      : user.tier === 'STANDARD'
                                      ? 'border-blue-500/40 text-blue-300'
                                      : 'border-slate-700 text-slate-400'
                                  }`}
                                >
                                  <option value="FREE">Ücretsiz (3 Hisse)</option>
                                  <option value="STANDARD">Standart (10 Hisse)</option>
                                  <option value="PREMIUM">Premium (50 Hisse)</option>
                                </select>
                              </td>

                              {/* Account Status */}
                              <td className="py-3.5 px-4">
                                <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                  user.is_active
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${user.is_active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                  <span>{user.is_active ? 'Aktif' : 'Askıda'}</span>
                                </span>
                              </td>

                              {/* Created At */}
                              <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                                {user.created_at}
                              </td>

                              {/* Toggle Status Action */}
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  onClick={() => handleToggleUserStatus(user.id, user.is_active)}
                                  title={user.is_active ? 'Hesabı Askıya Al' : 'Hesabı Aktifleştir'}
                                  className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                                    user.is_active
                                      ? 'border-rose-500/20 text-rose-400 hover:bg-rose-500/10'
                                      : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
                                  }`}
                                >
                                  {user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Universe Settings Tab */}
          {activeTab === 'settings' && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-4 sm:p-8 shadow-2xl backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5 mb-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center space-x-2">
                      <Database className="h-5 w-5 text-emerald-400" />
                      <span>BIST Hisse Evreni Seçimi</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Arka planda taranacak ve otomatik skorlanacak hisseleri belirleyin. Yeşil olanlar aktiftir.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveUniverse}
                    disabled={isSavingUniverse}
                    className="hidden cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-colors hover:bg-emerald-500 disabled:opacity-60 sm:inline-flex"
                  >
                    {isSavingUniverse ? 'Kaydediliyor...' : `Evreni Kaydet (${activeUniverseTokens.length})`}
                  </button>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={universeQuery}
                      onChange={(e) => setUniverseQuery(e.target.value)}
                      placeholder="Sembol veya şirket ara..."
                      className="w-full rounded-lg border border-slate-700/80 bg-[#161b26] py-2 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[11px] sm:justify-end">
                    <span className="font-mono text-slate-400">
                      <strong className="text-emerald-400">{activeUniverseTokens.length}</strong> / {universe.length} seçili
                    </span>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setActiveUniverseTokens(universe.map((u) => u.symbol))} className="cursor-pointer rounded-md border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800">
                        Tümü
                      </button>
                      <button type="button" onClick={() => setActiveUniverseTokens([])} className="cursor-pointer rounded-md border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800">
                        Temizle
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 sm:gap-2.5 justify-center mt-5 pb-4">
                  {universeChips.map((item) => {
                    const sym = item.symbol;
                    const isActive = activeUniverseTokens.includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        title={item.name}
                        onClick={() => toggleUniverseStock(sym)}
                        className={`flex items-center justify-between space-x-2 px-3 py-1.5 rounded-md text-[11px] font-mono font-bold transition-all duration-200 cursor-pointer ${
                          isActive 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.15)]' 
                            : 'bg-slate-800 text-slate-400 border border-slate-700/60 hover:bg-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <span className="tracking-wide">{sym}</span>
                        {isActive ? <X className="h-3 w-3 opacity-70" /> : <span className="text-slate-500 text-base leading-none mb-0.5">+</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Mobile: sticky save bar stays reachable while scrolling through ~100 chips */}
                <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-800 bg-[#12161f]/95 px-4 py-3 backdrop-blur sm:hidden">
                  <button
                    type="button"
                    onClick={handleSaveUniverse}
                    disabled={isSavingUniverse}
                    className="w-full cursor-pointer rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {isSavingUniverse ? 'Kaydediliyor...' : `Evreni Kaydet (${activeUniverseTokens.length})`}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}