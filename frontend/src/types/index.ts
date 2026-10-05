export interface Rule {
  id: number;
  name: string;
  description?: string | null;
  timeframe: string; // "5m" | "15m" | "1h" | "4h" | "1d"
  is_primary_filter: boolean;
  indicator_1: string;
  indicator_1_params?: Record<string, any> | null;
  condition: string;
  target_type: 'static' | 'indicator';
  static_value?: number | null;
  indicator_2?: string | null;
  indicator_2_params?: Record<string, any> | null;
  score_impact: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AppNotification {
  id: number;
  rule_id: number;
  symbol?: string;
  message: string;
  is_read: boolean;
  created_at: string;
}