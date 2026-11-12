'use client';

import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowRight, Database, HeartPulse, Sliders, UserPlus, Users } from 'lucide-react';
import type { AdminUserItem, MarketOverviewResponse } from '@/services/api';
import type { Rule } from '@/types';
import MarketPulse from '@/components/dashboard/MarketPulse';
import { Eyebrow, Panel, PanelHeader } from '@/components/dashboard/Panel';
import { isBistOpen } from '@/lib/scanSummary';
import { relativeTime } from './UsersSection';
import type { AdminSection } from './AdminShell';

type Check = { label: string; detail: string; level: 'ok' | 'warn' | 'bad'; to?: AdminSection };

const LEVEL = {
  ok: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Normal' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Dikkat' },
  bad: { dot: 'bg-rose-400', text: 'text-rose-300', label: 'Sorun' },
};

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(new Date()));
  if (hour < 6) return 'İyi geceler';
  if (hour < 12) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function buildChecks(rules: Rule[], users: AdminUserItem[], overview: MarketOverviewResponse | null, usersLoaded: boolean): Check[] {
  const checks: Check[] = [];
  const primary = rules.find((r) => r.is_primary_filter);
  checks.push(
    !primary
      ? { label: 'Ana filtre', detail: 'Tanımlı ana filtre yok; bildirim üretilmez.', level: 'bad', to: 'rules' }
      : !primary.is_active
        ? { label: 'Ana filtre', detail: 'Ana filtre pasif; bildirim üretilmez.', level: 'warn', to: 'rules' }
        : { label: 'Ana filtre', detail: 'Aktif ve taramada kullanılıyor.', level: 'ok', to: 'rules' }
  );

  const total = rules.filter((r) => r.is_active).reduce((s, r) => s + Number(r.score_impact || 0), 0);
  const diff = Math.round((total - 100) * 10) / 10;
  checks.push(
    diff === 0
      ? { label: 'Ağırlık dengesi', detail: 'Aktif kuralların toplamı tam 100.', level: 'ok', to: 'rules' }
      : { label: 'Ağırlık dengesi', detail: `Aktif ağırlık toplamı ${total.toFixed(1)}; skor ölçeği 100'den sapıyor.`, level: 'warn', to: 'rules' }
  );

  if (usersLoaded) {
    const admins = users.filter((u) => u.is_admin);
    const without2fa = admins.filter((u) => !u.totp_enabled).length;
    checks.push(
      without2fa === 0
        ? { label: 'Yönetici güvenliği', detail: `${admins.length} yöneticinin tamamında 2FA açık.`, level: 'ok', to: 'users' }
        : { label: 'Yönetici güvenliği', detail: `${without2fa} yönetici henüz 2FA kurmadı.`, level: 'warn', to: 'users' }
    );
    const unverified = users.filter((u) => !u.is_verified).length;
    checks.push(
      unverified === 0
        ? { label: 'E-posta doğrulama', detail: 'Bekleyen doğrulama yok.', level: 'ok', to: 'users' }
        : { label: 'E-posta doğrulama', detail: `${unverified} hesap e-postasını doğrulamadı.`, level: 'warn', to: 'users' }
    );
  }

  if (overview?.generated_at) {
    const ageMin = (Date.now() - overview.generated_at * 1000) / 60000;
    const open = isBistOpen();
    checks.push(
      open && ageMin > 15
        ? { label: 'Tarama tazeliği', detail: `Son tarama ${Math.round(ageMin)} dk önce; seans açıkken 5 dakikada bir beklenir.`, level: 'bad' }
        : { label: 'Tarama tazeliği', detail: `Son tarama ${Math.max(0, Math.round(ageMin))} dk önce${open ? '' : ' (seans kapalı)'}.`, level: 'ok' }
    );
  } else {
    checks.push({ label: 'Tarama tazeliği', detail: 'Tarama verisi henüz alınamadı.', level: 'warn' });
  }

  if (overview && overview.items.length === 0) {
    checks.push({ label: 'Hisse evreni', detail: 'Taranan hisse yok; evrenden hisse seçin.', level: 'bad', to: 'universe' });
  }
  return checks;
}

