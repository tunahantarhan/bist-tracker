'use client';

import { useState } from 'react';
import { Check, Database, Loader2, RotateCcw, Search } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/dashboard/Panel';

type View = 'all' | 'active' | 'inactive';

export default function UniverseSection({
  catalog,
  saved,
  draft,
  onDraft,
  onSave,
  saving,
}: {
  catalog: { symbol: string; name: string }[];
  saved: string[];
  draft: string[];
  onDraft: (next: string[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');

  const savedSet = new Set(saved);
  const draftSet = new Set(draft);
  const added = draft.filter((s) => !savedSet.has(s)).length;
  const removed = saved.filter((s) => !draftSet.has(s)).length;
  const dirty = added > 0 || removed > 0;

  const q = query.trim().toLocaleLowerCase('tr-TR');
  const visible = catalog.filter((u) => {
    if (view === 'active' && !draftSet.has(u.symbol)) return false;
    if (view === 'inactive' && draftSet.has(u.symbol)) return false;
    return !q || u.symbol.toLocaleLowerCase('tr-TR').includes(q) || u.name.toLocaleLowerCase('tr-TR').includes(q);
  });

  const toggle = (symbol: string) => onDraft(draftSet.has(symbol) ? draft.filter((s) => s !== symbol) : [...draft, symbol]);
  const visibleSymbols = visible.map((v) => v.symbol);
  const selectVisible = () => onDraft(Array.from(new Set([...draft, ...visibleSymbols])));
  const clearVisible = () => onDraft(draft.filter((s) => !visibleSymbols.includes(s)));

  return (
    <div className="space-y-5 pb-24">
      <Panel>
        <PanelHeader
          icon={Database}
          title="Taranan hisseler"
          subtitle="Seçili hisseler her taramada skorlanır ve bildirim üretebilir"
          accent="amber"
          right={
            <span className="font-data text-xs text-slate-400">
              <span className="text-amber-300">{draft.length}</span> / {catalog.length}
            </span>
          }
        />

        <div className="flex flex-col gap-3 border-b border-slate-800/80 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sembol veya şirket…"
                aria-label="Hisse ara"
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/60 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div role="tablist" className="flex rounded-lg border border-slate-800 bg-[#0d1118] p-0.5">
              {(
                [
                  { key: 'all', label: 'Tümü' },
                  { key: 'active', label: 'Seçili' },
                  { key: 'inactive', label: 'Seçili değil' },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={view === v.key}
                  onClick={() => setView(v.key)}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-xs transition-colors ${
                    view === v.key ? 'bg-slate-700/80 text-white' : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectVisible}
              className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-800"
            >
              {q || view !== 'all' ? 'Görünenleri seç' : 'Tümünü seç'}
            </button>
            <button
              type="button"
              onClick={clearVisible}
              className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-800"
            >
              {q || view !== 'all' ? 'Görünenleri kaldır' : 'Temizle'}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">Eşleşen hisse yok.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {visible.map((u) => {
              const on = draftSet.has(u.symbol);
              const changed = on !== savedSet.has(u.symbol);
              return (
                <li key={u.symbol}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(u.symbol)}
                    title={u.name}
                    className={`relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      on ? 'border-amber-500/35 bg-amber-500/[0.07] hover:bg-amber-500/[0.12]' : 'border-slate-800 bg-[#0d1118] hover:border-slate-700'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        on ? 'border-amber-400 bg-amber-400 text-[#12161f]' : 'border-slate-600'
                      }`}
                    >
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block font-data text-sm font-semibold ${on ? 'text-slate-100' : 'text-slate-400'}`}>{u.symbol}</span>
                      <span className="block truncate text-[11px] text-slate-500">{u.name}</span>
                    </span>
                    {changed && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-400" title="Kaydedilmemiş değişiklik" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Save bar appears only while there are unsaved changes */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 lg:left-64 ${dirty ? 'translate-y-0' : 'translate-y-full'}`}
        inert={!dirty}
      >
        <div className="mx-4 mb-4 flex flex-col gap-3 rounded-2xl border border-slate-700 bg-[#12161f]/95 p-4 shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:justify-between md:mx-8">
          <p className="text-sm text-slate-300">
            Kaydedilmemiş değişiklik:{' '}
            <span className="font-data text-emerald-300">+{added}</span> <span className="font-data text-rose-300">−{removed}</span>
            <span className="ml-2 hidden text-xs text-slate-500 sm:inline">Kayıttan sonra skorlar bir sonraki taramada güncellenir.</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onDraft(saved)}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 sm:flex-none"
            >
              <RotateCcw className="h-4 w-4" /> Geri al
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60 sm:flex-none"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Kaydet ({draft.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
