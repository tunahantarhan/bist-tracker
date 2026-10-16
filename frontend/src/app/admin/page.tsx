'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, Settings, Users, LogOut, LayoutDashboard, LineChart,
  ArrowRight, Sliders, Database, Search, RefreshCw, TrendingUp, TrendingDown, 
  Filter, Calendar, X, Flame, Pencil, Sparkles, Check
} from 'lucide-react';
import RuleList from '@/components/rules/RuleList';
import CreateRuleDialog from '@/components/rules/CreateRuleDialog';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { 
  fetchMarketData, fetchUniverse, fetchRules, deleteRule, updateActiveUniverse, updateRule, MarketData 
} from '@/services/api';
import { Rule } from '@/types';

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
  const [selectedRules, setSelectedRules] = useState<number[]>([]);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const [universe, setUniverse] = useState<{ symbol: string; name: string }[]>([]);
  const [activeUniverseTokens, setActiveUniverseTokens] = useState<string[]>([]);
  const [isSavingUniverse, setIsSavingUniverse] = useState(false);

  const [previewSymbol, setPreviewSymbol] = useState('GARAN');
  const [previewConfig, setPreviewConfig] = useState<{ interval: string; period: string }>({
    interval: '4h', period: '6mo',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [previewData, setPreviewData] = useState<MarketData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const broadcastRuleUpdate = () => {
    try {
      const bc = new BroadcastChannel('bist_tracker_sync');
      bc.postMessage('RULES_UPDATED');
      bc.close();
    } catch (e) {
      console.warn('BroadcastChannel unsupported:', e);
    }
  };

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await fetchRules();
      setRules(data);
    } catch (error) {
      console.warn('Failed to load rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUniverse = async () => {
    try {
      const data = await fetchUniverse();
      setUniverse(data);
      setActiveUniverseTokens(data.map((d: any) => d.symbol));
    } catch (error) {
      console.warn('Failed to load universe:', error);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const isAdmin = localStorage.getItem('is_admin') === 'true';
    if (!token) {
      router.push('/auth');
      return;
    }
    if (!isAdmin) {
      router.push('/dashboard');
      return;
    }
    loadRules();
    loadUniverse();
  }, [router]);

  useEffect(() => {
    if (activeTab !== 'rules' || !previewSymbol) return;

    const controller = new AbortController();

    const loadPreview = async () => {
      setLoadingPreview(true);
      try {
        const data = await fetchMarketData(previewSymbol, previewConfig.interval, previewConfig.period, controller.signal);
        setPreviewData(data);
      } catch (error: any) {
        if (error?.name !== 'AbortError') console.warn('Preview fetch warning:', error?.message);
      } finally {
        if (!controller.signal.aborted) setLoadingPreview(false);
      }
    };

    loadPreview();
    return () => controller.abort();
  }, [activeTab, previewSymbol, previewConfig, rules]);

  const handleIntervalChange = (newInterval: string) => {
    setPreviewConfig((prev) => {
      let nextPeriod = prev.period;
      if (newInterval === '5m' || newInterval === '15m') nextPeriod = '1mo';
      else if ((newInterval === '1h' || newInterval === '4h') && prev.period === '5y') nextPeriod = '1y';
      return { interval: newInterval, period: nextPeriod };
    });
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPreviewConfig((prev) => {
      let nextInterval = prev.interval;
      if (newPeriod === '5y' && prev.interval !== '1d') nextInterval = '1d';
      else if (newPeriod !== '1mo' && (prev.interval === '5m' || prev.interval === '15m')) nextInterval = '4h';
      return { interval: nextInterval, period: newPeriod };
    });
  };

  const handleDeleteRule = async (id: number) => {
    const target = rules.find((r) => r.id === id);
    if (target?.is_primary_filter) {
      alert("Ana RSI Filtresi sistemin çekirdeğidir ve silinemez. Yalnızca pasife alabilir veya parametrelerini düzenleyebilirsiniz.");
      return;
    }
    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      setSelectedRules((prev) => prev.filter((rId) => rId !== id));
      broadcastRuleUpdate();
    } catch (error) {
      console.warn('Rule deletion failed:', error);
    }
  };

  const handleDeleteMultiple = async (ids: number[]) => {
    // Filter out primary filter from batch deletion
    const safeIds = ids.filter((id) => {
      const r = rules.find((rule) => rule.id === id);
      return !r?.is_primary_filter;
    });

    if (safeIds.length === 0) return;

    try {
      await Promise.all(safeIds.map((id) => deleteRule(id)));
      setRules((prev) => prev.filter((r) => r.id === undefined || !safeIds.includes(r.id)));
      setSelectedRules([]);
      broadcastRuleUpdate();
    } catch (error) {
      console.warn('Batch deletion failed:', error);
    }
  };

  const handleToggleRule = async (id: number, isActive: boolean) => {
    const target = rules.find((r) => r.id === id);
    if (!target) return;
    try {
      await updateRule(id, { ...target, is_active: isActive });
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: isActive } : r)));
      broadcastRuleUpdate();
    } catch (error) {
      console.warn('Toggle status update failed:', error);
    }
  };

  const handleEditRule = (rule: Rule) => {
    setEditingRule(rule);
    setIsEditOpen(true);
  };

  const handleRuleSaved = () => {
    loadRules();
    broadcastRuleUpdate();
  };

  const toggleUniverseStock = (sym: string) => {
    setActiveUniverseTokens((prev) => prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]);
  };

  const handleSaveUniverse = async () => {
    setIsSavingUniverse(true);
    try {
      await updateActiveUniverse(activeUniverseTokens);
      alert("BIST Evreni başarıyla güncellendi! Arka plan tarayıcısı yeni listeyi işleyecek.");
    } catch (err) {
      console.error(err);
      alert("Evren güncellenirken bir hata oluştu.");
    } finally {
      setIsSavingUniverse(false);
    }
  };

  const filteredUniverse = universe.filter(item =>
    item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedStockInfo = universe.find((u) => u.symbol === previewSymbol);

  // Separate Primary Core Filter and Regular Scoring Rules
  const primaryRule = rules.find((r) => r.is_primary_filter);
  const scoringRules = rules.filter((r) => !r.is_primary_filter);

  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'rules': return { title: 'Kural Motoru Yönetimi & Canlı Simülasyon', subtitle: 'Ana kapı filtresini ve çoklu zaman dilimli ek skor kurallarını yönetin.' };
      case 'users': return { title: 'Kullanıcı Yönetimi', subtitle: 'Kayıtlı kullanıcıları ve abonelik paketlerini görüntüleyin.' };
      case 'settings': return { title: 'Sistem Ayarları & BIST Evreni', subtitle: 'BIST hisse evrenini ve tarama listesini yapılandırın.' };
      default: return { title: 'Yönetim Merkezi', subtitle: 'BIST Tracker sistem yönetimi ve algoritmik kontrol paneli.' };
    }
  };

  const headerInfo = getHeaderInfo();
  
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_slug');
    localStorage.removeItem('is_admin');
    window.location.href = '/auth';
  };

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-[#0b0e14] text-slate-200 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800/80 bg-[#12161f] flex flex-col shrink-0 z-40">
        <div className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-slate-800/80 shrink-0">
          <div 
            onClick={() => setActiveTab(null)}
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center shadow-[0_0_12px_#059669] transition-transform duration-300 group-hover:scale-105">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-slate-100 tracking-tight transition-colors duration-200 group-hover:text-emerald-400">
              Admin Panel
            </span>
          </div>
          <button onClick={handleLogout} className="md:hidden p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg">
             <LogOut className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-row md:flex-col overflow-x-auto p-3 md:py-6 md:px-4 space-x-2 md:space-x-0 md:space-y-2 scrollbar-hide shrink-0">
          <button 
            type="button"
            onClick={() => { window.location.href = '/dashboard'; }} 
            className="shrink-0 whitespace-nowrap w-auto md:w-full flex items-center space-x-3 px-4 py-2.5 md:py-3 rounded-lg text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 transition-all duration-200 cursor-pointer"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="text-sm font-medium">Kullanıcı Ekranı</span>
          </button>

          <div className="hidden md:block my-2 border-t border-slate-800/60" />
          
          <button 
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`shrink-0 whitespace-nowrap w-auto md:w-full flex items-center space-x-3 px-4 py-2.5 md:py-3 rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === 'rules'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                : 'border border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span className="text-sm font-medium">Kural Motoru</span>
          </button>

          <button 
            type="button"
            onClick={() => setActiveTab('users')}
            className={`shrink-0 whitespace-nowrap w-auto md:w-full flex items-center space-x-3 px-4 py-2.5 md:py-3 rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                : 'border border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
            }`}
          >
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">Kullanıcılar</span>
          </button>

          <button 
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`shrink-0 whitespace-nowrap w-auto md:w-full flex items-center space-x-3 px-4 py-2.5 md:py-3 rounded-lg transition-all duration-200 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                : 'border border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span className="text-sm font-medium">Sistem Ayarları</span>
          </button>
        </nav>

        <div className="hidden md:block p-4 border-t border-slate-800/80 mt-auto">
          <button 
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg bg-rose-950/25 border border-rose-500/10 text-rose-400 hover:bg-rose-900/40 hover:border-rose-500/30 hover:text-rose-200 transition-all duration-200 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-auto md:h-16 py-3 md:py-0 flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-8 border-b border-slate-800/80 bg-[#0b0e14]/80 backdrop-blur-md shrink-0 gap-3 md:gap-0">
          <div>
            <h1 className="text-base md:text-lg font-semibold text-slate-100">{headerInfo.title}</h1>
            <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">{headerInfo.subtitle}</p>
          </div>
          
          {activeTab === 'rules' && (
            <CreateRuleDialog onRuleCreated={handleRuleSaved} />
          )}
        </header>

        <CreateRuleDialog 
          isOpen={isEditOpen} 
          onOpenChange={setIsEditOpen} 
          editingRule={editingRule} 
          onRuleCreated={handleRuleSaved} 
        />

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {activeTab === null && (
            <div className="max-w-5xl mx-auto mt-4 md:mt-8 space-y-8">
              <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#12161f] to-[#0f131a] p-6 md:p-8 shadow-2xl">
                <div className="inline-flex items-center space-x-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400 mb-4">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Sistem Yöneticisi Erişimi Aktif</span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-100">
                  Admin Paneline Hoş Geldiniz
                </h2>
                <p className="text-xs md:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
                  Bu panel üzerinden BIST Tracker platformunun ana elek filtresini ve algoritmik skorlama kurallarını dinamik olarak yapılandırabilir, 
                  RSI düşen trend kırılımlarını ve hareketli ortalama kesişimlerini canlı grafiklerde test edebilirsiniz.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-6 md:mt-8">
                  <div 
                    onClick={() => setActiveTab('rules')}
                    className="group rounded-xl border border-slate-800 bg-[#161b26]/70 p-5 hover:border-blue-500/40 hover:bg-[#1a202e] transition-all duration-200 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="h-10 w-10 rounded-lg bg-blue-600/15 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
                        <Sliders className="h-5 w-5" />
                      </div>
                      <h3 className="text-sm md:text-base font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
                        Kural Motoru & İndikatörler
                      </h3>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Ana RSI Filtresi, hareketli ortalamalar ve dinamik puanlama ağırlıklarını yönetin.
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
                      <h3 className="text-sm md:text-base font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors">
                        Kullanıcılar & Paketler
                      </h3>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Kullanıcı listesini, Ücretsiz/Standart/Premium paket limitlerini ve yönetici izinlerini inceleyin.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-medium text-emerald-400">
                      <span>Kullanıcı Yönetimi</span>
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
                      <h3 className="text-sm md:text-base font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
                        Hisse Evreni & Ayarlar
                      </h3>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Takip edilen BIST hisse listesini, arka plan tarama sıklığını ve bildirim servislerini yönetin.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-medium text-amber-400">
                      <span>Sistem Ayarları</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="max-w-[1440px] mx-auto flex flex-col xl:flex-row gap-6 md:gap-8 items-start">
              
              {/* Left Column: Protected Core Filter Card + Scoring Rules List */}
              <div className="w-full xl:w-5/12 space-y-6 shrink-0">
                
                {/* 1. MASTER PROTECTED PRIMARY FILTER CARD */}
                {primaryRule && (
                  <div className="rounded-xl border border-amber-500/35 bg-gradient-to-b from-[#181d29] to-[#12161f] shadow-2xl p-4 sm:p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

                    <div className="flex items-center justify-between border-b border-amber-500/20 pb-3.5 mb-3.5">
                      <div className="flex items-center space-x-2.5">
                        <div className="h-7 w-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                          <Flame className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase font-mono">
                              Sistem Ana Kapı Filtresi
                            </span>
                            <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-mono font-semibold text-amber-300">
                              Çekirdek Kural
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Hisselerin bildirim tetiklemesi ve taranması için geçmesi gereken zorunlu ilk elek
                          </p>
                        </div>
                      </div>

                      {/* Active/Inactive Toggle */}
                      <button
                        type="button"
                        onClick={() => primaryRule.id && handleToggleRule(primaryRule.id, !primaryRule.is_active)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          primaryRule.is_active ? 'bg-amber-500' : 'bg-slate-700'
                        }`}
                        title={primaryRule.is_active ? "Ana Filtreyi Pasife Al" : "Ana Filtreyi Aktifleştir"}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                            primaryRule.is_active ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-100 leading-snug">
                            {primaryRule.name}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {primaryRule.description || "4S RSI (14) düşen direnç trendini yukarı kırmış olmalı."}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleEditRule(primaryRule)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all cursor-pointer shrink-0"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Parametreleri Düzenle</span>
                        </button>
                      </div>

                      {/* Primary Filter Live Parameters Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px]">
                        <div className="p-2 rounded-lg bg-[#161b26] border border-slate-800 flex flex-col">
                          <span className="text-slate-500">Periyot</span>
                          <span className="text-amber-400 font-bold mt-0.5">{primaryRule.timeframe?.toUpperCase() || '4S'}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#161b26] border border-slate-800 flex flex-col">
                          <span className="text-slate-500">Maks. Dip RSI (Eşik)</span>
                          <span className="text-amber-300 font-bold mt-0.5">
                            0 - {primaryRule.indicator_2_params?.max_trend_end ?? 30}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#161b26] border border-slate-800 flex flex-col">
                          <span className="text-slate-500">Min. Tepe / Bar</span>
                          <span className="text-slate-200 font-bold mt-0.5">
                            {primaryRule.indicator_2_params?.min_peak ?? 55} RSI / {primaryRule.indicator_2_params?.lookback ?? 60}M
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-[#161b26] border border-slate-800 flex flex-col">
                          <span className="text-slate-500">Skor Katkısı</span>
                          <span className="text-emerald-400 font-bold mt-0.5">+{Number(primaryRule.score_impact).toFixed(2)} Puan</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. REGULAR SCORING RULES LIST */}
                {loading ? (
                  <div className="h-64 flex items-center justify-center border border-slate-800/80 rounded-xl bg-[#12161f]/50 text-sm text-slate-500">
                    Kurallar yükleniyor...
                  </div>
                ) : (
                  <RuleList 
                    rules={scoringRules} 
                    onDeleteRule={handleDeleteRule} 
                    onDeleteMultiple={handleDeleteMultiple}
                    onSelectRules={setSelectedRules}
                    selectedRules={selectedRules}
                    onEditRule={handleEditRule}
                    onToggleRule={handleToggleRule}
                  />
                )}
              </div>

              {/* Right Column: Chart Preview */}
              <div className="w-full xl:w-7/12 space-y-6">
                <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-4 md:p-6 shadow-2xl backdrop-blur-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <LineChart className="h-5 w-5 text-blue-400" />
                        <h3 className="text-sm font-semibold tracking-wider text-slate-200 uppercase">
                          Görsel Önizleme & Kural Testi
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Mum periyodunu ve tarihsel menzili seçerek RSI düşen trend kırılımını test edin.
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
                            onClick={() => handleIntervalChange(tf.value)}
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
                            onClick={() => handlePeriodChange(p.value)}
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

                  <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161b26] p-3 md:p-4 rounded-xl border border-slate-800/90 mb-5">
                    <div>
                      <div className="flex items-center space-x-2.5">
                        <span className="font-mono text-xl font-bold text-white">{previewSymbol}</span>
                        <span className="text-xs text-slate-400 font-medium">
                          {selectedStockInfo?.name || ''}
                        </span>
                        <span className="text-[10px] font-mono uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded hidden sm:inline-block">
                          {previewConfig.interval.toUpperCase()} / {previewConfig.period.toUpperCase()}
                        </span>
                      </div>
                      {previewData && !loadingPreview && (
                        <div className="flex items-center space-x-3 mt-1">
                          <span className="font-mono text-base font-semibold text-slate-200">
                            ₺{previewData.current_price.toFixed(2)}
                          </span>
                          <span className={`inline-flex items-center space-x-1 font-mono text-xs font-semibold ${
                            previewData.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {previewData.change_pct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            <span>{previewData.change_pct >= 0 ? '+' : ''}{previewData.change_pct}%</span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-3">
                      {previewData?.has_primary_filter && (
                        <div className={`px-2 md:px-3 py-1.5 rounded-lg border text-[10px] md:text-xs font-mono font-semibold flex items-center space-x-1.5 ${
                          previewData.primary_filter_passed
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          <Filter className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{previewData.primary_filter_passed ? 'Ana Filtreyi Geçti' : 'Ana Filtreye Takıldı'}</span>
                          <span className="sm:hidden">{previewData.primary_filter_passed ? 'OK' : 'BEKLE'}</span>
                        </div>
                      )}

                      <div className="px-3 py-1.5 md:px-3.5 md:py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 font-mono text-base md:text-lg font-bold text-emerald-400">
                        {previewData?.score !== undefined ? previewData.score.toFixed(2) : '0.00'}
                        <span className="text-[10px] md:text-xs text-slate-400 font-normal ml-0.5">/ 100</span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full rounded-xl border border-slate-800/80 bg-[#0b0e14]/60 p-2 md:p-3 min-h-[350px] md:min-h-[460px] flex items-center justify-center">
                    {loadingPreview ? (
                      <div className="flex items-center space-x-2 text-sm font-mono text-slate-400">
                        <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                        <span>{previewSymbol} yükleniyor...</span>
                      </div>
                    ) : previewData?.candles ? (
                      <ChartWrapper
                        candles={previewData.candles}
                        indicators={previewData.indicators}
                        rsiPane={previewData.rsi_pane}
                        height={300}
                      />
                    ) : (
                      <span className="text-sm text-slate-500">Grafik verisi bulunamadı.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-6 md:p-8 shadow-2xl backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5 mb-6">
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-100 flex items-center space-x-2">
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
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-colors cursor-pointer"
                  >
                    {isSavingUniverse ? 'Kaydediliyor...' : 'Evreni Kaydet'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 md:gap-2.5 justify-center mt-6 md:mt-8 pb-4">
                  {universe.map((item) => {
                    const sym = item.symbol;
                    const isActive = activeUniverseTokens.includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        title={item.name}
                        onClick={() => toggleUniverseStock(sym)}
                        className={`flex items-center justify-between space-x-1 md:space-x-2 px-2.5 py-1 md:px-3 md:py-1.5 rounded-md text-[10px] md:text-[11px] font-mono font-bold transition-all duration-200 cursor-pointer ${
                          isActive 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.15)]' 
                            : 'bg-[#e2e8f0]/90 text-slate-800 border border-transparent hover:bg-white'
                        }`}
                      >
                        <span className="tracking-wide">{sym}</span>
                        {isActive ? <X className="h-3 w-3 opacity-70" /> : <span className="text-slate-500 opacity-60 text-lg leading-none mb-0.5">+</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="max-w-4xl mx-auto rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-8 md:p-12 text-center">
              <Users className="h-10 w-10 md:h-12 md:w-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm md:text-base font-semibold text-slate-200">Kullanıcı Yönetimi Modülü</h3>
              <p className="text-[10px] md:text-xs text-slate-500 mt-1">Kural motoru testleri tamamlandıktan sonra bu ekran aktif edilecektir.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}