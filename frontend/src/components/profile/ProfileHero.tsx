import type { LucideIcon } from 'lucide-react';
import { Bell, BellRing, CalendarDays, Clock, MailCheck, MailWarning, ShieldCheck, Star, Zap } from 'lucide-react';
import type { UserProfile } from '@/services/api';
import { Eyebrow } from '@/components/dashboard/Panel';
import { formatDate, relativeTime } from '@/lib/time';

const GRID_BG = {
  backgroundImage:
    'linear-gradient(to right, rgb(30 41 59 / 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgb(30 41 59 / 0.45) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
  maskImage: 'radial-gradient(ellipse 70% 90% at 15% 0%, black 25%, transparent 75%)',
  WebkitMaskImage: 'radial-gradient(ellipse 70% 90% at 15% 0%, black 25%, transparent 75%)',
} as const;

export const TIER_LABEL: Record<string, string> = { FREE: 'Ücretsiz', STANDARD: 'Standart', PREMIUM: 'Premium' };

export function initialsOf(profile: Pick<UserProfile, 'first_name' | 'last_name' | 'email'>): string {
  const text = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`;
  return (text || profile.email[0]).toLocaleUpperCase('tr-TR');
}

function Badge({ icon: Icon, children, tone }: { icon: LucideIcon; children: React.ReactNode; tone: 'blue' | 'emerald' | 'amber' | 'slate' }) {
  const cls = {
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    slate: 'border-slate-700 bg-slate-800/60 text-slate-300',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export interface ProfileStats {
  watchlist: number;
  activeAlerts: number;
  totalAlerts: number;
  triggeredAlerts: number;
  unread: number;
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  accent: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-[#0d1118]/80 p-3.5 text-left transition-colors hover:border-slate-700 hover:bg-[#0d1118]"
    >
      <span className="flex items-center justify-between">
        <Eyebrow className="text-slate-500">{label}</Eyebrow>
        <Icon className={`h-4 w-4 ${accent}`} />
      </span>
      <span>
        <span className="block font-data text-2xl font-semibold text-slate-100">{value}</span>
        <span className="mt-0.5 block text-[11px] text-slate-500 group-hover:text-slate-400">{hint}</span>
      </span>
    </button>
  );
}

export default function ProfileHero({
  profile,
  stats,
  onNavigate,
}: {
  profile: UserProfile;
  stats: ProfileStats;
  onNavigate: (tab: 'ozet' | 'alarmlar' | 'bildirimler' | 'hesap') => void;
}) {
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-[#12161f]">
      <div className="pointer-events-none absolute inset-0" style={GRID_BG} aria-hidden />
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-blue-600/15 blur-3xl" aria-hidden />

      <div className="relative grid gap-6 p-5 md:p-7 xl:grid-cols-[1fr_minmax(0,560px)] xl:items-center">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <div className="rounded-[22px] bg-gradient-to-br from-blue-500/70 via-slate-700 to-emerald-500/60 p-px">
              <div className="flex h-20 w-20 items-center justify-center rounded-[21px] bg-[#0d1118] font-data text-2xl font-semibold text-slate-100">
                {initialsOf(profile)}
              </div>
            </div>
            {profile.is_verified && (
              <span
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#12161f] bg-emerald-500 text-[#0b0e14]"
                title="E-posta doğrulandı"
              >
                <MailCheck className="h-3 w-3" strokeWidth={2.5} />
              </span>
            )}
          </div>

          <div className="min-w-0 space-y-2.5">
            <Eyebrow className="text-blue-400">Hesabım</Eyebrow>
            <h1 className="truncate text-2xl font-semibold tracking-tight text-white md:text-3xl">{fullName}</h1>
            <p className="truncate font-data text-xs text-slate-400">{profile.email}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge icon={Star} tone="blue">
                {TIER_LABEL[profile.tier] ?? profile.tier} plan
              </Badge>
              {profile.is_verified ? (
                <Badge icon={MailCheck} tone="emerald">
                  Doğrulanmış
                </Badge>
              ) : (
                <Badge icon={MailWarning} tone="amber">
                  Doğrulama bekliyor
                </Badge>
              )}
              {profile.is_admin && (
                <Badge icon={ShieldCheck} tone={profile.totp_enabled ? 'emerald' : 'amber'}>
                  Yönetici{profile.totp_enabled ? ' · 2FA' : ''}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(profile.created_at)} tarihinden beri üye
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Son giriş {relativeTime(profile.last_login_at, '—').toLocaleLowerCase('tr-TR')}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile
            icon={Star}
            label="Takip"
            value={stats.watchlist}
            hint="hisse izleniyor"
            accent="text-amber-400"
            onClick={() => onNavigate('ozet')}
          />
          <StatTile
            icon={Bell}
            label="Alarm"
            value={stats.activeAlerts}
            hint={stats.totalAlerts > stats.activeAlerts ? `${stats.totalAlerts - stats.activeAlerts} duraklatıldı` : 'aktif alarm'}
            accent="text-blue-400"
            onClick={() => onNavigate('alarmlar')}
          />
          <StatTile
            icon={Zap}
            label="Tetiklenen"
            value={stats.triggeredAlerts}
            hint="en az bir kez"
            accent="text-emerald-400"
            onClick={() => onNavigate('alarmlar')}
          />
          <StatTile
            icon={BellRing}
            label="Okunmamış"
            value={stats.unread}
            hint="bildirim"
            accent={stats.unread > 0 ? 'text-rose-400' : 'text-slate-500'}
            onClick={() => onNavigate('bildirimler')}
          />
        </div>
      </div>
    </section>
  );
}
