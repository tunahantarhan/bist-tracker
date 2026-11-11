'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, ArrowRight, Check, Copy, Lock, Mail, ShieldCheck, Smartphone, Timer } from 'lucide-react';
import { ApiError, adminLogin, adminVerifyTotp, type AdminLoginResponse } from '@/services/api';
import { isAdminSession, safeNextPath, saveSession } from '@/lib/auth';
import { Field, FormAlert, PasswordField, SubmitButton } from '@/components/auth/fields';
import OtpInput from '@/components/auth/OtpInput';

type Step = 'credentials' | 'setup' | 'verify';

// Matches MFA_PENDING_TOKEN_EXPIRE_MINUTES on the backend
const MFA_WINDOW_MS = 5 * 60 * 1000;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function AdminLoginFlow() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'), '/admin');

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [mfa, setMfa] = useState<AdminLoginResponse | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState('');
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isAdminSession()) router.replace(next);
  }, [router, next]);

  // Countdown for the MFA window
  useEffect(() => {
    if (step === 'credentials') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const remaining = expiresAt - now;
  const expired = step !== 'credentials' && remaining <= 0;

  const restart = (message: string | null) => {
    setStep('credentials');
    setMfa(null);
    setCode('');
    setCodeInvalid(false);
    setPassword('');
    setError(message);
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const found: typeof fieldErrors = {};
    if (!email.trim()) found.email = 'E-posta adresinizi girin.';
    if (!password) found.password = 'Şifrenizi girin.';
    setFieldErrors(found);
    setError(null);
    if (Object.keys(found).length) return;

    setLoading(true);
    try {
      const res = await adminLogin(email.trim(), password);
      setMfa(res);
      setExpiresAt(Date.now() + MFA_WINDOW_MS);
      setNow(Date.now());
      setStep(res.status === 'totp_setup_required' ? 'setup' : 'verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız oldu.');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (value: string) => {
    if (!mfa || loading || value.length !== 6) return;
    setLoading(true);
    setError(null);
    setCodeInvalid(false);
    try {
      const data = await adminVerifyTotp(mfa.mfa_token, value);
      saveSession(data);
      router.replace(next);
      return; // keep the spinner until navigation
    } catch (err) {
      if (err instanceof ApiError && err.code === 'mfa_expired') {
        restart(err.message);
      } else {
        setCodeInvalid(true);
        setCode('');
        setError(err instanceof Error ? err.message : 'Doğrulama başarısız oldu.');
      }
    }
    setLoading(false);
  };

  const copySecret = async () => {
    if (!mfa?.totp_secret) return;
    try {
      await navigator.clipboard.writeText(mfa.totp_secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the key is still visible for manual entry
    }
  };

  const header = (
    <div className="space-y-4">
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-data text-[11px] uppercase tracking-[0.14em] text-emerald-300">
        <ShieldCheck className="h-3.5 w-3.5" /> Yönetici girişi
      </span>
      <StepIndicator step={step} />
    </div>
  );

  if (step === 'credentials') {
    return (
      <div className="space-y-8">
        {header}
        <div>
          <h2 className="text-3xl font-bold text-slate-100">Yönetim konsolu</h2>
          <p className="mt-2 text-sm text-slate-400">Yönetici hesabınızla giriş yapın. Ardından doğrulama uygulamanızdaki kod istenecek.</p>
        </div>

        <form onSubmit={handleCredentials} className="space-y-5" noValidate>
          {error && <FormAlert tone="error">{error}</FormAlert>}
          <Field
            label="E-posta adresi"
            icon={Mail}
            type="email"
            autoComplete="username"
            inputMode="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="yonetici@sirket.com"
            error={fieldErrors.email}
          />
          <PasswordField
            label="Şifre"
            icon={Lock}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            maxLength={128}
            error={fieldErrors.password}
          />
          <SubmitButton loading={loading} tone="emerald">
            Devam et {!loading && <ArrowRight className="h-4 w-4" />}
          </SubmitButton>
        </form>

        <Link href="/giris" className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Kullanıcı girişine dön
        </Link>
      </div>
    );
  }

  const countdown = (
    <div className={`flex items-center gap-1.5 font-data text-xs ${remaining < 60_000 ? 'text-amber-400' : 'text-slate-500'}`}>
      <Timer className="h-3.5 w-3.5" /> {formatRemaining(remaining)}
    </div>
  );

  if (expired) {
    return (
      <div className="space-y-6">
        {header}
        <FormAlert tone="error">Doğrulama süresi doldu. Güvenliğiniz için şifrenizi yeniden girmeniz gerekiyor.</FormAlert>
        <SubmitButton tone="emerald" type="button" onClick={() => restart(null)}>
          Yeniden giriş yap
        </SubmitButton>
      </div>
    );
  }

  const codeForm = (
    <div className="space-y-4">
      <OtpInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (codeInvalid) setCodeInvalid(false);
        }}
        onComplete={submitCode}
        disabled={loading}
        invalid={codeInvalid}
        autoFocus={step === 'verify'}
      />
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <SubmitButton tone="emerald" type="button" loading={loading} disabled={code.length !== 6} onClick={() => submitCode(code)}>
        Doğrula ve giriş yap
      </SubmitButton>
    </div>
  );

  if (step === 'setup' && mfa?.otpauth_uri && mfa.totp_secret) {
    const groupedSecret = mfa.totp_secret.match(/.{1,4}/g)?.join(' ') ?? mfa.totp_secret;
    return (
      <div className="space-y-7">
        {header}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">İki adımlı doğrulamayı kurun</h2>
            <p className="mt-2 text-sm text-slate-400">İlk yönetici girişiniz. Bu kurulum bir kez yapılır.</p>
          </div>
          {countdown}
        </div>

        <ol className="space-y-6">
          <li className="flex gap-3">
            <StepBadge n={1} />
            <p className="text-sm leading-relaxed text-slate-300">
              Telefonunuza bir doğrulama uygulaması kurun: <span className="text-slate-100">Google Authenticator</span>,{' '}
              <span className="text-slate-100">Microsoft Authenticator</span> veya <span className="text-slate-100">1Password</span>.
            </p>
          </li>
          <li className="flex gap-3">
            <StepBadge n={2} />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm leading-relaxed text-slate-300">Uygulamada &quot;hesap ekle&quot; deyip bu QR kodu okutun.</p>
              <div className="w-fit rounded-xl bg-white p-3">
                <QRCodeSVG value={mfa.otpauth_uri} size={168} level="M" marginSize={0} title="İki adımlı doğrulama QR kodu" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">QR okutamıyorsanız bu anahtarı elle girin:</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 font-data text-xs tracking-wider text-slate-200">
                    {groupedSecret}
                  </code>
                  <button
                    type="button"
                    onClick={copySecret}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    aria-label="Anahtarı kopyala"
                    title="Anahtarı kopyala"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <StepBadge n={3} />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm leading-relaxed text-slate-300">Uygulamanın gösterdiği 6 haneli kodu girin.</p>
              {codeForm}
            </div>
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {header}
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <Smartphone className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-100">Doğrulama kodu</h2>
            <p className="mt-1 text-sm text-slate-400">Doğrulama uygulamanızdaki 6 haneli kodu girin.</p>
          </div>
        </div>
        {countdown}
      </div>
      {codeForm}
      <button
        type="button"
        onClick={() => restart(null)}
        className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Farklı hesapla giriş yap
      </button>
      <p className="text-xs leading-relaxed text-slate-500">
        Telefonunuza erişiminiz yoksa başka bir yöneticiden iki adımlı doğrulamanızı sıfırlamasını isteyin.
      </p>
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 font-data text-xs text-emerald-300">
      {n}
    </span>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const current = step === 'credentials' ? 0 : 1;
  const labels = ['Şifre', 'Doğrulama kodu'];
  return (
    <div className="flex items-center gap-3 font-data text-[11px] uppercase tracking-wider">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-3">
          {i > 0 && <span className={`h-px w-8 ${current >= i ? 'bg-emerald-500/60' : 'bg-slate-700'}`} />}
          <span className={`flex items-center gap-1.5 ${current === i ? 'text-emerald-300' : current > i ? 'text-slate-400' : 'text-slate-600'}`}>
            {current > i ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}.</span>}
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