function ShortcutCard({
  icon: Icon,
  title,
  text,
  stat,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  stat: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-800/80 bg-[#12161f] p-5 text-left transition-colors hover:border-slate-700"
    >
      <div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="mt-4 font-semibold text-slate-100">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">{text}</p>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-800/80 pt-3">
        <span className="font-data text-xs text-slate-400">{stat}</span>
        <ArrowRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
      </div>
    </button>
  );
}

export default function OverviewSection({
  firstName,
  rules,
  users,
  usersLoaded,
  overview,
  activeStocks,
  onNavigate,
}: {
  firstName: string | null;
  rules: Rule[];
  users: AdminUserItem[];
  usersLoaded: boolean;
  overview: MarketOverviewResponse | null;
  activeStocks: number;
  onNavigate: (s: AdminSection) => void;
}) {
  const checks = buildChecks(rules, users, overview, usersLoaded);
  const issues = checks.filter((c) => c.level !== 'ok').length;
  const activeRules = rules.filter((r) => r.is_active).length;
  const recent = users.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-[#12161f] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(30 41 59 / 0.5) 1px, transparent 1px), linear-gradient(to bottom, rgb(30 41 59 / 0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 50% 100% at 100% 0%, black 10%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse 50% 100% at 100% 0%, black 10%, transparent 70%)',
          }}
        />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Eyebrow className="text-emerald-400">Yönetim konsolu</Eyebrow>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              {issues === 0
                ? 'Her şey yolunda görünüyor. Kural motoru, hisse evreni ve kullanıcılar aşağıda.'
                : `${issues} konu dikkatinizi bekliyor. Ayrıntılar sistem sağlığı listesinde.`}
            </p>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
              issues === 0 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${issues === 0 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {issues === 0 ? 'Sistem sağlıklı' : `${issues} uyarı`}
          </span>
        </div>
      </div>

      <MarketPulse overview={overview} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Panel>
          <PanelHeader icon={HeartPulse} title="Sistem sağlığı" subtitle="Otomatik kontroller" accent={issues ? 'amber' : 'emerald'} />
          <ul className="divide-y divide-slate-800/60">
            {checks.map((c) => {
              const l = LEVEL[c.level];
              const content = (
                <>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${l.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{c.label}</span>
                      <span className={`font-data text-[10px] uppercase tracking-wider ${l.text}`}>{l.label}</span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{c.detail}</span>
                  </span>
                  {c.to && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-700 transition-colors group-hover:text-slate-300" />}
                </>
              );
              return (
                <li key={c.label}>
                  {c.to ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(c.to!)}
                      className="group flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/25"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader icon={UserPlus} title="Son kayıtlar" subtitle="En yeni 5 hesap" accent="blue" />
          {!usersLoaded ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-800/40" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Henüz kullanıcı yok.</p>
          ) : (
            <ul className="divide-y divide-slate-800/60">
              {recent.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}</p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-data text-[11px] text-slate-400">{u.created_at.split(' ')[0]}</p>
                    <p className={`text-[11px] ${u.is_verified ? 'text-slate-600' : 'text-amber-400'}`}>
                      {u.is_verified ? `giriş: ${relativeTime(u.last_login_at)}` : 'doğrulama bekliyor'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => onNavigate('users')}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-slate-800/70 py-2.5 text-xs text-slate-400 transition-colors hover:bg-slate-800/30 hover:text-slate-200"
          >
            Tüm kullanıcılar <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ShortcutCard
          icon={Sliders}
          title="Kural motoru"
          text="Ana filtreyi, puanlama kurallarını ve ağırlıkları yönetin; değişiklikleri canlı önizlemede deneyin."
          stat={`${activeRules} aktif / ${rules.length} kural`}
          tone="border-blue-500/25 bg-blue-500/10 text-blue-400"
          onClick={() => onNavigate('rules')}
        />
        <ShortcutCard
          icon={Users}
          title="Kullanıcılar"
          text="Paketleri, hesap erişimini ve yönetici güvenliğini tek ekrandan yönetin."
          stat={usersLoaded ? `${users.length} kullanıcı` : '…'}
          tone="border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
          onClick={() => onNavigate('users')}
        />
        <ShortcutCard
          icon={Database}
          title="Hisse evreni"
          text="Arka planda taranan BIST hisselerini seçin; kayıttan sonra bir sonraki taramada devreye girer."
          stat={`${activeStocks} hisse taranıyor`}
          tone="border-amber-500/25 bg-amber-500/10 text-amber-400"
          onClick={() => onNavigate('universe')}
        />
      </div>

      <p className="flex items-center gap-2 text-[11px] text-slate-600">
        <Activity className="h-3.5 w-3.5" /> Kontroller sayfa açıldığında hesaplanır; yenilemek için sayfayı tazeleyin.
      </p>
    </div>
  );
}
