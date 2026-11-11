'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Lock, ShieldX } from 'lucide-react';
import { ApiError, resetPassword } from '@/services/api';
import { clearSession } from '@/lib/auth';
import { FormAlert, PasswordField, PasswordStrength, SubmitButton, passwordPolicyError } from '@/components/auth/fields';

export default function ResetPasswordForm() {
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(!token);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !token) return;
    setFormError(null);

    const found: typeof errors = {};
    const policy = passwordPolicyError(password);
    if (policy) found.password = policy;
    if (password !== confirm) found.confirm = 'Şifreler birbiriyle eşleşmiyor.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setLoading(true);
    try {
      await resetPassword(token, password);
      // Every session was revoked on the server; drop the local one too
      clearSession();
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_token') setLinkInvalid(true);
      else setFormError(err instanceof Error ? err.message : 'Şifre güncellenemedi.');
    } finally {
      setLoading(false);
    }
  };

  if (linkInvalid) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10">
          <ShieldX className="h-7 w-7 text-rose-400" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-100">Bağlantı geçersiz</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Bu şifre sıfırlama bağlantısının süresi dolmuş, daha önce kullanılmış ya da eksik kopyalanmış olabilir. Yeni bir bağlantı isteyebilirsiniz.
          </p>
        </div>
        <Link
          href="/sifremi-unuttum"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          Yeni bağlantı iste <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-100">Şifreniz güncellendi</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Güvenliğiniz için tüm cihazlardaki açık oturumlar kapatıldı. Yeni şifrenizle giriş yapabilirsiniz.
          </p>
        </div>
        <Link
          href="/giris"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          Giriş yap <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-100">Yeni şifre belirleyin</h2>
        <p className="mt-2 text-sm text-slate-400">Daha önce kullanmadığınız, tahmin edilmesi zor bir şifre seçin.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {formError && <FormAlert tone="error">{formError}</FormAlert>}
        <div className="space-y-3">
          <PasswordField
            label="Yeni şifre"
            icon={Lock}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            maxLength={128}
            error={errors.password}
          />
          {password && <PasswordStrength password={password} />}
        </div>
        <PasswordField
          label="Yeni şifre (tekrar)"
          icon={Lock}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          maxLength={128}
          error={errors.confirm}
        />
        <SubmitButton loading={loading}>Şifremi güncelle</SubmitButton>
      </form>
    </div>
  );
}
