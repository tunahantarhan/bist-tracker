'use client';

import { useState, useEffect } from 'react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NotificationBell from '@/components/notifications/NotificationBell';
import { fetchMarketData, MarketData } from '@/services/api';
import { Search, User, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

// MVP için mock takip listesi (Yarın backend'den User Watchlist olarak bağlanacak)
const MOCK_WATCHLIST = [
  { symbol: 'THYAO', name: 'Türk Hava Yolları', isActive: true, score: 75 },
  { symbol: 'GARAN', name: 'Garanti BBVA', isActive: true, score: 90 },
  { symbol: 'ASELS', name: 'Aselsan', isActive: false, score: 40 },
  { symbol: 'TUPRS', name: 'Tüpraş', isActive: true, score: 65 },
];

// MVP için mock kural analiz sonuçları (Yarın backend skor motorundan gelecek)
const MOCK_RULE_RESULTS = [
  { id: 1, condition: 'RSI (14) Aşırı Satım Bölgesinde (< 30)', isMet: true, weight: 25 },
  { id: 2, condition: 'Fiyat 50 Günlük SMA Üzerinde', isMet: true, weight: 25 },
  { id: 3, condition: 'Günlük Hacim > 20 Günlük Ortalama', isMet: true, weight: 25 },
  { id: 4, condition: 'MACD Pozitif Kesişim (Trigger > Signal)', isMet: false, weight: 25 },
];

export default function DashboardPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('THYAO');
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loadingMarket, setLoadingMarket] = useState<boolean>(false);

  const loadMarket = async (symbol: string) => {
    setLoadingMarket(true);
    try {
      const data = await fetchMarketData(symbol);
      setMarketData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMarket(false);
    }
  };

  useEffect(() => {
    if (selectedSymbol) {
      loadMarket(selectedSymbol);
    }
  }, [selectedSymbol]);

  const currentStock = MOCK_WATCHLIST.find((s) => s.symbol === selectedSymbol) || MOCK_WATCHLIST[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e14] text-slate-200">
      {/* Üst Navigasyon */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0b0e14]/80 backdrop-blur-md px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3 cursor-pointer">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_0_12px_#2563eb]">
              <span className="font-mono text-sm font-black text-white">B</span>
            </div>
            <span className="font-semibold text-slate-100 tracking-tight">BIST Tracker</span>
          </div>
          
          {/* Arama Çubuğu */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Hisse Ara (Örn: THYAO)..." 
              className="h-9 w-64 rounded-md border border-slate-700 bg-slate-900/50 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <NotificationBell />
          <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center cursor-pointer hover:bg-slate-700 transition">
            <User className="h-4 w-4 text-slate-300" />
          </div>
        </div>
      </header>

      {/* Ana İçerik */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Sol Kolon: Takip Listesi */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">Takip Listesi</h2>
              <span className="text-xs font-mono text-slate-500 border border-slate-700 bg-slate-800/50 px-2 py-0.5 rounded-md">
                Limit: 4/10
              </span>
            </div>

            <div className="w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md divide-y divide-slate-800/60">
              {MOCK_WATCHLIST.map((stock) => {
                const isSelected = selectedSymbol === stock.symbol;
                return (
                  <div
                    key={stock.symbol}
                    onClick={() => setSelectedSymbol(stock.symbol)}
                    className={`group flex items-center justify-between px-5 py-4 transition-all duration-150 cursor-pointer ${
                      isSelected ? 'bg-slate-800/40 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent hover:bg-slate-850/50'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      {/* Durum Bullet */}
                      <div className="flex items-center justify-center">
                        {stock.isActive ? (
                          <span className="relative flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                          </span>
                        ) : (
                          <span className="relative flex h-3 w-3">
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500/80 shadow-[0_0_8px_#f43f5e]"></span>
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="font-mono font-bold text-slate-100 group-hover:text-blue-400 transition-colors">
                          {stock.symbol}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate w-32">{stock.name}</div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={`text-sm font-bold font-mono ${stock.score >= 70 ? 'text-emerald-400' : stock.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {stock.score}/100
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Skor</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sağ Kolon: Grafik ve Analiz */}
          <div className="lg:col-span-8 flex flex-col space-y-6">
            
            {/* Grafik Kartı */}
            <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-6 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-5 mb-4">
                <div>
                  <div className="flex items-center space-x-3">
                    <h3 className="font-mono text-2xl font-bold text-slate-50">{selectedSymbol}</h3>
                    <span className="text-xs font-mono text-slate-500 uppercase tracking-widest bg-slate-800/60 px-2 py-0.5 rounded">
                      15 Dk Mum
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{currentStock.name} - Canlı Piyasa Fiyatlandırması</p>
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
            </div>

            {/* Algoritmik Skor & Kural Analiz Kartı */}
            <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-6 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-200">Algoritmik Güven Skoru</h3>
                  <p className="text-xs text-slate-400 mt-1">Sistem tarafından belirlenen teknik kuralların sağlanma durumu.</p>
                </div>
                <div className="flex items-center justify-center h-14 w-14 rounded-full border-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-mono font-bold text-lg">
                  {currentStock.score}
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

          </div>
        </div>
      </main>

      {/* Footer - Yasal Uyarı */}
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