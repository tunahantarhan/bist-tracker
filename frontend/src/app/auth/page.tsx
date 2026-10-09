'use client';

import { useState } from 'react';
import { ShieldAlert, TrendingUp, Lock, Mail, ChevronRight, User, CheckCircle2 } from 'lucide-react';
import { API_URL } from '@/services/api';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isLogin && !acceptedTerms) {
      showToast("Sisteme kayıt olmak için yasal uyarıyı kabul etmelisiniz.", "error");
      return;
    }

    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    const payload = isLogin 
      ? { email, password } 
      : { 
          email, 
          password, 
          first_name: firstName, 
          last_name: lastName, 
          terms_accepted: acceptedTerms 
        };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        const errorMsg = Array.isArray(errorData.detail) 
          ? errorData.detail.map((err: any) => err.msg).join(', ') 
          : errorData.detail || 'İşlem başarısız oldu.';
        throw new Error(errorMsg);
      }

      const data = await res.json();
      
      if (isLogin) {
        if (data.first_name && data.last_name) {
          localStorage.setItem('user_slug', `${data.first_name.toLowerCase()}-${data.last_name.toLowerCase()}`);
        }
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('is_admin', data.is_admin ? 'true' : 'false');
        window.location.href = '/dashboard';
      } else {
        showToast("Kayıt başarılı! Şimdi giriş yapabilirsiniz.", "success");
        setIsLogin(true);
      }
    } catch (error: any) {
      showToast(error.message, "error");
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0b0e14] text-slate-200 relative overflow-hidden">
      
      {toast && (
        <div className={`fixed bottom-8 right-8 z-50 flex items-center p-4 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-5 ${
          toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-5 w-5 mr-3 shrink-0" /> : <ShieldAlert className="h-5 w-5 mr-3 shrink-0" />}
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      )}

      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 bg-[#12161f] border-r border-slate-800/80 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-blue-600/10 blur-[120px] rounded-full"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-16">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-[0_0_12px_#2563eb]">
              <span className="font-mono text-sm font-black text-white">B</span>
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

        <div className="relative z-10 flex items-start space-x-3 text-slate-500 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-xs leading-relaxed">
            Sistem yatırım tavsiyesi vermemekte, yalnızca belirlenmiş matematiksel kurallara göre bilgi ve bildirim sağlamaktadır.
          </p>
        </div>
      </div>

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

          <div className="flex p-1 space-x-1 bg-slate-900/80 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`w-1/2 py-2 text-sm font-medium rounded-md transition-all outline-none cursor-pointer ${
                isLogin ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Giriş Yap
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`w-1/2 py-2 text-sm font-medium rounded-md transition-all outline-none cursor-pointer ${
                !isLogin ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Kayıt Ol
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="flex space-x-4">
                <div className="space-y-1.5 w-1/2">
                  <label className="text-sm font-medium text-slate-300">İsim</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      required={!isLogin}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="İsim"
                      className="w-full rounded-md border border-slate-700 bg-slate-900/50 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5 w-1/2">
                  <label className="text-sm font-medium text-slate-300">Soyisim</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      required={!isLogin}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Soyisim"
                      className="w-full rounded-md border border-slate-700 bg-slate-900/50 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

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

            {!isLogin && (
              <div className="flex items-start space-x-3 pt-2">
                <div className="flex items-center h-5">
                  <input
                    id="terms"
                    type="checkbox"
                    required
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                  />
                </div>
                <label htmlFor="terms" className="text-xs text-slate-400 leading-relaxed cursor-pointer">
                  Sistem <strong className="text-slate-300">yatırım tavsiyesi vermemekte</strong>, yalnızca belirlenmiş matematiksel kurallara göre bilgi ve bildirim sağlamaktadır. Bu koşulları okudum ve kabul ediyorum.
                </label>
              </div>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center space-x-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors shadow-[0_0_12px_rgba(37,99,235,0.3)] cursor-pointer"
            >
              <span>{isLogin ? 'Sisteme Giriş Yap' : 'Hesabımı Oluştur'}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}