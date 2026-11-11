'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Loader2, Mail, ShieldX } from 'lucide-react';
import { verifyEmail } from '@/services/api';
import { Field } from '@/components/auth/fields';
import ResendVerification from '@/components/auth/ResendVerification';

type State = { status: 'pending' } | { status: 'success'; message: string; email: string } | { status: 'error'; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function VerifyEmailView() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>(
    token ? { status: 'pending' } : { status: 'error', message: 'Doğrulama bağlantısı eksik.' }
  );
  const [email, setEmail] = useState('');
  // React strict mode runs effects twice in development; verify only once
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then((res) => setState({ status: 'success', message: res.message, email: res.email }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'E-posta doğrulanamadı.' })
      );
  }, [token]);

  if (state.status === 'pending') {
    return (
      <div className="flex items-center gap-3 text-slate-400" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
        E-posta adresiniz doğrulanıyor…
      </div>
    );
  }

  if (state.status === 'success') {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-100">Hesabınız hazır</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{state.message}</p>
        </div>
        <Link
          href={`/giris?email=${encodeURIComponent(state.email)}`}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          Giriş yap <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10">
        <ShieldX className="h-7 w-7 text-rose-400" />
      </div>
      <div>
        <h2 className="text-3xl font-bold text-slate-100">Doğrulama başarısız</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {state.message} Bağlantının süresi dolduysa e-posta adresinizi girip yeni bir bağlantı isteyebilirsiniz.
        </p>
      </div>
      <div className="space-y-3">
        <Field
          label="E-posta adresi"
          icon={Mail}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ornek@sirket.com"
        />
        {EMAIL_RE.test(email.trim()) && <ResendVerification email={email.trim()} />}
      </div>
      <Link href="/giris" className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200">
        Giriş ekranına dön <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
