'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, KeyRound, Mail, MailCheck } from 'lucide-react';
import { forgotPassword } from '@/services/api';
import { Field, FormAlert, SubmitButton } from '@/components/auth/fields';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError('Geçerli bir e-posta adresi girin.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'İstek gönderilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const backLink = (
    <Link href="/giris" className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200">
      <ArrowLeft className="h-4 w-4" /> Giriş ekranına dön
    </Link>
  );

  if (sentTo) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <MailCheck className="h-7 w-7 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-100">Gelen kutunuza bakın</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            <span className="font-medium text-slate-200">{sentTo}</span> adresine kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı
            birkaç dakika içinde gelecek. Bağlantı <span className="font-data text-slate-300">30 dakika</span> geçerlidir ve yalnızca bir kez
            kullanılabilir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="cursor-pointer text-sm font-medium text-blue-300 underline-offset-4 hover:text-blue-200 hover:underline"
        >
          Farklı bir adres dene
        </button>
        <div>{backLink}</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10">
          <KeyRound className="h-6 w-6 text-blue-400" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-100">Şifrenizi mi unuttunuz?</h2>
          <p className="mt-2 text-sm text-slate-400">Hesabınızın e-posta adresini girin, size yeni şifre belirleme bağlantısı gönderelim.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {formError && <FormAlert tone="error">{formError}</FormAlert>}
        <Field
          label="E-posta adresi"
          icon={Mail}
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ornek@sirket.com"
          error={error}
        />
        <SubmitButton loading={loading}>Sıfırlama bağlantısı gönder</SubmitButton>
      </form>

      {backLink}
    </div>
  );
}
