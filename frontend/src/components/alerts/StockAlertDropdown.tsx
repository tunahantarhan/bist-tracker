'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Loader2, X, SlidersHorizontal } from 'lucide-react';
import { API_URL } from '@/services/api';

interface RuleItem {
  id: number;
  name: string;
  timeframe: string;
  is_primary_filter: boolean;
  is_active: boolean;
}

interface CustomAlertItem {
  id: number;
  symbol: string;
  rule_id: number | null;
  timeframe: string;
  is_active: boolean;
}

interface StockAlertDropdownProps {
  symbol: string;
  buttonClassName?: string;
}

export default function StockAlertDropdown({ symbol, buttonClassName }: StockAlertDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [userAlerts, setUserAlerts] = useState<CustomAlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingRuleId, setTogglingRuleId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Fetch active rules and user's configured alerts for this symbol
  const loadAlertData = async () => {
    const token = localStorage.getItem('access_token');
    if (!token || !symbol) return;

    setLoading(true);
    try {
      const [rulesRes, alertsRes] = await Promise.all([
        fetch(`${API_URL}/rules`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/alerts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (rulesRes.ok) {
        const rulesData: RuleItem[] = await rulesRes.json();
        // Exclude system-wide primary RSI filter since it triggers automatically for everyone
        setRules(rulesData.filter((r) => r.is_active && !r.is_primary_filter));
      }

      if (alertsRes.ok) {
        const alertsData: CustomAlertItem[] = await alertsRes.json();
        setUserAlerts(alertsData.filter((a) => a.symbol === symbol.toUpperCase()));
      }
    } catch (err) {
      console.warn('Alert data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAlertData();
    }
  }, [isOpen, symbol]);

  // Toggle alert registration for a specific rule
  const handleToggleRuleAlert = async (rule: RuleItem) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    setTogglingRuleId(rule.id);
    const existingAlert = userAlerts.find((a) => a.rule_id === rule.id);

    try {
      if (existingAlert) {
        // Delete existing alert
        const res = await fetch(`${API_URL}/alerts/${existingAlert.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setUserAlerts((prev) => prev.filter((a) => a.id !== existingAlert.id));
        }
      } else {
        // Create new alert
        const res = await fetch(`${API_URL}/alerts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            symbol: symbol.toUpperCase(),
            rule_id: rule.id,
            timeframe: rule.timeframe || '15m',
          }),
        });
        if (res.ok) {
          const newAlert: CustomAlertItem = await res.json();
          setUserAlerts((prev) => [...prev, newAlert]);
        }
      }
    } catch (err) {
      console.error('Toggle alert error:', err);
    } finally {
      setTogglingRuleId(null);
    }
  };

  const activeAlertCount = userAlerts.length;

  return (
    <div ref={dropdownRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={
          buttonClassName ||
          `flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all cursor-pointer ${
            activeAlertCount > 0
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
              : 'bg-[#161b26] border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white'
          }`
        }
        title="Bu hisse için kural alarmları kur"
      >
        <Bell className={`h-3.5 w-3.5 ${activeAlertCount > 0 ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
        <span>{activeAlertCount > 0 ? `Alarm (${activeAlertCount})` : 'Alarm Kur'}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-88 rounded-xl border border-slate-800 bg-[#12161f] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <div className="flex items-center space-x-2">
              <SlidersHorizontal className="h-4 w-4 text-amber-400" />
              <span className="font-mono text-xs font-bold text-slate-100">{symbol} Kural Alarmları</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mt-2 mb-3 leading-relaxed">
            Seçtiğiniz kurallar sağlandığında bildirim kutunuz ve kayıtlı e-postanıza anlık uyarı iletilir.
          </p>

          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-6 flex items-center justify-center space-x-2 text-xs font-mono text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                <span>Kurallar yükleniyor...</span>
              </div>
            ) : rules.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">Aktif kural bulunamadı.</div>
            ) : (
              rules.map((rule) => {
                const isChecked = userAlerts.some((a) => a.rule_id === rule.id);
                const isProcessing = togglingRuleId === rule.id;

                return (
                  <div
                    key={rule.id}
                    onClick={() => !isProcessing && handleToggleRuleAlert(rule)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                      isChecked
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800/40 text-slate-300'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-medium truncate text-[11px]">{rule.name}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        Periyot: {rule.timeframe?.toUpperCase()}
                      </span>
                    </div>

                    <div className="shrink-0 flex items-center justify-center">
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                      ) : (
                        <div
                          className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                            isChecked
                              ? 'bg-amber-500 border-amber-400 text-slate-950'
                              : 'border-slate-600 bg-slate-800'
                          }`}
                        >
                          {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}