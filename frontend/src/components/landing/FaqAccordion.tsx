'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Accordion that animates height smoothly by transitioning grid rows (0fr -> 1fr),
 * which works for content of any length without measuring it.
 */
export default function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();

  return (
    <div className="divide-y divide-slate-800 border-y border-slate-800">
      {items.map(({ q, a }, i) => {
        const isOpen = open === i;
        const panelId = `${baseId}-panel-${i}`;
        const buttonId = `${baseId}-button-${i}`;
        return (
          <div key={q}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className={`flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left font-medium transition-colors ${
                  isOpen ? 'text-white' : 'text-slate-200 hover:text-white'
                }`}
              >
                {q}
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                    isOpen ? 'rotate-180 border-blue-500/40 bg-blue-500/10 text-blue-300' : 'border-slate-800 text-slate-500'
                  }`}
                >
                  <ChevronDown className="h-4 w-4" />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!isOpen}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <p className="pb-6 pr-10 text-sm leading-relaxed text-slate-400">{a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
