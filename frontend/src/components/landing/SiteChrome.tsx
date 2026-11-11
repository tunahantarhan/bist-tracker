import Link from 'next/link';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandMark';
import { BRAND } from '@/lib/brand';

const NAV = [
  { href: '/#nasil-calisir', label: 'Nasıl çalışır' },
  { href: '/#skor', label: 'Skor' },
  { href: '/#sss', label: 'SSS' },
];

/** Public header for the landing and legal pages. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-[#0b0e14]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <BrandLogo size="sm" />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Sayfa bölümleri">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-slate-400 transition-colors hover:text-slate-100">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/giris" className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            Giriş yap
          </Link>
          <Link
            href="/giris?mod=kayit"
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_0_12px_rgba(37,99,235,0.3)] transition-colors hover:bg-blue-500"
          >
            Kayıt ol <ArrowRight className="hidden h-4 w-4 sm:block" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Public footer; the legal disclaimer must stay on every page. */
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-800/80 bg-[#0b0e14]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm space-y-4">
            <BrandLogo size="sm" suffix={BRAND.tagline} />
            <p className="text-sm leading-relaxed text-slate-500">
              Borsa İstanbul hisselerini şeffaf teknik kurallarla tarayan, açıklanabilir skor üreten bir bilgi platformu.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm sm:gap-16">
            <div className="space-y-3">
              <p className="font-data text-[11px] uppercase tracking-[0.16em] text-slate-600">Ürün</p>
              <ul className="space-y-2">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-slate-400 hover:text-slate-200">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <p className="font-data text-[11px] uppercase tracking-[0.16em] text-slate-600">Yasal</p>
              <ul className="space-y-2">
                <li>
                  <Link href="/yasal#yasal-uyari" className="text-slate-400 hover:text-slate-200">Yasal uyarı</Link>
                </li>
                <li>
                  <Link href="/yasal#kullanim-kosullari" className="text-slate-400 hover:text-slate-200">Kullanım koşulları</Link>
                </li>
                <li>
                  <Link href="/yasal#kvkk" className="text-slate-400 hover:text-slate-200">KVKK aydınlatma</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-slate-500">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500/80" />
          <p className="text-xs leading-relaxed">
            <strong className="font-semibold text-slate-400">Yasal uyarı: </strong>
            Burada yer alan gösterge ve skorlar yatırım danışmanlığı kapsamında değildir. {BRAND.disclaimer} Sistem al/sat emri iletmez ve
            yatırım kararı vermez.
          </p>
        </div>

        <p className="mt-8 font-data text-[11px] text-slate-600">
          © {new Date().getFullYear()} {BRAND.name}. Veriler gecikmeli olabilir.
        </p>
      </div>
    </footer>
  );
}
