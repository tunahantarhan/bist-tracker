'use client';

import { forwardRef, useId, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, ArrowBigUpDash, Check, CheckCircle2, Eye, EyeOff, Info, Loader2 } from 'lucide-react';

const inputBase =
  'w-full rounded-lg border bg-slate-900/50 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition-all disabled:opacity-60';
const inputOk = 'border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
const inputErr = 'border-rose-500/60 focus:border-rose-500 focus:ring-1 focus:ring-rose-500';

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: LucideIcon;
  error?: string | null;
  hint?: React.ReactNode;
  labelAction?: React.ReactNode;
  rightSlot?: React.ReactNode;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, icon: Icon, error, hint, labelAction, rightSlot, id, className = '', ...inputProps },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-300">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={`${inputBase} ${error ? inputErr : inputOk} ${Icon ? 'pl-10' : 'pl-3.5'} ${rightSlot ? 'pr-11' : 'pr-3.5'}`}
          {...inputProps}
        />
        {rightSlot && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{rightSlot}</div>}
      </div>
      {error ? (
        <p id={messageId} className="flex items-center gap-1.5 text-xs text-rose-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <div id={messageId} className="text-xs text-slate-500">
          {hint}
        </div>
      ) : null}
    </div>
  );
});

export function PasswordField(props: Omit<FieldProps, 'type' | 'rightSlot'>) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const trackCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState('CapsLock'));
  };

  return (
    <Field
      {...props}
      onKeyDown={(e) => {
        trackCapsLock(e);
        props.onKeyDown?.(e);
      }}
      onKeyUp={(e) => {
        trackCapsLock(e);
        props.onKeyUp?.(e);
      }}
      onBlur={(e) => {
        setCapsLock(false);
        props.onBlur?.(e);
      }}
      hint={
        capsLock ? (
          <span className="flex items-center gap-1.5 text-amber-400">
            <ArrowBigUpDash className="h-3.5 w-3.5" /> Caps Lock açık
          </span>
        ) : (
          props.hint
        )
      }
      type={visible ? 'text' : 'password'}
      rightSlot={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          aria-label={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
          title={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}

export function SubmitButton({
  loading,
  children,
  tone = 'blue',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; tone?: 'blue' | 'emerald' }) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.25)]'
      : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_14px_rgba(37,99,235,0.3)]';
  return (
    <button
      type="submit"
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${toneClass} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

const alertTones = {
  error: { box: 'border-rose-500/25 bg-rose-500/10 text-rose-300', icon: AlertCircle },
  success: { box: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300', icon: CheckCircle2 },
  info: { box: 'border-blue-500/25 bg-blue-500/10 text-blue-200', icon: Info },
} as const;

export function FormAlert({
  tone,
  children,
  action,
}: {
  tone: keyof typeof alertTones;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { box, icon: Icon } = alertTones[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg border p-3.5 text-sm ${box}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="leading-relaxed">{children}</div>
        {action}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

/** Mirrors the backend policy: at least 8 characters with a letter and a digit. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return 'Şifre en az 8 karakter olmalıdır.';
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
    return 'Şifre en az bir harf ve bir rakam içermelidir.';
  }
  return null;
}

function strengthScore(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) && /\d/.test(password)) score++;
  if (/[a-zçğıöşü]/.test(password) && /[A-ZÇĞİÖŞÜ]/.test(password)) score++;
  if (password.length >= 12 || /[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(password)) score++;
  return score;
}

const STRENGTH = [
  { label: '', bar: 'bg-slate-700', text: 'text-slate-500' },
  { label: 'Zayıf', bar: 'bg-rose-500', text: 'text-rose-400' },
  { label: 'Orta', bar: 'bg-amber-500', text: 'text-amber-400' },
  { label: 'İyi', bar: 'bg-blue-500', text: 'text-blue-400' },
  { label: 'Güçlü', bar: 'bg-emerald-500', text: 'text-emerald-400' },
];

export function PasswordStrength({ password }: { password: string }) {
  const score = strengthScore(password);
  const level = STRENGTH[score];
  const rules = [
    { ok: password.length >= 8, text: 'En az 8 karakter' },
    { ok: /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) && /\d/.test(password), text: 'Harf ve rakam' },
  ];

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={`h-1 rounded-full transition-colors ${i <= score ? level.bar : 'bg-slate-800'}`} />
          ))}
        </div>
        <span className={`w-12 text-right font-data text-[11px] ${level.text}`}>{level.label}</span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {rules.map((r) => (
          <li key={r.text} className={`flex items-center gap-1 text-xs ${r.ok ? 'text-emerald-400' : 'text-slate-500'}`}>
            <Check className={`h-3.5 w-3.5 ${r.ok ? 'opacity-100' : 'opacity-30'}`} />
            {r.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
