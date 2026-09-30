'use client';

import Link from 'next/link';
import { ShieldAlert, Activity, BarChart2, ChevronRight } from 'lucide-react';
import StockTicker from '@/components/ui/StockTicker';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e14] text-slate-200">
      <StockTicker />
      {/* Top Navbar */}
      <header className="px-8 py-6 flex items-center justify-between border-b border-slate-800/80 bg-[#0b0e14]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_0_12px_#2563eb]">
            <span className="font-mono text-sm font-black text-white">B</span>
          </div>
          <span className="font-bold text-slate-100 tracking-tight text-lg">BIST Tracker</span>
        </div>
        <div className="flex items-center space-x-4">
          <Link href="/auth" className="text-sm font-medium text-slate-400 hover:text-slate-200 transition">
            Giriş Yap
          </Link>
          <Link href="/auth" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_12px_rgba(37,99,235,0.3)] hover:bg-blue-500 transition">
            Kayıt Ol
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 mt-12 mb-24">
        <div className="max-w-3xl space-y-8">
          <div className="inline-flex items-center space-x-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-400">
            <Activity className="h-4 w-4" />
            <span>Deterministik Algoritmik Skorlama</span>
          </div>
          
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-100 leading-tight">
            Duygusal Kararları Bırakın, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Matematiğe Güvenin.
            </span>
          </h1>
          
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Borsa İstanbul'daki fırsatları LLM halüsinasyonları olmadan, %100 matematiksel kurallara dayalı algoritmik skorlama motoruyla yakalayın.
          </p>

          <div className="flex items-center justify-center space-x-4 pt-4">
            <Link href="/auth" className="flex items-center space-x-2 rounded-lg bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_16px_rgba(37,99,235,0.4)] hover:bg-blue-500 transition">
              <span>Hemen Başla</span>
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mt-24 text-left">
          <div className="rounded-2xl border border-slate-800 bg-[#12161f]/50 p-6">
            <div className="h-12 w-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4">
              <BarChart2 className="h-6 w-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-200 mb-2">Şeffaf Skorlama</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Pahalı yapay zeka modelleri yerine, arka planda çalışan ve önceden belirlenen teknik kuralların gerçekleşme durumunu gösteren net metrikler.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-[#12161f]/50 p-6">
            <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
              <Activity className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-200 mb-2">Gerçek Zamanlı Taramalar</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Anlık kural tetiklemeleri 15 dakikalık (15m) canlı veriler üzerinden çalışır ve fırsatları kaçırmanızı engeller.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-[#12161f]/50 p-6">
            <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
              <ShieldAlert className="h-6 w-6 text-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-200 mb-2">Temiz Hisse Evreni</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Sığ ve manipülatif hisseler filtrelenerek sadece likiditesi yüksek BIST hisseleri üzerinde analiz yapılır.</p>
          </div>
        </div>
      </main>

      {/* Footer - Permanently Displayed Legal Notice */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#0b0e14] py-8 px-8">
        <div className="max-w-5xl mx-auto flex items-start space-x-3 text-slate-500">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-amber-500/70" />
          <p className="text-xs leading-relaxed">
            <strong className="text-slate-400 font-semibold">Yasal Uyarı: </strong> 
            Burada yer alan gösterge ve skorların yatırım danışmanlığı kapsamında olmadığı sistemin temel prensibidir. Sistem kesinlikle otomatik al/sat sinyali üretmez veya yatırım kararı vermez.
          </p>
        </div>
      </footer>
    </div>
  );
}