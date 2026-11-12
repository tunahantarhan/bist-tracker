'use client';

import { useState } from 'react';
import { KeyRound, Loader2, Search, Shield, UserCheck, UserX, Users } from 'lucide-react';
import type { AdminUserItem } from '@/services/api';
import { Panel, PanelHeader } from '@/components/dashboard/Panel';

type Filter = 'all' | 'admins' | 'suspended' | 'unverified';

const TIERS: { value: AdminUserItem['tier']; label: string }[] = [
  { value: 'FREE', label: 'Ücretsiz · 3 hisse' },
  { value: 'STANDARD', label: 'Standart · 10 hisse' },
  { value: 'PREMIUM', label: 'Premium · 50 hisse' },
];

const TIER_TONE: Record<AdminUserItem['tier'], string> = {
  FREE: 'border-slate-700 text-slate-300',
  STANDARD: 'border-blue-500/40 text-blue-200',
  PREMIUM: 'border-amber-500/40 text-amber-200',
};

export function relativeTime(iso: string | null): string {
  if (!iso) return 'Hiç';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Az önce';
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString('tr-TR');
}

function Avatar({ user }: { user: AdminUserItem }) {
  const text = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toLocaleUpperCase('tr-TR') || user.email[0].toUpperCase();
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-data text-xs font-semibold ${
        user.is_admin ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-800 text-slate-300'
      }`}
    >
      {text}
    </span>
  );
}

function Badges({ user }: { user: AdminUserItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {user.is_admin ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
          <Shield className="h-3 w-3" /> Yönetici
        </span>
      ) : (
        <span className="rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-400">Kullanıcı</span>
      )}
      {user.is_admin && (
        <span
          className={`rounded-md border px-1.5 py-0.5 text-[10px] ${
            user.totp_enabled ? 'border-emerald-500/20 text-emerald-300/80' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}
        >
          {user.totp_enabled ? '2FA açık' : '2FA kurulmadı'}
        </span>
      )}
      {!user.is_verified && (
        <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">E-posta doğrulanmadı</span>
      )}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      {active ? 'Aktif' : 'Askıda'}
    </span>
  );
}

