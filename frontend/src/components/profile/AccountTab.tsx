'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, KeyRound, Loader2, LogOut, Mail, MonitorSmartphone, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { ApiError, changePassword, deleteAccount, logoutAllSessions, updateProfile, type UserProfile } from '@/services/api';
import { Panel, PanelHeader } from '@/components/dashboard/Panel';
import { Field, FormAlert, PasswordField, PasswordStrength, SubmitButton, passwordPolicyError } from '@/components/auth/fields';
import { useFeedback } from '@/components/ui/feedback';
import { formatDateTime, relativeTime } from '@/lib/time';

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

function ProfileForm({ profile, onUpdated }: { profile: UserProfile; onUpdated: (p: UserProfile) => void }) {
  const { toast } = useFeedback();
  const [first, setFirst] = useState(profile.first_name ?? '');
  const [last, setLast] = useState(profile.last_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = first.trim() !== (profile.first_name ?? '') || last.trim() !== (profile.last_name ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!first.trim() || !last.trim()) return setError('Ad ve soyad boş bırakılamaz.');
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile({ first_name: first.trim(), last_name: last.trim() });
      onUpdated(updated);
      toast('Profil bilgilerin güncellendi.');
    } catch (err) {
      setError(errorText(err, 'Profil güncellenemedi.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeader icon={UserRound} title="Profil bilgileri" subtitle="Adın bildirim e-postalarında ve menüde görünür" accent="blue" />
      <form onSubmit={submit} className="space-y-4 p-4 md:p-5">
        {error && <FormAlert tone="error">{error}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={50} autoComplete="given-name" />
          <Field label="Soyad" value={last} onChange={(e) => setLast(e.target.value)} maxLength={50} autoComplete="family-name" />
        </div>
        <Field
          label="E-posta"
          icon={Mail}
          value={profile.email}
          readOnly
          disabled
          hint={profile.is_verified ? 'Doğrulanmış adres. E-posta değişikliği şu an desteklenmiyor.' : 'Adres henüz doğrulanmadı.'}
        />
        <div className="flex justify-end">
          <SubmitButton loading={saving} disabled={!dirty} className="sm:w-auto">
            Değişiklikleri kaydet
          </SubmitButton>
        </div>
      </form>
    </Panel>
  );
}

function PasswordForm() {
  const { toast } = useFeedback();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const policy = passwordPolicyError(next);
    if (!current) return setError('Mevcut şifreni gir.');
    if (policy) return setError(policy);
    if (next !== repeat) return setError('Yeni şifreler eşleşmiyor.');
    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      toast('Şifren değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.');
    } catch (err) {
      setError(errorText(err, 'Şifre değiştirilemedi.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeader icon={KeyRound} title="Şifre" subtitle="Değiştirince diğer cihazlardaki oturumlar kapanır" accent="amber" />
      <form onSubmit={submit} className="space-y-4 p-4 md:p-5">
        {error && <FormAlert tone="error">{error}</FormAlert>}
        <PasswordField label="Mevcut şifre" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField label="Yeni şifre" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <PasswordField
            label="Yeni şifre (tekrar)"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            error={repeat && next !== repeat ? 'Şifreler eşleşmiyor.' : null}
          />
        </div>
        {next && <PasswordStrength password={next} />}
        <div className="flex justify-end">
          <SubmitButton loading={saving} disabled={!current || !next || !repeat} className="sm:w-auto">
            Şifreyi değiştir
          </SubmitButton>
        </div>
      </form>
    </Panel>
  );
}

function SessionsCard({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);

  const logoutAll = async () => {
    const ok = await confirm({
      title: 'Tüm cihazlardan çıkış yapılsın mı?',
      message: 'Bu cihaz dahil açık olan bütün oturumların kapanır, yeniden giriş yapman gerekir.',
      confirmLabel: 'Çıkış yap',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await logoutAllSessions();
      router.replace('/giris');
    } catch (err) {
      toast(errorText(err, 'Oturumlar kapatılamadı.'), 'error');
      setBusy(false);
    }
  };

  const checks = [
    { ok: profile.is_verified, label: 'E-posta adresi doğrulandı' },
    ...(profile.is_admin ? [{ ok: profile.totp_enabled, label: 'Yönetici iki adımlı doğrulaması açık' }] : []),
  ];

  return (
    <Panel>
      <PanelHeader icon={ShieldCheck} title="Güvenlik" accent="emerald" />
      <div className="space-y-4 p-4 md:p-5">
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${c.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className={c.ok ? 'text-slate-300' : 'text-amber-200'}>{c.label}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-xl border border-slate-800 bg-[#0d1118] p-3.5">
          <div className="flex items-start gap-3">
            <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0 text-xs">
              <p className="text-slate-300">Son giriş</p>
              <p className="mt-0.5 font-data text-slate-500" title={formatDateTime(profile.last_login_at)}>
                {formatDateTime(profile.last_login_at)} · {relativeTime(profile.last_login_at, '—')}
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={logoutAll}
          disabled={busy}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Tüm cihazlardan çıkış yap
        </button>
      </div>
    </Panel>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = password.length > 0 && phrase.trim().toLocaleUpperCase('tr-TR') === 'SİL';

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Hesap silinemedi.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" onClick={() => !busy && onClose()} />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="relative w-full max-w-md space-y-4 rounded-2xl border border-rose-500/25 bg-[#12161f] p-6 shadow-2xl animate-in zoom-in-95 duration-150"
      >
        <div className="flex gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 id="delete-title" className="text-base font-semibold text-slate-100">
              Hesabını kalıcı olarak sil
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              Takip listen, alarmların ve bildirimlerin silinir. Bu işlem geri alınamaz.
            </p>
          </div>
        </div>
        {error && <FormAlert tone="error">{error}</FormAlert>}
        <PasswordField label="Şifren" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <Field
          ref={inputRef}
          label='Onaylamak için "SİL" yaz'
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          autoComplete="off"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="cursor-pointer rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Hesabı sil
          </button>
        </div>
      </form>
    </div>
  );
}

function DangerZone({ profile }: { profile: UserProfile }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] p-4 md:p-5">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-rose-200">Hesabı sil</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-400">
            KVKK kapsamındaki silme hakkın için hesabını ve sana ait tüm verileri kalıcı olarak silebilirsin. Ayrıntılar için{' '}
            <Link href="/yasal" className="text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-white">
              yasal metinlere
            </Link>{' '}
            bakabilirsin.
          </p>
          {profile.is_admin && (
            <p className="mt-2 text-xs text-amber-300/90">Yönetici hesapları buradan silinemez; önce yönetici yetkisinin kaldırılması gerekir.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={profile.is_admin}
          className="inline-flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" /> Hesabı sil
        </button>
      </div>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </section>
  );
}

export default function AccountTab({ profile, onUpdated }: { profile: UserProfile; onUpdated: (p: UserProfile) => void }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <ProfileForm profile={profile} onUpdated={onUpdated} />
        <PasswordForm />
      </div>
      <div className="min-w-0 space-y-5">
        <SessionsCard profile={profile} />
        <DangerZone profile={profile} />
      </div>
    </div>
  );
}
