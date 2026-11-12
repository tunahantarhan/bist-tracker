import Link from 'next/link';
import {
  ArrowRight,
  BellRing,
  Check,
  Database,
  Filter,
  Gauge,
  Layers,
  Minus,
  Sigma,
  Eye,
} from 'lucide-react';
import StockTicker from '@/components/ui/StockTicker';
import { SiteFooter, SiteHeader } from '@/components/landing/SiteChrome';
import LiveScanPanel from '@/components/landing/LiveScanPanel';
import ScoreAnatomy from '@/components/landing/ScoreAnatomy';
import BreakoutIllustration from '@/components/auth/BreakoutIllustration';
import FaqAccordion from '@/components/landing/FaqAccordion';
import PlayOnView from '@/components/landing/PlayOnView';

const STEPS = [
  {
    icon: Database,
    title: 'Hisse evreni',
    text: 'Yönetici, taranacak likit BIST hisselerini seçer. Sığ ve takip edilmesi zor kâğıtlar evrene alınmaz.',
  },
  {
    icon: Filter,
    title: 'Ana filtre',
    text: 'Her hisse önce tek bir kapıdan geçer: RSI, düşen trend çizgisini yukarı kırdı mı?',
  },
  {
    icon: Sigma,
    title: 'Skor',
    text: 'Farklı zaman dilimlerindeki kurallar ağırlıklarına göre toplanır ve 0–100 arası skor çıkar.',
  },
  {
    icon: BellRing,
    title: 'Bildirim',
    text: 'Ana filtreyi geçen hisseler için seans saatlerinde uygulama içi ve e-posta bildirimi gelir.',
  },
];

const PRINCIPLES = [
  { icon: Layers, title: 'Deterministik', text: 'Aynı veri her zaman aynı skoru verir. Rastgelelik, tahmin veya dil modeli yok.' },
  { icon: Eye, title: 'Açıklanabilir', text: 'Skorun her puanı bir kurala bağlıdır; hangi koşulun sağlandığını tek tek görürsünüz.' },
  { icon: Gauge, title: 'Çok zaman dilimli', text: '15 dakikalıktan günlüğe kadar her kural kendi grafiğinde değerlendirilir.' },
];

const DOES = [
  'Seçili hisseleri seans boyunca düzenli aralıklarla tarar',
  'Tanımlı teknik kuralların sağlanıp sağlanmadığını gösterir',
  'Koşul oluştuğunda sizi bilgilendirir',
  'Her skorun nereden geldiğini açıklar',
];

const DOES_NOT = [
  'Al veya sat önerisi vermez',
  'Sizin adınıza emir iletmez',
  'Fiyat tahmini yapmaz',
  'Getiri garantisi sunmaz',
];

const FAQ = [
  {
    q: 'Bu bir yatırım tavsiyesi mi?',
    a: 'Hayır. Platform yalnızca belirlenmiş matematiksel kuralların sağlanıp sağlanmadığını gösterir. Skorlar yatırım danışmanlığı kapsamında değildir; yatırım kararı tamamen size aittir.',
  },
  {
    q: 'Skor nasıl hesaplanıyor?',
    a: 'Her kuralın sabit bir ağırlığı vardır. Hisse bir kuralı sağladığında o ağırlık kadar puan alır; skor, sağlanan kuralların toplamıdır. Aynı veriyle her zaman aynı sonuç çıkar.',
  },
  {
    q: 'Kuralları kim belirliyor?',
    a: 'Kurallar platform yöneticisi tarafından tanımlanır. Kullanıcılar kural yazmaz; böylece bir skor herkes için aynı anlamı taşır.',
  },
  {
    q: 'Veriler ne kadar güncel?',
    a: 'Hisseler seans boyunca birkaç dakikada bir yeniden taranır. Fiyat verileri üçüncü taraf bir sağlayıcıdan gelir ve gecikmeli olabilir.',
  },
  {
    q: 'Bildirimler ne zaman gelir?',
    a: 'Yalnızca Borsa İstanbul seans saatlerinde, ana filtreyi geçen hisseler için gönderilir. Aynı sinyal kısa süre içinde tekrar tekrar bildirilmez.',
  },
  {
    q: 'Hesabım ne kadar güvende?',
    a: 'Kayıt için e-posta doğrulaması gerekir, şifreler geri döndürülemez biçimde saklanır, hatalı denemeler sınırlandırılır. Yönetici hesapları ayrıca iki adımlı doğrulama ile korunur.',
  },
];

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-data text-[11px] uppercase tracking-[0.18em] text-blue-400">
      <span className="text-slate-600">{index}</span>
      <span className="h-px w-6 bg-slate-700" />
      {children}
    </p>
  );
}

