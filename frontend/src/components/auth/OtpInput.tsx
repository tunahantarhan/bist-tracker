'use client';

import { useRef } from 'react';

const LENGTH = 6;

/** Six single-digit boxes with auto-advance, backspace navigation and paste support. */
export default function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '');

  const focus = (i: number) => inputs.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();

  const update = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH);
    onChange(clean);
    if (clean.length === LENGTH) onComplete?.(clean);
  };

  const handleInput = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    // Autofill or a fast typist can deliver several digits into one box
    const next = (value.slice(0, i) + typed).slice(0, LENGTH);
    update(next);
    focus(next.length);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) {
        update(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        update(value.slice(0, i - 1) + value.slice(i));
        focus(i - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      focus(i - 1);
    } else if (e.key === 'ArrowRight') {
      focus(i + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    update(pasted);
    focus(pasted.length);
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6 haneli doğrulama kodu">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`${i + 1}. hane`}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={`h-14 w-full min-w-0 rounded-lg border bg-slate-900/60 text-center font-data text-2xl text-slate-100 outline-none transition-all disabled:opacity-60 ${
            invalid
              ? 'border-rose-500/60 focus:ring-1 focus:ring-rose-500'
              : 'border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
          } ${i === 2 ? 'mr-2 sm:mr-3' : ''}`}
        />
      ))}
    </div>
  );
}
