export interface ClaudeUsageResponse {
  type: string;
  subtype: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage: ClaudeUsage;
  modelUsage: Record<string, unknown>;
  service_tier: string;
}

export interface ClaudeUsage {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

export interface ClaudeStatusInfo {
  sessionUsed: number;
  sessionResetTime: string;
  weeklyUsed: number;
  weeklyResetTime: string;
  hasSubscription: boolean;
}

export interface ClaudeCredentials {
  claudeAiOauth: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

export interface ClaudeUsageWindow {
  utilization?: number;
  reset_at?: string;
  resets_at?: string;
  resetAt?: string;
  resetsAt?: string;
  window_end?: string;
  window_end_at?: string;
  windowEnd?: string;
  windowEndAt?: string;
}

export interface ClaudeUsageApiResponse {
  five_hour?: ClaudeUsageWindow;
  seven_day?: ClaudeUsageWindow;
  extra_usage?: {
    is_enabled?: boolean;
    utilization?: number;
    used_credits?: number;
    monthly_limit?: number;
  };
}
