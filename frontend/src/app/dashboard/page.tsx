'use client';

import { useState, useEffect } from 'react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NotificationBell from '@/components/notifications/NotificationBell';
import StockSearch from '@/components/ui/StockSearch';
import { fetchMarketData, MarketData, fetchWatchlist, addToWatchlist, removeFromWatchlist } from '@/services/api';
import { User, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, XCircle, AlertCircle, Activity, Trash2, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StockTicker from '@/components/ui/StockTicker';

// Company Name Mapping for Display Purposes
// TODO: Will be selected from backend in the future, currently hardcoded for MVP
const TICKER_NAMES: Record<string, string> = {
  "THYAO": "Türk Hava Yolları A.O.",
  "KCHOL": "Koç Holding A.Ş.",
  "GARAN": "Garanti BBVA",
  "ASELS": "Aselsan Elektronik",
  "BIMAS": "BİM Birleşik Mağazalar",
  "TUPRS": "Tüpraş",
  "ISCTR": "Türkiye İş Bankası",
  "AKBNK": "Akbank T.A.Ş.",
  "SAHOL": "Sabancı Holding",
  "EREGL": "Erdemir Ereğli Demir Çelik"
};

// Mock rule analysis results for MVP (will be dynamic when backend rule engine is implemented)
const MOCK_RULE_RESULTS = [
  { id: 1, condition: 'RSI (14) Aşırı Satım Bölgesinde (< 30)', isMet: true, weight: 25 },
  { id: 2, condition: 'Fiyat 50 Günlük SMA Üzerinde', isMet: true, weight: 25 },
];

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loadingMarket, setLoadingMarket] = useState<boolean>(false);

  // 1. Auth Guard and Watchlist Initialization
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/auth');
      return;
    }
    
    setIsAuthenticated(true);
    loadUserWatchlist();
  }, [router]);

  const loadUserWatchlist = async () => {
    try {
      const data = await fetchWatchlist();
      const symbols = data.map((item: any) => item.symbol);
      setWatchlist(symbols);
      // If the user has stocks in their watchlist, automatically select the first one
      if (symbols.length > 0 && !selectedSymbol) {
        setSelectedSymbol(symbols[0]);
      }
    } catch (err) {
      console.error('Takip listesi yüklenirken hata:', err);
    }
  };

  // 2. Real-time stock selection and removal
  const handleToggleWatchlist = async (symbol: string, isAdded: boolean) => {
    try {
      if (isAdded) {
        await removeFromWatchlist(symbol);
        
        // List is getting updated in real-time
        const updatedList = watchlist.filter(s => s !== symbol);
        setWatchlist(updatedList);
        
        // If the removed stock is currently selected, select the next one in the list
        if (selectedSymbol === symbol) {
          if (updatedList.length > 0) {
            setSelectedSymbol(updatedList[0]); // Top stock is automatically selected
          } else {
            setSelectedSymbol(null);
            setMarketData(null);
          }
        }
      } else {
        await addToWatchlist(symbol);
        setWatchlist(prev => [...prev, symbol]);
        setSelectedSymbol(symbol);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // 3. When the selected stock changes, fetch its market data
  useEffect(() => {
    if (selectedSymbol && isAuthenticated) {
      const loadMarket = async () => {
        setLoadingMarket(true);
        try {
          const data = await fetchMarketData(selectedSymbol);
          setMarketData(data);
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingMarket(false);
        }
      };
      loadMarket();
    }
  }, [selectedSymbol, isAuthenticated]);

  // Block page reload untill authentication is verified
  if (!isAuthenticated) return <div className="min-h-screen bg-[#0b0e14]" />;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e14] text-slate-200">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0b0e14]/80 backdrop-blur-md px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          
          {/* Logo Section: Landing Page Navigation */}
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => router.push('/')}>
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_0_12px_#2563eb] transition-transform duration-300 group-hover:scale-105">
              <span className="font-mono text-sm font-black text-white">B</span>
            </div>
            <span className="font-semibold text-slate-100 tracking-tight transition-colors duration-300 group-hover:text-blue-400">
              BIST Tracker
            </span>
          </div>
          
          <StockSearch userWatchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} />
        </div>

        <div className="flex items-center space-x-4">
          <NotificationBell />
          
          {/* User Icon Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center cursor-pointer hover:bg-slate-700 hover:border-blue-500/50 hover:shadow-[0_0_8px_rgba(37,99,235,0.2)] transition-all duration-300 group outline-none">
              <User className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-slate-800 bg-[#12161f] text-slate-200">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-slate-400">Hesabım</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-800" />
                <DropdownMenuItem 
                  onClick={() => {
                    const slug = localStorage.getItem('user_slug') || 'demo-kullanici';
                    router.push(`/kullanici/${slug}`);
                  }} 
                  className="cursor-pointer focus:bg-slate-800 focus:text-slate-100"
                >
                  <User className="mr-2 h-4 w-4 text-slate-400" />
                  <span>Profil</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('user_slug');
                    router.push('/auth');
                  }} 
                  className="cursor-pointer text-rose-400 focus:bg-rose-500/10 focus:text-rose-300"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Çıkış Yap</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </header>

      <StockTicker />

      {/* Main Content */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Watchlist */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">Takip Listesi</h2>
              <span className="text-xs font-mono text-slate-500 border border-slate-700 bg-slate-800/50 px-2 py-0.5 rounded-md">
                {watchlist.length} Hisse
              </span>
            </div>

            <div className="w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md divide-y divide-slate-800/60 min-h-[200px]">
              {watchlist.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center">
                  <span className="text-3xl mb-3 opacity-20">#</span>
                  <p>Takip listeniz şu an boş.</p>
                  <p className="mt-1 text-xs text-slate-600">Yukarıdaki arama çubuğunu kullanarak hisse ekleyebilirsiniz.</p>
                </div>
              ) : (
                watchlist.map((symbol) => {
                  const isSelected = selectedSymbol === symbol;
                  return (
                    <div
                      key={symbol}
                      onClick={() => setSelectedSymbol(symbol)}
                      className={`group flex items-center justify-between px-5 py-4 transition-all duration-150 cursor-pointer ${
                        isSelected ? 'bg-slate-800/40 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent hover:bg-slate-850/50'
                      }`}
                    >
                      {/* Stock Symbol and Company Name */}
                      <div className="flex items-center space-x-4">
                        <span className="relative flex h-3 w-3 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                        </span>
                        
                        <div className="flex flex-col items-start justify-center mt-0.5">
                          {/* Stock Symbol */}
                          <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-widest bg-slate-800/80 border border-slate-700/50 px-2 py-0.5 rounded transition-colors group-hover:border-blue-500/30 group-hover:text-blue-400">
                            {symbol}
                          </span>
                          
                          {/* Company Name */}
                          <span className="text-[11px] font-medium text-slate-500 mt-1.5 truncate max-w-[130px] group-hover:text-slate-400 transition-colors">
                            {TICKER_NAMES[symbol] || symbol}
                          </span>
                        </div>
                      </div>
                      
                      {/* Score and Delete Button */}
                      <div className="relative flex items-center justify-end min-w-[70px]">
                        
                        {/* Score Field */}
                        <div className="text-right transition-all duration-300 transform group-hover:-translate-x-8">
                          <div className="text-sm font-bold font-mono text-emerald-400">95/100</div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Skor</div>
                        </div>
                        
                        {/* Delete Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleWatchlist(symbol, true);
                          }}
                          className="absolute right-0 p-1.5 rounded-md text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
                          title="Listeden Çıkar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Graphic and Analysis */}
          <div className="lg:col-span-8 flex flex-col space-y-6">
            
            <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-6 shadow-2xl backdrop-blur-md">
              {!selectedSymbol ? (
                <div className="h-[450px] flex flex-col items-center justify-center text-slate-500">
                  <Activity className="h-12 w-12 mb-4 opacity-20" />
                  <p>Grafikleri görüntülemek için listeden bir hisse seçin veya arama çubuğundan ekleyin.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-5 mb-4">
                    <div>
                      <div className="flex items-center space-x-3">
                        <h3 className="font-mono text-2xl font-bold text-slate-50">{selectedSymbol}</h3>
                        <span className="text-xs font-mono text-slate-500 uppercase tracking-widest bg-slate-800/60 px-2 py-0.5 rounded">
                          15 Dk | Mum Grafiği
                        </span>
                      </div>
                      
                      {/* Company Name (Graph Section) */}
                      <p className="text-sm font-medium text-slate-400 mt-1">
                        {selectedSymbol ? TICKER_NAMES[selectedSymbol] || selectedSymbol : ''}
                      </p>
                      
                      <p className="text-xs text-slate-500 mt-1">Canlı Piyasa Fiyatlandırması</p>
                    </div>

                    {marketData && !loadingMarket ? (
                      <div className="text-right">
                        <div className="font-mono text-2xl font-bold text-slate-100">
                          ₺{marketData.current_price.toFixed(2)}
                        </div>
                        <div className={`flex items-center justify-end space-x-1 font-mono text-xs font-semibold ${
                          marketData.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {marketData.change_pct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          <span>{marketData.change_pct >= 0 ? '+' : ''}{marketData.change_pct}%</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs font-mono text-slate-500 flex items-center space-x-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                        <span>Veri çekiliyor...</span>
                      </div>
                    )}
                  </div>

                  <div className="w-full">
                    {marketData?.candles && !loadingMarket ? (
                      <ChartWrapper candles={marketData.candles} />
                    ) : (
                      <div className="h-[380px] flex items-center justify-center text-slate-600 text-sm">
                        Grafik verisi yükleniyor...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Algorithmic Score & Rule Analysis Card (Show if a stock is selected) */}
            {selectedSymbol && (
              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-6 shadow-2xl backdrop-blur-md">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-200">Algoritmik Güven Skoru</h3>
                    <p className="text-xs text-slate-400 mt-1">Sistem tarafından belirlenen teknik kuralların sağlanma durumu.</p>
                  </div>
                  <div className="flex items-center justify-center h-14 w-14 rounded-full border-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-mono font-bold text-lg">
                    95
                  </div>
                </div>

                <div className="space-y-3">
                  {MOCK_RULE_RESULTS.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                      <div className="flex items-center space-x-3">
                        {rule.isMet ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-slate-600" />
                        )}
                        <span className={`text-sm ${rule.isMet ? 'text-slate-200' : 'text-slate-500'}`}>
                          {rule.condition}
                        </span>
                      </div>
                      <span className={`text-xs font-mono font-semibold ${rule.isMet ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {rule.isMet ? `+${rule.weight} Puan` : '0 Puan'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Footer - Legal Warning */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#0b0e14] py-6 px-8">
        <div className="max-w-7xl mx-auto flex items-start space-x-3 text-slate-500">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-500/70" />
          <p className="text-xs leading-relaxed">
            <strong className="text-slate-400 font-semibold">Yasal Uyarı: </strong> 
            Burada yer alan gösterge, analiz ve algoritmik skorlar kesinlikle yatırım danışmanlığı kapsamında değildir. 
            Sistem sadece önceden tanımlanmış matematiksel koşulları izleyen tarafsız bir kural motorudur. 
            Buradaki verilere dayanarak alım-satım kararı verilmesi beklentilerinize uygun sonuçlar doğurmayabilir.
          </p>
        </div>
      </footer>
    </div>
  );
}