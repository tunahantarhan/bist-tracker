'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, 
  Settings, 
  Users, 
  LogOut, 
  LayoutDashboard, 
  Activity,
  LineChart,
  ArrowRight,
  Sliders,
  Database,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import RuleList from '@/components/rules/RuleList';
import CreateRuleDialog from '@/components/rules/CreateRuleDialog';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { fetchMarketData, fetchUniverse, MarketData } from '@/services/api';
import { Rule } from '@/types';

type AdminTab = 'rules' | 'users' | 'settings' | null;

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  // Universe & Searchable Preview Stock State
  const [universe, setUniverse] = useState<{ symbol: string; name: string }[]>([]);
  const [previewSymbol, setPreviewSymbol] = useState('GARAN');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Live Preview Market & Rule Evaluation Data
  const [previewData, setPreviewData] = useState<MarketData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Fetch all global rules
  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/rules');
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load stock universe for the searchable selector
  const loadUniverse = async () => {
    try {
      const data = await fetchUniverse();
      setUniverse(data);
    } catch (error) {
      console.error('Failed to load stock universe:', error);
    }
  };

  // Load market candles, indicator overlays, and live rule evaluation for the test stock
  const loadPreviewMarket = async (symbol: string) => {
    setLoadingPreview(true);
    try {
      const data = await fetchMarketData(symbol);
      setPreviewData(data);
    } catch (error) {
      console.error('Failed to load preview market data:', error);
    } finally {
      setLoadingPreview(false);
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

  // Reload live preview whenever previewSymbol or rules list changes
  useEffect(() => {
    if (activeTab === 'rules' && previewSymbol) {
      loadPreviewMarket(previewSymbol);
    }
  }, [activeTab, previewSymbol, rules.length]);

  // Delete a rule by ID and refresh preview
  const handleDeleteRule = async (id: number) => {
    if (!window.confirm('Bu kuralı silmek istediğinize emin misiniz?')) return;
    
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/v1/rules/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRules(prev => prev.filter(r => r.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete rule:', error);
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
        return {
          title: 'Kural Motoru Yönetimi & Canlı Simülasyon',
          subtitle: 'Sistem genelinde geçerli algoritmik skorlama kurallarını tanımlayın ve BIST hisseleri üzerinde test edin.'
        };
      case 'users':
        return {
          title: 'Kullanıcı Yönetimi',
          subtitle: 'Kayıtlı kullanıcıları, abonelik paketlerini ve yetkileri görüntüleyin.'
        };
      case 'settings':
        return {
          title: 'Sistem Ayarları',
          subtitle: 'BIST hisse evrenini, veri çekim periyotlarını ve bildirim kanallarını yapılandırın.'
        };
      default:
        return {
          title: 'Yönetim Merkezi',
          subtitle: 'BIST Tracker sistem yönetimi ve algoritmik kontrol paneli.'
        };
    }
  };

  const headerInfo = getHeaderInfo();

  return (
    <div className="min-h-screen flex bg-[#0b0e14] text-slate-200 font-sans">
      
      {/* Admin Sidebar */}
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
            <Activity className="h-4 w-4" />
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

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-800/80 bg-[#0b0e14]/80 backdrop-blur-md">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">{headerInfo.title}</h1>
            <p className="text-xs text-slate-500">{headerInfo.subtitle}</p>
          </div>
          
          {activeTab === 'rules' && (
            <CreateRuleDialog onRuleCreated={loadRules} />
          )}
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">
          
          {/* 1. WELCOME SCREEN */}
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
                  indikatör kesişimlerini canlı grafiklerde test edebilir ve sistem parametrelerini yönetebilirsiniz.
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
                        RSI, Stoch RSI, MACD, MA ve Bollinger kuralları ekleyin, milimetrik puan ağırlıklarını belirleyin.
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

          {/* 2. RULE ENGINE TAB (5 Cols Rule List / 7 Cols Wide Chart Preview) */}
          {activeTab === 'rules' && (
            <div className="max-w-[1440px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              
              {/* Left Column (5 Cols): Rules List */}
              <div className="xl:col-span-5 space-y-6">
                {loading ? (
                  <div className="h-64 flex items-center justify-center border border-slate-800/80 rounded-xl bg-[#12161f]/50 text-sm text-slate-500">
                    Kurallar yükleniyor...
                  </div>
                ) : (
                  <RuleList rules={rules} onDeleteRule={handleDeleteRule} />
                )}
              </div>

              {/* Right Column (7 Cols): Wide Live Chart Preview & Rule Simulation */}
              <div className="xl:col-span-7 space-y-6">
                <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-6 shadow-2xl backdrop-blur-md">
                  
                  {/* Top Bar: Title & Searchable Universe Stock Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5 mb-5">
                    <div>
                      <div className="flex items-center space-x-2">
                        <LineChart className="h-5 w-5 text-blue-400" />
                        <h3 className="text-sm font-semibold tracking-wider text-slate-200 uppercase">
                          Görsel Önizleme & Kural Testi
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Hisse evreninden bir sembol seçerek aktif kuralları ve indikatör kesişimlerini canlı simüle edin.
                      </p>
                    </div>

                    {/* Searchable Stock Selector */}
                    <div className="relative w-full sm:w-72">
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
                          className="w-full rounded-lg border border-slate-700/80 bg-[#161b26] py-2 pl-9 pr-3 text-xs font-mono text-slate-100 placeholder:text-slate-300 focus:border-blue-500 focus:outline-none transition-colors"
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
                                <span className="text-slate-400 truncate max-w-[160px]">{item.name}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selected Stock Price & Total Simulated Score Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161b26] p-4 rounded-xl border border-slate-800/90 mb-5">
                    <div>
                      <div className="flex items-center space-x-2.5">
                        <span className="font-mono text-xl font-bold text-white">{previewSymbol}</span>
                        <span className="text-xs text-slate-400 font-medium">
                          {selectedStockInfo?.name || ''}
                        </span>
                        <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                          1 Yıllık Günlük (1D)
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
                      <div className="text-right">
                        <div className="text-[11px] uppercase tracking-wider text-slate-400">Toplam Algoritmik Skor</div>
                        <div className="text-xs text-slate-500">Aktif kuralların anlık sonucu</div>
                      </div>
                      <div className="px-3.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 font-mono text-lg font-bold text-emerald-400">
                        {previewData?.score !== undefined ? previewData.score.toFixed(2) : '0.00'}
                        <span className="text-xs text-slate-400 font-normal"> / 100</span>
                      </div>
                    </div>
                  </div>

                  {/* Lightweight Charts with Indicator Overlays */}
                  <div className="w-full rounded-xl border border-slate-800/80 bg-[#0b0e14]/60 p-3 min-h-[400px] flex items-center justify-center">
                    {loadingPreview ? (
                      <div className="flex items-center space-x-2 text-sm font-mono text-slate-400">
                        <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                        <span>{previewSymbol} verileri ve indikatörler hesaplanıyor...</span>
                      </div>
                    ) : previewData?.candles ? (
                      <ChartWrapper
                        candles={previewData.candles}
                        indicators={previewData.indicators}
                        height={380}
                      />
                    ) : (
                      <span className="text-sm text-slate-500">Grafik verisi bulunamadı.</span>
                    )}
                  </div>

                  {/* Live Rule Evaluation Breakdown */}
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {previewSymbol} İçin Kural Değerlendirme Detayı
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        (MA ve Bollinger grafiğe çizilir, RSI/MACD değerleri aşağıda listelenir)
                      </span>
                    </div>

                    {!previewData?.rules_breakdown || previewData.rules_breakdown.length === 0 ? (
                      <div className="p-4 rounded-lg border border-slate-800 bg-[#161b26]/50 text-xs text-slate-500 text-center">
                        Henüz aktif kural bulunmuyor. Sağ üstten yeni bir kural ekleyerek simülasyonu başlatın.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {previewData.rules_breakdown.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-[#161b26]/80 border border-slate-800/80"
                          >
                            <div className="flex items-center space-x-3">
                              {item.is_met ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-slate-600 shrink-0" />
                              )}
                              <div>
                                <div className={`text-xs font-semibold ${item.is_met ? 'text-slate-100' : 'text-slate-400'}`}>
                                  {item.name}
                                </div>
                                {item.current_value !== undefined && (
                                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                    Anlık Değer: <span className="text-slate-300">{item.current_value}</span> | Hedef: <span className="text-slate-300">{item.target_value}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded ${
                              item.is_met
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-800/60 text-slate-500'
                            }`}>
                              {item.is_met ? `+${item.earned_score.toFixed(2)} Puan` : '0.00 Puan'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* 3. USERS TAB PLACEHOLDER */}
          {activeTab === 'users' && (
            <div className="max-w-4xl mx-auto rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-12 text-center">
              <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-200">Kullanıcı Yönetimi Modülü</h3>
              <p className="text-xs text-slate-500 mt-1">Kural motoru testleri tamamlandıktan sonra bu ekran aktif edilecektir.</p>
            </div>
          )}

          {/* 4. SETTINGS TAB PLACEHOLDER */}
          {activeTab === 'settings' && (
            <div className="max-w-4xl mx-auto rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-12 text-center">
              <Settings className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-200">Sistem ve Hisse Evreni Ayarları</h3>
              <p className="text-xs text-slate-500 mt-1">BIST450 hisse seçim arayüzü ilerleyen aşamada buraya entegre edilecektir.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}