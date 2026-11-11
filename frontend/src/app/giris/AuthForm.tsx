'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Lock, Mail, MailCheck, User } from 'lucide-react';
import { ApiError, login, register } from '@/services/api';
import { getAccessToken, safeNextPath, saveSession } from '@/lib/auth';
import { Field, FormAlert, PasswordField, PasswordStrength, SubmitButton, passwordPolicyError } from '@/components/auth/fields';
import ResendVerification from '@/components/auth/ResendVerification';

type Mode = 'login' | 'register';
type Errors = Partial<Record<'firstName' | 'lastName' | 'email' | 'password' | 'terms', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next'), '/ana-sayfa');

  const [mode, setMode] = useState<Mode>(searchParams.get('mod') === 'kayit' ? 'register' : 'login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already signed in: skip the form
  useEffect(() => {
    if (getAccessToken()) router.replace(next);
  }, [router, next]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrors({});
    setFormError(null);
    setUnverifiedEmail(null);
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!EMAIL_RE.test(email.trim())) e.email = 'Geçerli bir e-posta adresi girin.';
    if (mode === 'login') {
      if (!password) e.password = 'Şifrenizi girin.';
      return e;
    }
    if (!firstName.trim()) e.firstName = 'Adınızı girin.';
    if (!lastName.trim()) e.lastName = 'Soyadınızı girin.';
    const pwError = passwordPolicyError(password);
    if (pwError) e.password = pwError;
    if (!acceptedTerms) e.terms = 'Kayıt olmak için yasal uyarıyı kabul etmelisiniz.';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    setUnverifiedEmail(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setLoading(true);
    try {
      if (mode === 'login') {
        const data = await login(email.trim(), password);
        saveSession(data);
        router.replace(next);
        return; // keep the spinner until navigation
      }
      const res = await register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        terms_accepted: acceptedTerms,
      });
      setRegisteredEmail(res.email);
      setPassword('');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'email_not_verified') {
        setUnverifiedEmail(email.trim());
      } else {
        setFormError(error instanceof Error ? error.message : 'İşlem başarısız oldu.');
      }
    }
    setLoading(false);
  };

  if (registeredEmail) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <MailCheck className="h-7 w-7 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-100">E-postanızı kontrol edin</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            <span className="font-medium text-slate-200">{registeredEmail}</span> adresine bir doğrulama bağlantısı gönderdik.
            Bağlantıya tıkladıktan sonra giriş yapabilirsiniz. E-posta birkaç dakika içinde gelmezse gereksiz (spam) klasörüne de bakın.
          </p>
        </div>
        <ResendVerification email={registeredEmail} initialCooldown={60} />
        <button
          type="button"
          onClick={() => {
            setRegisteredEmail(null);
            switchMode('login');
          }}
          className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-300 hover:text-white"
        >
          Giriş ekranına dön <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const isLogin = mode === 'login';

  return (
    <div className="space-y-8">
      <div className="text-center lg:text-left">
        <h2 className="text-3xl font-bold text-slate-100">{isLogin ? 'Tekrar hoş geldiniz' : 'Hesap oluşturun'}</h2>
        <p className="mt-2 text-sm text-slate-400">
          {isLogin
            ? 'Takip listenize ve algoritmik skorlara erişmek için giriş yapın.'
            : 'BIST hisselerini kural tabanlı skorlarla takip etmeye başlayın.'}
        </p>
      </div>

      <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-1" role="tablist">
        {(['login', 'register'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`w-1/2 cursor-pointer rounded-md py-2 text-sm font-medium outline-none transition-all ${
              mode === m ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {m === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {formError && <FormAlert tone="error">{formError}</FormAlert>}
        {unverifiedEmail && (
          <FormAlert tone="info" action={<ResendVerification email={unverifiedEmail} />}>
            Giriş yapabilmek için önce e-posta adresinizi doğrulamanız gerekiyor. Gelen kutunuzdaki bağlantıya tıklayın.
          </FormAlert>
        )}

        {!isLogin && (
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Ad"
              icon={User}
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Ad"
              maxLength={50}
              error={errors.firstName}
            />
            <Field
              label="Soyad"
              icon={User}
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Soyad"
              maxLength={50}
              error={errors.lastName}
            />
          </div>
        )}

        <Field
          label="E-posta adresi"
          icon={Mail}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ornek@sirket.com"
          error={errors.email}
        />

        <div className="space-y-3">
          <PasswordField
            label="Şifre"
            icon={Lock}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            maxLength={128}
            error={errors.password}
            labelAction={
              isLogin ? (
                <Link
                  href={`/sifremi-unuttum${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Şifremi unuttum
                </Link>
              ) : undefined
            }
          />
          {!isLogin && password && <PasswordStrength password={password} />}
        </div>

        {!isLogin && (
          <div className="space-y-1.5">
            <div className="flex items-start gap-3 pt-1">
              <input
                id="terms"
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                aria-invalid={errors.terms ? true : undefined}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
              />
              <label htmlFor="terms" className="cursor-pointer text-xs leading-relaxed text-slate-400">
                Sistem <strong className="text-slate-300">yatırım tavsiyesi vermemekte</strong>, yalnızca belirlenmiş matematiksel kurallara
                göre bilgi ve bildirim sağlamaktadır.{' '}
                <Link href="/yasal#kullanim-kosullari" target="_blank" className="text-blue-400 hover:text-blue-300">
                  Kullanım koşullarını
                </Link>{' '}
                ve{' '}
                <Link href="/yasal#kvkk" target="_blank" className="text-blue-400 hover:text-blue-300">
                  KVKK aydınlatma metnini
                </Link>{' '}
                okudum, kabul ediyorum.
              </label>
            </div>
            {errors.terms && <p className="text-xs text-rose-400">{errors.terms}</p>}
          </div>
        )}

        <SubmitButton loading={loading}>
          {isLogin ? 'Giriş Yap' : 'Hesabımı Oluştur'}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </SubmitButton>
      </form>
    </div>
  );
}
