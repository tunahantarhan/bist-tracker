import { useState } from 'react';
import Link from 'next/link';
import { BellRing, CheckCheck, Trash2, X } from 'lucide-react';
import type { AppNotification } from '@/services/api';
import { EmptyRow, Eyebrow, Panel, PanelHeader } from '@/components/dashboard/Panel';
import { Segmented } from '@/components/dashboard/InstrumentPanel';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsTab({
  items,
  onRead,
  onReadAll,
  onDelete,
  onClear,
}: {
  items: AppNotification[];
  onRead: (n: AppNotification) => void;
  onReadAll: () => void;
  onDelete: (n: AppNotification) => void;
  onClear: () => void;
}) {
  const [view, setView] = useState<'all' | 'unread'>('all');
  const unread = items.filter((n) => !n.is_read).length;
  const visible = view === 'unread' ? items.filter((n) => !n.is_read) : items;

  const groups: { label: string; items: AppNotification[] }[] = [];
  for (const n of visible) {
    const label = dayLabel(n.created_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <Panel>
      <PanelHeader icon={BellRing} title="Bildirimler" subtitle="Son 50 bildirim" accent="blue" count={items.length} />
      {items.length === 0 ? (
        <EmptyRow>Bildirim kutun boş. Alarmların ve ana filtre sinyalleri burada listelenir.</EmptyRow>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-slate-800/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-80">
              <Segmented
                label="Göster"
                value={view}
                onChange={(v) => setView(v as 'all' | 'unread')}
                options={[
                  { value: 'all', label: 'Tümü' },
                  { value: 'unread', label: `Okunmamış ${unread}` },
                ]}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onReadAll}
                disabled={unread === 0}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Tümünü okundu say
              </button>
              <button
                type="button"
                onClick={onClear}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-rose-300 transition-colors hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Temizle
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyRow>Okunmamış bildirim yok.</EmptyRow>
          ) : (
            <div className="pb-2">
              {groups.map((g) => (
                <section key={g.label}>
                  <Eyebrow className="block px-4 pb-1.5 pt-4 text-slate-600">{g.label}</Eyebrow>
                  <ul>
                    {g.items.map((n) => (
                      <li
                        key={n.id}
                        className={`group flex items-start gap-3 border-l-2 px-4 py-3 transition-colors hover:bg-slate-800/25 ${
                          n.is_read ? 'border-l-transparent' : 'border-l-blue-500 bg-blue-500/[0.03]'
                        }`}
                      >
                        <span className="w-11 shrink-0 pt-0.5 font-data text-[11px] text-slate-500">{timeOf(n.created_at)}</span>
                        <div className="min-w-0 flex-1">
                          {n.symbol && (
                            <Link
                              href={`/detay/${n.symbol}`}
                              onClick={() => !n.is_read && onRead(n)}
                              className="mb-1 inline-block rounded border border-slate-700 bg-slate-800/70 px-1.5 py-0.5 font-data text-[10px] font-semibold text-slate-200 hover:border-blue-500/50 hover:text-blue-300"
                            >
                              {n.symbol}
                            </Link>
                          )}
                          <p className={`text-xs leading-relaxed ${n.is_read ? 'text-slate-400' : 'text-slate-200'}`}>{n.message}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
                          {!n.is_read && (
                            <button
                              type="button"
                              onClick={() => onRead(n)}
                              title="Okundu say"
                              aria-label="Okundu say"
                              className="cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDelete(n)}
                            title="Sil"
                            aria-label="Bildirimi sil"
                            className="cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
