import { readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { RunContext } from '../config/index.js';
import type { CodexAuth, CodexUsageApiResponse, CodexStatusInfo } from './types.js';

export class CodexClient {
  private context: RunContext;

  constructor(context: RunContext) {
    this.context = context;
  }

  private async getCredentials(): Promise<CodexAuth> {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const authPath = path.join(codexHome, 'auth.json');
    
    try {
      const content = await readFile(authPath, 'utf-8');
      return JSON.parse(content) as CodexAuth;
    } catch {
      throw new Error('Not logged in. Run: codex login');
    }
  }

  private extractResetTimestamp(window: unknown): number | string | null {
    if (!window || typeof window !== 'object') return null;
    const w = window as Record<string, unknown>;
    const fields = [
      'reset_at', 'resets_at', 'resetAt', 'resetsAt',
      'window_end', 'window_end_at', 'windowEnd', 'windowEndAt'
    ];
    for (const field of fields) {
      const val = w[field];
      if (typeof val === 'number') {
        return val;
      }
      if (typeof val === 'string') {
        return val;
      }
    }
    return null;
  }

  private normalizeTimestamp(timestamp: number | string): number {
    if (typeof timestamp === 'number') {
      if (timestamp > 100000000000) {
        return Math.floor(timestamp / 1000);
      }
      return Math.floor(timestamp);
    }
    
    if (/^\d+(\.\d+)?$/.test(timestamp)) {
      let num = parseFloat(timestamp);
      if (num > 100000000000) {
        num = Math.floor(num / 1000);
      }
      return Math.floor(num);
    }
    
    let cleaned = timestamp.replace(/(\d)\.\d+/, '$1');
    if (cleaned.endsWith('Z')) {
      cleaned = cleaned.slice(0, -1) + '+00:00';
    }
    
    const date = new Date(cleaned);
    if (isNaN(date.getTime())) {
      return 0;
    }
    return Math.floor(date.getTime() / 1000);
  }

  private extractAccountIdFromToken(idToken: string): string | undefined {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) return undefined;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      return payload['https://api.openai.com/auth']?.chatgpt_account_id || undefined;
    } catch {
      return undefined;
    }
  }

  async getUsageStats(): Promise<CodexStatusInfo> {
    const creds = await this.getCredentials();
    const token = creds.tokens?.access_token;
    let accountId = creds.tokens?.account_id;
    
    if (!accountId && creds.tokens?.id_token) {
      accountId = this.extractAccountIdFromToken(creds.tokens.id_token);
    }
    
    if (!token) {
      throw new Error('Not logged in. Run: codex login');
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    };
    
    if (accountId) {
      headers['ChatGPT-Account-Id'] = accountId;
    }

    const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
      headers
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Session expired. Log in to Codex again');
      }
      throw new Error(`Request failed: HTTP ${response.status}`);
    }

    const data = await response.json() as CodexUsageApiResponse;
    
    const primary = data.rate_limit?.primary_window?.used_percent || 0;
    const primaryReset = this.extractResetTimestamp(data.rate_limit?.primary_window);
    const primaryResetEpoch = primaryReset ? this.normalizeTimestamp(primaryReset) : 0;
    
    const secondary = data.rate_limit?.secondary_window?.used_percent || 0;
    const secondaryReset = this.extractResetTimestamp(data.rate_limit?.secondary_window);
    const secondaryResetEpoch = secondaryReset ? this.normalizeTimestamp(secondaryReset) : 0;

    return {
      primaryWindowUsed: Math.floor(primary),
      primaryWindowResetTime: primaryResetEpoch > 0 
        ? new Date(primaryResetEpoch * 1000).toISOString()
        : 'Unknown',
      secondaryWindowUsed: Math.floor(secondary),
      secondaryWindowResetTime: secondaryResetEpoch > 0 
        ? new Date(secondaryResetEpoch * 1000).toISOString()
        : 'Unknown'
    };
  }
}
