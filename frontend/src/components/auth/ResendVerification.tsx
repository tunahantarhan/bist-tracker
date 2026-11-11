'use client';

import { useEffect, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { resendVerification } from '@/services/api';

const COOLDOWN_SECONDS = 60;

/** "Resend verification e-mail" link with a client-side cooldown (the API is rate limited too). */
export default function ResendVerification({ email, initialCooldown = 0 }: { email: string; initialCooldown?: number }) {
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const handleClick = async () => {
    setSending(true);
    setMessage(null);
    try {
      await resendVerification(email);
      setMessage({ text: 'Doğrulama e-postası yeniden gönderildi.', ok: true });
      setCooldown(COOLDOWN_SECONDS);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'E-posta gönderilemedi.', ok: false });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={sending || cooldown > 0}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-blue-300 underline-offset-4 hover:text-blue-200 hover:underline disabled:cursor-not-allowed disabled:text-slate-500 disabled:no-underline"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        {cooldown > 0 ? (
          <span>
            Tekrar gönder <span className="font-data">({cooldown} sn)</span>
          </span>
        ) : (
          'Doğrulama e-postasını tekrar gönder'
        )}
      </button>
      {message && <p className={`text-xs ${message.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{message.text}</p>}
    </div>
  );
}
