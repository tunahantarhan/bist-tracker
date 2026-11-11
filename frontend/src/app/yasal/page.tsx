import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/landing/SiteChrome';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Yasal Bilgilendirme' };

// DRAFT: to be reviewed before production. The data controller details are placeholders.
const DATA_CONTROLLER = '[Veri sorumlusu unvanı ve adresi]';
const CONTACT_EMAIL = '[iletişim e-posta adresi]';
const LAST_UPDATED = '12.11.2026';

const SECTIONS = [
  { id: 'yasal-uyari', title: 'Yasal uyarı' },
  { id: 'kullanim-kosullari', title: 'Kullanım koşulları' },
  { id: 'kvkk', title: 'KVKK aydınlatma metni' },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-bold text-slate-100">{title}</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-slate-400 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-slate-200 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

export default function LegalPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b0e14] text-slate-200">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6 lg:py-20">
        <div className="max-w-3xl">
          <p className="font-data text-[11px] uppercase tracking-[0.18em] text-blue-400">Yasal bilgilendirme</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-50">Kurallar, sınırlar ve verileriniz</h1>
          <p className="mt-4 font-data text-xs text-slate-500">Son güncelleme: {LAST_UPDATED}</p>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[200px_1fr]">
          <nav className="lg:sticky lg:top-24 lg:self-start" aria-label="Bölümler">
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`#${s.id}`}
                    className="block rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200 lg:border-transparent lg:px-2"
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="max-w-3xl space-y-16">
            <Section id="yasal-uyari" title="Yasal uyarı">
              <p>
                {BRAND.name}, Borsa İstanbul&apos;da işlem gören hisse senetlerini yönetici tarafından önceden tanımlanmış teknik kurallara göre
                tarayan ve sonuçları bir skor olarak gösteren bir <strong>bilgi platformudur</strong>.
              </p>
              <ul>
                <li>
                  Platformda yer alan skorlar, göstergeler ve bildirimler <strong>yatırım danışmanlığı kapsamında değildir</strong> ve hiçbir
                  hisse için alım, satım veya elde tutma önerisi niteliği taşımaz.
                </li>
                <li>Platform kullanıcı adına emir iletmez, portföy yönetmez ve getiri garantisi vermez.</li>
                <li>
                  Fiyat verileri üçüncü taraf sağlayıcılardan alınır; <strong>gecikmeli, eksik veya hatalı</strong> olabilir.
                </li>
                <li>Geçmişte sağlanan bir koşul, gelecekteki fiyat hareketleri hakkında bilgi vermez.</li>
                <li>Yatırım kararları ve sonuçlarının sorumluluğu tamamen kullanıcıya aittir.</li>
              </ul>
            </Section>

            <Section id="kullanim-kosullari" title="Kullanım koşulları">
              <p>Hesap oluşturarak aşağıdaki koşulları kabul etmiş olursunuz:</p>
              <ul>
                <li>Kayıt sırasında verdiğiniz bilgilerin doğru olduğunu ve e-posta adresinin size ait olduğunu beyan edersiniz.</li>
                <li>Hesabınızın ve şifrenizin güvenliğinden siz sorumlusunuz; hesabınızı başkalarıyla paylaşmamalısınız.</li>
                <li>
                  Platformu otomatik araçlarla aşırı yükleyecek, verileri toplu olarak kopyalayacak veya güvenliğini aşmaya çalışacak şekilde
                  kullanamazsınız.
                </li>
                <li>Platformdaki skor ve içerikler ticari amaçla yeniden yayımlanamaz.</li>
                <li>
                  Koşulları ihlal eden hesaplar uyarı yapılmaksızın askıya alınabilir. Hizmetin kapsamı ve bu koşullar zaman içinde
                  güncellenebilir; güncel metin her zaman bu sayfada yer alır.
                </li>
              </ul>
            </Section>

            <Section id="kvkk" title="KVKK aydınlatma metni">
              <p>
                6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) uyarınca, kişisel verileriniz veri sorumlusu sıfatıyla{' '}
                <strong>{DATA_CONTROLLER}</strong> tarafından aşağıda açıklanan kapsamda işlenmektedir.
              </p>
              <p>
                <strong>İşlenen veriler:</strong> ad, soyad, e-posta adresi, şifrenizin geri döndürülemez özeti (şifrenin kendisi saklanmaz),
                takip listeniz ve alarm tercihleriniz, giriş zamanı ve IP adresi gibi işlem güvenliği kayıtları.
              </p>
              <p>
                <strong>İşleme amaçları:</strong> üyelik hesabının oluşturulması ve yönetimi, e-posta adresinin doğrulanması, talep ettiğiniz
                bildirimlerin gönderilmesi, hesap ve bilgi güvenliğinin sağlanması (ör. kötüye kullanımın ve yetkisiz erişim denemelerinin
                engellenmesi) ile yasal yükümlülüklerin yerine getirilmesi.
              </p>
              <p>
                <strong>Hukuki sebepler:</strong> KVKK m. 5/2-c (sözleşmenin kurulması ve ifası), m. 5/2-ç (hukuki yükümlülük) ve m. 5/2-f (veri
                sorumlusunun meşru menfaati).
              </p>
              <p>
                <strong>Aktarım:</strong> Verileriniz yalnızca hizmetin sunulması için gerekli olduğu ölçüde barındırma ve e-posta gönderim
                hizmeti sağlayıcılarına ve talep edilmesi halinde yetkili kamu kurumlarına aktarılabilir.
              </p>
              <p>
                <strong>Haklarınız:</strong> KVKK m. 11 uyarınca verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini
                veya silinmesini isteme ve itiraz etme haklarına sahipsiniz. Taleplerinizi <strong>{CONTACT_EMAIL}</strong> adresine
                iletebilirsiniz.
              </p>
            </Section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
