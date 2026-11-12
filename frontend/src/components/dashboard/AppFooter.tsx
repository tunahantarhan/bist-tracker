import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { BRAND } from '@/lib/brand';

/** Footer for signed-in pages; the legal disclaimer must stay on every page. */
export default function AppFooter() {
  return (
    <footer className="mt-10 border-t border-slate-800/70 bg-[#0b0e14]">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="flex items-start gap-2.5 text-[11px] leading-relaxed text-slate-500 md:max-w-3xl">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/80" />
          <span>
            <strong className="font-semibold text-slate-400">Yasal uyarı: </strong>
            Burada yer alan gösterge ve skorlar yatırım danışmanlığı kapsamında değildir. {BRAND.disclaimer} Fiyatlar yaklaşık 15 dakika
            gecikmelidir.
          </span>
        </p>
        <p className="flex shrink-0 items-center gap-4 font-data text-[11px] text-slate-600">
          <Link href="/yasal" className="hover:text-slate-300">
            Yasal
          </Link>
          <span>
            © {new Date().getFullYear()} {BRAND.name}
          </span>
        </p>
      </div>
    </footer>
  );
}
