// Indicator parameters, e.g. { length: 14 } or { length: 22, std_dev: 2 }
export type RuleParams = Record<string, number>;

export interface Rule {
  id: number;
  name: string;
  description?: string | null;
  timeframe: string; // "5m" | "15m" | "1h" | "4h" | "1d"
  is_primary_filter: boolean;
  indicator_1: string;
  indicator_1_params?: RuleParams | null;
  condition: string;
  target_type: 'static' | 'indicator';
  static_value?: number | null;
  indicator_2?: string | null;
  indicator_2_params?: RuleParams | null;
  score_impact: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}
