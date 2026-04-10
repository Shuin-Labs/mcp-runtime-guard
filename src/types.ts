export interface ToolMatcher {
  matches: string;
}

export interface ArgCondition {
  matches?: string;
  not_matches?: string;
}

export interface Rule {
  name: string;
  tool: string | ToolMatcher;
  when?: Record<string, ArgCondition>;
  action: 'allow' | 'block';
  message?: string;
}

export interface LoggingConfig {
  level?: 'debug' | 'info' | 'warn';
  file?: string;
}

export interface Policy {
  version: number;
  default_action: 'allow' | 'block';
  rules: Rule[];
  logging?: LoggingConfig;
}

export interface LogEntry {
  ts: string;
  action: 'ALLOW' | 'BLOCK';
  tool: string;
  args: Record<string, unknown>;
  rule: string | null;
  message: string | null;
}

export interface PolicyCheckResult {
  action: 'allow' | 'block';
  rule: Rule | null;
}
