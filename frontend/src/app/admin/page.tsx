'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, 
  Settings, 
  Users, 
  LogOut, 
  LayoutDashboard, 
  LineChart,
  ArrowRight,
  Sliders,
  Database,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Filter,
  Calendar,
  X
} from 'lucide-react';
import RuleList from '@/components/rules/RuleList';
import CreateRuleDialog from '@/components/rules/CreateRuleDialog';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { fetchMarketData, fetchUniverse, fetchRules, deleteRule, updateActiveUniverse, MarketData } from '@/services/api';
import { Rule } from '@/types';

type AdminTab = 'rules' | 'users' | 'settings' | null;

const CHART_INTERVALS = [
  { value: '5m', label: '5Dk' },
  { value: '15m', label: '15Dk' },
  { value: '1h', label: '1S' },
  { value: '4h', label: '4S' },
  { value: '1d', label: '1G' },
];

const CHART_PERIODS = [
  { value: '1mo', label: '1A' },
  { value: '3mo', label: '3A' },
  { value: '6mo', label: '6A' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '5y', label: '5Y' },
];

const BIST_UNIVERSE_FULL = [
  "THYAO", "GARAN", "AKBNK", "ISCTR", "TUPRS", "KCHOL", "SAHOL", "ASELS", "BIMAS", "EREGL", 
  "SISE", "FROTO", "YKBNK", "TOASO", "ENKAI", "PETKM", "PGSUS", "TCELL", "TTKOM", "VAKBN", 
  "HALKB", "EKGYO", "DOHOL", "HEKTS", "SASA", "GUBRF", "ODAS", "KRDMD", 
  "ALARK", "TAVHL", "DOAS", "OYAKC", "SOKM", "MGROS", "AEFES", "TKFEN", "ISGYO", "ENJSA",
  "ASTOR", "EUPWR", "CWENE", "KMPUR", "SMRTG", "GESAN", "ALFAS", "MIATK", "YEOTK", "KONTR", "CRDFA"
];

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  const [universe, setUniverse] = useState<{ symbol: string; name: string }[]>([]);
  const [activeUniverseTokens, setActiveUniverseTokens] = useState<string[]>([]);
  const [isSavingUniverse, setIsSavingUniverse] = useState(false);

  const [previewSymbol, setPreviewSymbol] = useState('GARAN');
  const [previewConfig, setPreviewConfig] = useState<{ interval: string; period: string }>({
    interval: '4h',
    period: '6mo',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [previewData, setPreviewData] = useState<MarketData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await fetchRules();
      setRules(data);
    } catch (error) {
      console.warn('Failed to fetch rules:', error);
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
      console.warn('Failed to load stock universe:', error);
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
        const data = await fetchMarketData(
          previewSymbol,
          previewConfig.interval,
          previewConfig.period,
          controller.signal
        );
        setPreviewData(data);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.warn('Preview data could not be loaded:', error?.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPreview(false);
        }
      }
    };

    loadPreview();
    return () => controller.abort();
  }, [activeTab, previewSymbol, previewConfig, rules.length]);

  const handleIntervalChange = (newInterval: string) => {
    setPreviewConfig((prev) => {
      let nextPeriod = prev.period;
      if (newInterval === '5m' || newInterval === '15m') {
        nextPeriod = '1mo';
      } else if ((newInterval === '1h' || newInterval === '4h') && prev.period === '5y') {
        nextPeriod = '1y';
      }
      return { interval: newInterval, period: nextPeriod };
    });
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPreviewConfig((prev) => {
      let nextInterval = prev.interval;
      if (newPeriod === '5y' && prev.interval !== '1d') {
        nextInterval = '1d';
      } else if (newPeriod !== '1mo' && (prev.interval === '5m' || prev.interval === '15m')) {
        nextInterval = '4h';
      }
      return { interval: nextInterval, period: newPeriod };
    });
  };

  const handleDeleteRule = async (id: number) => {
    if (!window.confirm('Bu kuralı silmek istediğinize emin misiniz?')) return;
    
    try {
      await deleteRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.warn('Failed to delete rule:', error);
    }
  };

  const toggleUniverseStock = (sym: string) => {
    setActiveUniverseTokens(prev => 
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );
  };

  const handleSaveUniverse = async () => {
    setIsSavingUniverse(true);
    try {
      if (updateActiveUniverse) {
        await updateActiveUniverse(activeUniverseTokens);
        alert("BIST Evreni başarıyla güncellendi! Arka plan tarayıcısı yeni listeyi işleyecek.");
      }
    } catch (err) {
      console.error(err);
      alert("Evren güncellenirken API modülü eksik olduğu için hata oluştu.");
    } finally {
      setIsSavingUniverse(false);
    }
  };

  const filteredUniverse = universe.filter(
    (item) =>
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedStockInfo = universe.find((u) => u.symbol === previewSymbol);

  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'rules':
        return { title: 'Kural Motoru Yönetimi & Canlı Simülasyon', subtitle: 'Çoklu zaman diliminde (5dk, 15dk, 4s, 1g) RSI düşen trend kırılımı ve hareketli ortalama kurallarını yönetin.' };
      case 'users':
        return { title: 'Kullanıcı Yönetimi', subtitle: 'Kayıtlı kullanıcıları, abonelik paketlerini ve yetkileri görüntüleyin.' };
      case 'settings':
        return { title: 'Sistem Ayarları & BIST Evreni', subtitle: 'BIST hisse evrenini, veri çekim periyotlarını ve tarama listesini yapılandırın.' };
      default:
        return { title: 'Yönetim Merkezi', subtitle: 'BIST Tracker sistem yönetimi ve algoritmik kontrol paneli.' };
    }
  };

  const headerInfo = getHeaderInfo();

  return (
    <div className="min-h-screen flex bg-[#0b0e14] text-slate-200 font-sans overflow-x-hidden">
      
      <aside className="w-64 border-r border-slate-800/80 bg-[#12161f] flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-800/80">
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
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
          <button 
            onClick={() => router.push('/dashboard')} 
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 hover:translate-x-1 transition-all duration-200 cursor-pointer"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="text-sm font-medium">Kullanıcı Ekranı</span>
          </button>

          <div className="my-2 border-t border-slate-800/60" />
          
          <button 
            onClick={() => setActiveTab('rules')}
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
            onClick={() => setActiveTab('users')}
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
            onClick={() => setActiveTab('settings')}
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
              localStorage.removeItem('access_token');
              localStorage.removeItem('user_slug');
              localStorage.removeItem('is_admin');
              router.push('/auth');
            }}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg bg-rose-950/25 border border-rose-500/10 text-rose-400 hover:bg-rose-900/40 hover:border-rose-500/30 hover:text-rose-200 transition-all duration-200 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Çıkış Yap</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        
        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-800/80 bg-[#0b0e14]/80 backdrop-blur-md">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">{headerInfo.title}</h1>
            <p className="text-xs text-slate-500">{headerInfo.subtitle}</p>
          </div>
          
          {activeTab === 'rules' && (
            <CreateRuleDialog onRuleCreated={loadRules} />
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          
          {activeTab === null && (
            <div className="max-w-5xl mx-auto mt-8 space-y-8">
              <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#12161f] to-[#0f131a] p-8 shadow-2xl">
                <div className="inline-flex items-center space-x-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400 mb-4">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Sistem Yöneticisi Erişimi Aktif</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-100">
                  Admin Paneline Hoş Geldiniz
                </h2>
                <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
                  Bu panel üzerinden BIST Tracker platformunun algoritmik skorlama kurallarını dinamik olarak yapılandırabilir, 
                  RSI düşen trend kırılımlarını ve hareketli ortalama kesişimlerini canlı grafiklerde test edebilirsiniz.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
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
                        4S RSI Düşen Trend Kırılımı (Mavi Çizgi), 5dk/15dk MA kesişimleri ve milimetrik puan ağırlıklarını yönetin.
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
                      <h3 className="text-base font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
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
            <div className="max-w-[1440px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              
              <div className="xl:col-span-5 space-y-6">
                {loading ? (
                  <div className="h-64 flex items-center justify-center border border-slate-800/80 rounded-xl bg-[#12161f]/50 text-sm text-slate-500">
                    Kurallar yükleniyor...
                  </div>
                ) : (
                  <RuleList rules={rules} onDeleteRule={handleDeleteRule} />
                )}
              </div>

              <div className="xl:col-span-7 space-y-6">
                <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-6 shadow-2xl backdrop-blur-md">
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <LineChart className="h-5 w-5 text-blue-400" />
                        <h3 className="text-sm font-semibold tracking-wider text-slate-200 uppercase">
                          Görsel Önizleme & Kural Testi
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Mum periyodunu ve tarihsel menzili (1A - 5Y) seçerek RSI mavi trend çizgisini inceleyin.
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

                  <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161b26] p-4 rounded-xl border border-slate-800/90 mb-5">
                    <div>
                      <div className="flex items-center space-x-2.5">
                        <span className="font-mono text-xl font-bold text-white">{previewSymbol}</span>
                        <span className="text-xs text-slate-400 font-medium">
                          {selectedStockInfo?.name || ''}
                        </span>
                        <span className="text-[10px] font-mono uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">
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
                        <div className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold flex items-center space-x-1.5 ${
                          previewData.primary_filter_passed
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          <Filter className="h-3.5 w-3.5" />
                          <span>{previewData.primary_filter_passed ? 'Ana Filtreyi Geçti' : 'Ana Filtreye Takıldı'}</span>
                        </div>
                      )}

                      <div className="px-3.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 font-mono text-lg font-bold text-emerald-400">
                        {previewData?.score !== undefined ? previewData.score.toFixed(2) : '0.00'}
                        <span className="text-xs text-slate-400 font-normal"> / 100</span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full rounded-xl border border-slate-800/80 bg-[#0b0e14]/60 p-3 min-h-[460px] flex items-center justify-center">
                    {loadingPreview ? (
                      <div className="flex items-center space-x-2 text-sm font-mono text-slate-400">
                        <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                        <span>{previewSymbol} ({previewConfig.interval} / {previewConfig.period}) verileri hesaplanıyor...</span>
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
              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-8 shadow-2xl backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
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
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-colors"
                  >
                    {isSavingUniverse ? 'Kaydediliyor...' : 'Evreni Kaydet'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2.5 justify-center mt-8 pb-4">
                  {BIST_UNIVERSE_FULL.map(sym => {
                    const isActive = activeUniverseTokens.includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => toggleUniverseStock(sym)}
                        className={`flex items-center justify-between space-x-2 px-3 py-1.5 rounded-md text-[11px] font-mono font-bold transition-all duration-200 cursor-pointer ${
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
            <div className="max-w-4xl mx-auto rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-12 text-center">
              <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-200">Kullanıcı Yönetimi Modülü</h3>
              <p className="text-xs text-slate-500 mt-1">Kural motoru testleri tamamlandıktan sonra bu ekran aktif edilecektir.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}