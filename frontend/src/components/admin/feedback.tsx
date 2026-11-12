'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastTone = 'success' | 'error' | 'info';
type Toast = { id: number; tone: ToastTone; message: string };

const TOAST_STYLE: Record<ToastTone, { box: string; icon: typeof Info }> = {
  success: { box: 'border-emerald-500/30 text-emerald-200', icon: CheckCircle2 },
  error: { box: 'border-rose-500/30 text-rose-200', icon: XCircle },
  info: { box: 'border-blue-500/30 text-blue-100', icon: Info },
};

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'default';
};

type FeedbackApi = {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}

function ConfirmModal({ options, onResolve }: { options: ConfirmOptions; onResolve: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onResolve(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onResolve]);

  const danger = options.tone === 'danger';
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={() => onResolve(false)} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-[#12161f] p-6 shadow-2xl animate-in zoom-in-95 duration-150"
      >
        <div className="flex gap-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              danger ? 'border-rose-500/30 bg-rose-500/10 text-rose-400' : 'border-blue-500/30 bg-blue-500/10 text-blue-400'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-slate-100">
              {options.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{options.message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="cursor-pointer rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
          >
            Vazgeç
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onResolve(true)}
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
              danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {options.confirmLabel ?? 'Onayla'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    []
  );

  const resolveConfirm = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending]
  );

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      <div className="pointer-events-none fixed bottom-4 right-4 z-[95] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const { box, icon: Icon } = TOAST_STYLE[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-[#12161f]/95 p-3.5 text-sm shadow-2xl backdrop-blur animate-in slide-in-from-bottom-3 fade-in duration-200 ${box}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="flex-1 leading-relaxed">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Kapat"
                className="cursor-pointer rounded p-0.5 text-slate-500 transition-colors hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {pending && <ConfirmModal options={pending.options} onResolve={resolveConfirm} />}
    </FeedbackContext.Provider>
  );
}
