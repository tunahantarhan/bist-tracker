'use client';

import { useState } from 'react';
import { ShieldAlert, TrendingUp, Lock, Mail, ChevronRight } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isLogin && !acceptedTerms) {
      alert("Sistem yatırım tavsiyesi vermemekte, yalnızca belirlenmiş matematiksel kurallara göre bilgi ve bildirim sağlamaktadır. Bu uyarıyı kabul etmelisiniz.");
      return;
    }

    const endpoint = isLogin ? '/api/v1/auth/login' : '/api/v1/auth/register';
    const payload = isLogin 
      ? { email, password } 
      : { email, password, terms_accepted: acceptedTerms };

    try {
      const res = await fetch(`http://127.0.0.1:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'İşlem başarısız');
      }

      const data = await res.json();
      
      if (isLogin) {
        // JWT token tarayıcıda saklanıyor
        localStorage.setItem('access_token', data.access_token);
        window.location.href = '/dashboard'; // Başarılı girişte ana ekrana yönlendir
      } else {
        alert("Kayıt başarılı! Şimdi giriş yapabilirsiniz.");
        setIsLogin(true);
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0b0e14] text-slate-200">
      
      {/* Sol Panel - Marka ve Değer Önermesi */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 bg-[#12161f] border-r border-slate-800/80 relative overflow-hidden">
        {/* Dekoratif Arka Plan Işığı */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-blue-600/10 blur-[120px] rounded-full"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-16">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-[0_0_16px_#2563eb]">
              <span className="font-mono text-lg font-black text-white">B</span>
            </div>
            <span className="text-xl font-bold text-slate-100 tracking-tight">BIST Rule Engine</span>
          </div>

          <div className="space-y-6 max-w-md">
            <h1 className="text-4xl font-bold text-slate-100 leading-tight">
              Duygusal Kararları Bırakın, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                Matematiğe Güvenin.
              </span>
            </h1>
            <p className="text-slate-400 leading-relaxed">
              Borsa İstanbul'daki fırsatları LLM halüsinasyonları olmadan, %100 deterministik kurallara dayalı algoritmik skorlama motoruyla yakalayın.
            </p>
          </div>

          <div className="mt-12 space-y-4">
            <div className="flex items-center space-x-3 text-slate-300">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              <span>Gerçek Zamanlı İndikatör Taraması</span>
            </div>
            <div className="flex items-center space-x-3 text-slate-300">
              <ShieldAlert className="h-5 w-5 text-blue-500" />
              <span>Temizlenmiş BIST Evreni (Sığ Hisseler Hariç)</span>
            </div>
          </div>
        </div>

        {/* Sol Alt Yasal Uyarı Sabiti */}
        <div className="relative z-10 flex items-start space-x-3 text-slate-500 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-xs leading-relaxed">
            Sistem yatırım tavsiyesi vermemekte, yalnızca belirlenmiş matematiksel kurallara göre bilgi ve bildirim sağlamaktadır.
          </p>
        </div>
      </div>

      {/* Sağ Panel - Form Alanı */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-slate-100">
              {isLogin ? 'Hoş Geldiniz' : 'Hesap Oluşturun'}
            </h2>
            <p className="text-slate-400 mt-2 text-sm">
              {isLogin ? 'Takip listenize ve algoritmik skorlara erişmek için giriş yapın.' : 'BIST piyasasını algoritmalarla takip etmeye hemen başlayın.'}
            </p>
          </div>

          {/* Tab Geçişi */}
          <div className="flex p-1 space-x-1 bg-slate-900/80 border border-slate-800 rounded-lg">
            <button
              onClick={() => setIsLogin(true)}
              className={`w-1/2 py-2 text-sm font-medium rounded-md transition-all ${
                isLogin ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Giriş Yap
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`w-1/2 py-2 text-sm font-medium rounded-md transition-all ${
                !isLogin ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Kayıt Ol
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">E-posta Adresi</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@sirket.com"
                  className="w-full rounded-md border border-slate-700 bg-slate-900/50 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Şifre</label>
                {isLogin && (
                  <a href="#" className="text-xs text-blue-400 hover:text-blue-300">Şifremi Unuttum</a>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-md border border-slate-700 bg-slate-900/50 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Yasal Onay Alanı - Kayıt olurken ZORUNLU */}
            {!isLogin && (
              <div className="flex items-start space-x-3 pt-2">
                <div className="flex items-center h-5">
                  <input
                    id="terms"
                    type="checkbox"
                    required
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                </div>
                <label htmlFor="terms" className="text-xs text-slate-400 leading-relaxed cursor-pointer">
                  Sistem <strong className="text-slate-300">yatırım tavsiyesi vermemekte</strong>, yalnızca belirlenmiş matematiksel kurallara göre bilgi ve bildirim sağlamaktadır. Bu koşulları okudum ve kabul ediyorum.
                </label>
              </div>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center space-x-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors shadow-[0_0_12px_rgba(37,99,235,0.3)]"
            >
              <span>{isLogin ? 'Sisteme Giriş Yap' : 'Hesabımı Oluştur'}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </form>

          {/* Alt Footer Sadece Mobilde (Çünkü solda kayboluyor) */}
          <div className="lg:hidden text-center mt-8 pt-6 border-t border-slate-800/80">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
              Yatırım Danışmanlığı Kapsamında Değildir
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}