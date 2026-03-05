export interface CodexAuth {
  tokens: {
    access_token: string;
    account_id?: string;
    id_token?: string;
  };
}

export interface CodexUsageWindow {
  used_percent?: number;
  reset_at?: number | string;
  resets_at?: number | string;
  resetAt?: number | string;
  resetsAt?: number | string;
  window_end?: number | string;
  window_end_at?: number | string;
  windowEnd?: number | string;
  windowEndAt?: number | string;
}

export interface CodexUsageApiResponse {
  rate_limit: {
    primary_window?: CodexUsageWindow;
    secondary_window?: CodexUsageWindow;
  };
}

export interface CodexStatusInfo {
  primaryWindowUsed: number;
  primaryWindowResetTime: string;
  secondaryWindowUsed: number;
  secondaryWindowResetTime: string;
}
