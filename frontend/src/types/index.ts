export enum RuleType {
  PRICE = "PRICE",
  RSI = "RSI",
  SMA = "SMA",
}

export enum RuleOperator {
  GREATER_THAN = ">",
  LESS_THAN = "<",
  GREATER_OR_EQUAL = ">=",
  LESS_OR_EQUAL = "<=",
}

export interface RuleParameters {
  period?: number;
  [key: string]: unknown;
}

export interface Rule {
  id: number;
  symbol: string;
  rule_type: 'PRICE' | 'RSI' | 'SMA';
  operator: '>' | '<' | '>=' | '<=';
  threshold: number;
  parameters: RuleParameters;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

export interface AppNotification {
  id: number;
  rule_id: number;
  message: string;
  is_read: boolean;
  created_at: string;
}