const GRID_BG = {
  backgroundImage:
    'linear-gradient(to right, rgb(30 41 59 / 0.5) 1px, transparent 1px), linear-gradient(to bottom, rgb(30 41 59 / 0.5) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
  maskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, black 30%, transparent 80%)',
  WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, black 30%, transparent 80%)',
} as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b0e14] text-slate-200">
      <StockTicker />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-60" style={GRID_BG} />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[120px]" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pb-28 lg:pt-24">
            <div className="space-y-8">
              <p className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 font-data text-[11px] uppercase tracking-[0.14em] text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                Borsa İstanbul · kural tabanlı tarama
              </p>

              <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-slate-50 sm:text-5xl xl:text-[3.5rem]">
                Duygusal kararları bırakın,{' '}
                <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
                  matematiğe güvenin.
                </span>
              </h1>

              <p className="max-w-xl text-lg leading-relaxed text-slate-400">
                BIST hisselerini önceden tanımlı teknik kurallarla seans boyunca tarar, her hisse için nedenini gösterebildiği
                <span className="text-slate-200"> 0–100 arası bir güven skoru</span> üretir.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/giris?mod=kayit"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-500"
                >
                  Ücretsiz hesap oluştur <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="#nasil-calisir"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800/60"
                >
                  Nasıl çalışır?
                </Link>
              </div>

              <ul className="flex flex-wrap gap-x-6 gap-y-2 font-data text-[11px] text-slate-500">
                {['Yatırım tavsiyesi değildir', 'Al/sat emri vermez', 'Tahmin değil, kural'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-slate-600" /> {t}
                  </li>
                ))}
              </ul>
            </div>

            <LiveScanPanel />
          </div>
        </section>

        {/* How it works */}
        <section id="nasil-calisir" className="scroll-mt-20 border-t border-slate-800/70 bg-[#0d1118]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <div className="max-w-2xl space-y-4">
              <SectionLabel index="01">Nasıl çalışır</SectionLabel>
              <h2 className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">Yüzlerce grafikten birkaç net sinyale.</h2>
              <p className="leading-relaxed text-slate-400">
                Her hisse aynı huniden geçer. Önce tek bir ana filtre, sonra ağırlıklı kurallar. Sonuç her seferinde aynı ve açıklanabilir.
              </p>
            </div>

            <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="relative rounded-2xl border border-slate-800 bg-[#12161f] p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10">
                      <Icon className="h-5 w-5 text-blue-400" />
                    </span>
                    <span className="font-data text-xs text-slate-600">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-100">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
                  {i < STEPS.length - 1 && (
                    <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-[#0d1118] text-slate-600 lg:block" />
                  )}
                </li>
              ))}
            </ol>

            {/* Primary filter close-up */}
            <div className="mt-6 grid items-center gap-10 rounded-2xl border border-slate-800 bg-[#12161f] p-6 sm:p-10 lg:grid-cols-2">
              <div className="space-y-4">
                <p className="font-data text-[11px] uppercase tracking-[0.16em] text-slate-500">Ana filtreye yakından bakış</p>
                <h3 className="text-2xl font-bold text-slate-100">RSI düşen trend kırılımı</h3>
                <p className="leading-relaxed text-slate-400">
                  RSI ardı ardına daha düşük tepeler yaptığında bu tepelerden geçen bir direnç çizgisi oluşur. Satış baskısı zayıfladığında RSI bu
                  çizginin üzerine çıkar. Sistem bu anı yakalar. İlk tepe yeterince yüksek değilse ya da çizgi henüz dip bölgesine inmediyse
                  kırılım sayılmaz.
                </p>
                <ul className="space-y-2 text-sm text-slate-300">
                  {['Kesikli çizgi: tepelerden geçen düşen trend', 'Yeşil nokta: RSI’ın çizgiyi yukarı kestiği an', 'Parametreler yönetici panelinden ayarlanır'].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <PlayOnView className="rounded-xl border border-slate-800/80 bg-[#0b0e14] p-5 sm:p-6">
                <BreakoutIllustration />
              </PlayOnView>
            </div>
          </div>
        </section>

        {/* Score */}
        <section id="skor" className="scroll-mt-20 border-t border-slate-800/70">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
            <div className="space-y-8">
              <div className="space-y-4">
                <SectionLabel index="02">Algoritmik güven skoru</SectionLabel>
                <h2 className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">Kara kutu yok. Her puanın bir sebebi var.</h2>
                <p className="leading-relaxed text-slate-400">
                  Skor bir tahmin değil, bir sayım: hangi kurallar sağlandıysa onların ağırlıkları toplanır. Detay sayfasında her kuralın o anki
                  değerini ve hedefini yan yana görürsünüz.
                </p>
              </div>
              <ul className="space-y-5">
                {PRINCIPLES.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900">
                      <Icon className="h-4 w-4 text-emerald-400" />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-200">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-400">{text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <ScoreAnatomy />
          </div>
        </section>

        {/* Does / does not */}
        <section className="border-t border-slate-800/70 bg-[#0d1118]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="max-w-2xl space-y-4">
              <SectionLabel index="03">Sınırlarımız</SectionLabel>
              <h2 className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">Bir yatırım robotu değil, bir mercek.</h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-7">
                <p className="font-data text-[11px] uppercase tracking-[0.16em] text-emerald-400">Yapar</p>
                <ul className="mt-5 space-y-3.5">
                  {DOES.map((t) => (
                    <li key={t} className="flex items-start gap-3 text-slate-200">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-[#12161f] p-7">
                <p className="font-data text-[11px] uppercase tracking-[0.16em] text-slate-500">Yapmaz</p>
                <ul className="mt-5 space-y-3.5">
                  {DOES_NOT.map((t) => (
                    <li key={t} className="flex items-start gap-3 text-slate-400">
                      <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="sss" className="scroll-mt-20 border-t border-slate-800/70">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:py-28">
            <div className="space-y-4">
              <SectionLabel index="04">Sık sorulanlar</SectionLabel>
              <h2 className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">Merak edilenler</h2>
              <p className="leading-relaxed text-slate-400">
                Yasal çerçeve için{' '}
                <Link href="/yasal" className="text-blue-400 hover:text-blue-300">
                  yasal bilgilendirme
                </Link>{' '}
                sayfasına bakabilirsiniz.
              </p>
            </div>
            <FaqAccordion items={FAQ} />
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-slate-800/70">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-600/15 via-[#12161f] to-emerald-500/10 px-6 py-14 text-center sm:px-12">
              <div className="pointer-events-none absolute inset-0 opacity-40" style={GRID_BG} />
              <div className="relative mx-auto max-w-xl space-y-6">
                <h2 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Takip listenizi kurallara emanet edin.</h2>
                <p className="text-slate-400">Hesap oluşturun, hisselerinizi ekleyin; koşul oluştuğunda haberiniz olsun.</p>
                <Link
                  href="/giris?mod=kayit"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-500"
                >
                  Ücretsiz hesap oluştur <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
