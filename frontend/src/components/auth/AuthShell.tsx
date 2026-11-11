import { ShieldAlert, ShieldCheck, Timer, Lock, Radar, Sigma, BellRing } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandMark';
import BreakoutIllustration from '@/components/auth/BreakoutIllustration';
import { BRAND } from '@/lib/brand';

type Variant = 'user' | 'admin';

const USER_POINTS = [
  { icon: Radar, title: 'Sürekli tarama', text: 'Seçili BIST hisseleri seans boyunca her 5 dakikada yeniden değerlendirilir.' },
  { icon: Sigma, title: 'Deterministik skor', text: 'Aynı veri her zaman aynı 0–100 skoru verir. Tahmin yok, kural var.' },
  { icon: BellRing, title: 'Anlık bildirim', text: 'Ana filtreyi geçen hisseler için uygulama içi ve e-posta bildirimi.' },
];

const ADMIN_POINTS = [
  { icon: ShieldCheck, title: 'İki adımlı doğrulama', text: 'Şifreye ek olarak doğrulama uygulamasından 6 haneli kod istenir.' },
  { icon: Timer, title: 'Kısa ömürlü oturum', text: 'Yönetici oturumu en fazla 12 saat sürer, sonra yeniden doğrulama gerekir.' },
  { icon: Lock, title: 'Deneme sınırı', text: 'Art arda hatalı denemelerde hesap geçici olarak kilitlenir.' },
];

function Disclaimer({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-slate-500 ${className}`}>
      <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
      <p className="text-xs leading-relaxed">{BRAND.disclaimer}</p>
    </div>
  );
}

export default function AuthShell({ variant = 'user', children }: { variant?: Variant; children: React.ReactNode }) {
  const isAdmin = variant === 'admin';
  const points = isAdmin ? ADMIN_POINTS : USER_POINTS;

  return (
    <div className="relative flex min-h-screen bg-[#0b0e14] text-slate-200">
      {/* Brand column (desktop) */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-slate-800/80 bg-[#12161f] p-12 lg:flex">
        {/* Chart-paper grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(30 41 59 / 0.6) 1px, transparent 1px), linear-gradient(to bottom, rgb(30 41 59 / 0.6) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse at 30% 40%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 30% 40%, black 20%, transparent 75%)',
          }}
        />
        <div
          className={`pointer-events-none absolute -left-1/3 -top-1/3 h-full w-full rounded-full blur-[120px] ${
            isAdmin ? 'bg-emerald-600/10' : 'bg-blue-600/10'
          }`}
        />

        <div className="relative z-10">
          <BrandLogo suffix={isAdmin ? 'Yönetim Konsolu' : BRAND.tagline} />

          <div className="mt-14 max-w-md space-y-4">
            {isAdmin ? (
              <h1 className="text-4xl font-bold leading-tight text-slate-100">
                Kuralları yöneten <br />
                <span className="text-emerald-400">ekstra korunur.</span>
              </h1>
            ) : (
              <h1 className="text-4xl font-bold leading-tight text-slate-100">
                Duygusal kararları bırakın, <br />
                <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">matematiğe güvenin.</span>
              </h1>
            )}
            <p className="leading-relaxed text-slate-400">
              {isAdmin
                ? 'Kural motoru, taranan hisse evreni ve kullanıcılar bu konsoldan yönetilir. Erişim yalnızca yönetici hesapları ve iki adımlı doğrulama ile açılır.'
                : "Borsa İstanbul'daki hisseleri yöneticinin tanımladığı teknik kurallarla tarar, her biri için açıklanabilir bir Algoritmik Güven Skoru üretir."}
            </p>
          </div>

          <div className="mt-10 max-w-md">
            <BreakoutIllustration accent={isAdmin ? 'emerald' : 'blue'} />
          </div>

          <ul className="mt-10 grid max-w-md gap-5">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${isAdmin ? 'text-emerald-400' : 'text-blue-400'}`} />
                <div>
                  <p className="text-sm font-semibold text-slate-200">{title}</p>
                  <p className="text-sm leading-relaxed text-slate-500">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Disclaimer className="relative z-10 mt-10 max-w-md" />
      </aside>

      {/* Form column */}
      <main className="flex w-full flex-col items-center justify-center px-4 py-10 sm:px-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-10 flex justify-center lg:hidden">
            <BrandLogo suffix={isAdmin ? 'Yönetim Konsolu' : BRAND.tagline} />
          </div>
          {children}
          {/* The legal disclaimer must stay visible on every auth screen, mobile included */}
          <Disclaimer className="mt-10 lg:hidden" />
        </div>
      </main>
    </div>
  );
}