function Actions({
  user,
  busy,
  isSelf,
  onToggleActive,
  onReset2fa,
}: {
  user: AdminUserItem;
  busy: boolean;
  isSelf: boolean;
  onToggleActive: (u: AdminUserItem) => void;
  onReset2fa: (u: AdminUserItem) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin text-slate-500" />}
      {user.is_admin && user.totp_enabled && !isSelf && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onReset2fa(user)}
          title="İki adımlı doğrulamayı sıfırla"
          aria-label={`${user.email} için 2FA sıfırla`}
          className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-amber-500/10 hover:text-amber-300 disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" />
        </button>
      )}
      {!isSelf && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleActive(user)}
          title={user.is_active ? 'Hesabı askıya al' : 'Hesabı aktifleştir'}
          aria-label={user.is_active ? `${user.email} askıya al` : `${user.email} aktifleştir`}
          className={`cursor-pointer rounded-lg p-2 transition-colors disabled:opacity-50 ${
            user.is_active ? 'text-slate-400 hover:bg-rose-500/10 hover:text-rose-300' : 'text-emerald-400 hover:bg-emerald-500/10'
          }`}
        >
          {user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

export default function UsersSection({
  users,
  loading,
  busyId,
  currentEmail,
  onTier,
  onToggleActive,
  onReset2fa,
}: {
  users: AdminUserItem[];
  loading: boolean;
  busyId: number | null;
  currentEmail: string | null;
  onTier: (u: AdminUserItem, tier: AdminUserItem['tier']) => void;
  onToggleActive: (u: AdminUserItem) => void;
  onReset2fa: (u: AdminUserItem) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const counts = {
    all: users.length,
    admins: users.filter((u) => u.is_admin).length,
    suspended: users.filter((u) => !u.is_active).length,
    unverified: users.filter((u) => !u.is_verified).length,
  };

  const q = query.trim().toLocaleLowerCase('tr-TR');
  const visible = users.filter((u) => {
    if (filter === 'admins' && !u.is_admin) return false;
    if (filter === 'suspended' && u.is_active) return false;
    if (filter === 'unverified' && u.is_verified) return false;
    if (!q) return true;
    return [u.email, u.first_name, u.last_name].some((v) => (v || '').toLocaleLowerCase('tr-TR').includes(q));
  });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Tümü' },
    { key: 'admins', label: 'Yöneticiler' },
    { key: 'suspended', label: 'Askıda' },
    { key: 'unverified', label: 'Doğrulanmamış' },
  ];

  const isSelf = (u: AdminUserItem) => !!currentEmail && u.email === currentEmail;

  const tierSelect = (u: AdminUserItem, className = '') => (
    <select
      disabled={busyId === u.id}
      value={u.tier}
      onChange={(e) => onTier(u, e.target.value as AdminUserItem['tier'])}
      aria-label={`${u.email} paket`}
      className={`cursor-pointer rounded-lg border bg-[#0d1118] px-2.5 py-1.5 text-xs outline-none [color-scheme:dark] transition-colors focus:border-blue-500 disabled:opacity-50 ${TIER_TONE[u.tier]} ${className}`}
    >
      {TIERS.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Toplam kullanıcı', value: counts.all, tone: 'text-slate-50' },
          { label: 'Aktif', value: counts.all - counts.suspended, tone: 'text-emerald-300' },
          { label: 'E-posta bekleyen', value: counts.unverified, tone: 'text-amber-300' },
          { label: 'Yönetici', value: counts.admins, tone: 'text-blue-300' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-800/80 bg-[#12161f] px-4 py-3.5">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className={`mt-1.5 font-data text-2xl font-semibold ${s.tone}`}>{loading ? '–' : s.value}</p>
          </div>
        ))}
      </div>

      <Panel>
        <PanelHeader icon={Users} title="Kullanıcı listesi" subtitle="Paket, erişim ve güvenlik durumu" accent="emerald" count={visible.length} />

        <div className="flex flex-col gap-3 border-b border-slate-800/80 p-4 md:flex-row md:items-center md:justify-between">
          <div role="tablist" className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-[#0d1118] p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  filter === f.key ? 'bg-slate-700/80 text-white' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                {f.label}
                <span className="font-data text-[10px] text-slate-500">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ad, soyad veya e-posta…"
              aria-label="Kullanıcı ara"
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/60 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-800/40" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">Bu filtreyle eşleşen kullanıcı yok.</p>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-slate-800/60 md:hidden">
              {visible.map((u) => (
                <li key={u.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar user={u} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                        {isSelf(u) && <span className="ml-1.5 text-[11px] text-slate-500">(siz)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                    </div>
                    <StatusPill active={u.is_active} />
                  </div>
                  <Badges user={u} />
                  <div className="flex items-center gap-2">
                    {tierSelect(u, 'min-w-0 flex-1')}
                    <Actions user={u} busy={busyId === u.id} isSelf={isSelf(u)} onToggleActive={onToggleActive} onReset2fa={onReset2fa} />
                  </div>
                  <p className="font-data text-[11px] text-slate-600">
                    Son giriş: {relativeTime(u.last_login_at)} · Kayıt: {u.created_at}
                  </p>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80 font-data text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3 font-normal">Kullanıcı</th>
                    <th className="px-4 py-3 font-normal">Rol ve güvenlik</th>
                    <th className="px-4 py-3 font-normal">Paket</th>
                    <th className="px-4 py-3 font-normal">Son giriş</th>
                    <th className="px-4 py-3 font-normal">Durum</th>
                    <th className="px-4 py-3 text-right font-normal">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {visible.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-slate-800/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-100">
                              {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                              {isSelf(u) && <span className="ml-1.5 text-[11px] font-normal text-slate-500">(siz)</span>}
                            </p>
                            <p className="truncate text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badges user={u} />
                      </td>
                      <td className="px-4 py-3">{tierSelect(u)}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-300">{relativeTime(u.last_login_at)}</p>
                        <p className="font-data text-[10px] text-slate-600">kayıt {u.created_at.split(' ')[0]}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill active={u.is_active} />
                      </td>
                      <td className="px-4 py-3">
                        <Actions user={u} busy={busyId === u.id} isSelf={isSelf(u)} onToggleActive={onToggleActive} onReset2fa={onReset2fa} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
