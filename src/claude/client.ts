import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { RunContext } from '../config/index.js';
import type { ClaudeCredentials, ClaudeUsageApiResponse, ClaudeStatusInfo } from './types.js';

const execAsync = promisify(exec);

export class ClaudeClient {
  private context: RunContext;

  constructor(context: RunContext) {
    this.context = context;
  }

  private async getTokenFromFile(): Promise<string | null> {
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    try {
      const content = await readFile(credsPath, 'utf-8');
      const creds = JSON.parse(content) as ClaudeCredentials;
      return creds.claudeAiOauth?.accessToken || null;
    } catch {
      return null;
    }
  }

  private async getTokenFromKeychain(): Promise<string | null> {
    if (process.platform !== 'darwin') return null;
    
    try {
      const { stdout } = await execAsync(
        'security find-generic-password -s "Claude Code-credentials" -w'
      );
      const creds = JSON.parse(stdout) as ClaudeCredentials;
      return creds.claudeAiOauth?.accessToken || null;
    } catch {
      return null;
    }
  }

  private async getAccessToken(): Promise<string> {
    let token = await this.getTokenFromFile();
    if (!token) {
      token = await this.getTokenFromKeychain();
    }
    if (!token) {
      throw new Error('Not logged in. Run: claude /login');
    }
    return token;
  }

  private extractResetTimestamp(window: unknown): string | null {
    if (!window || typeof window !== 'object') return null;
    const w = window as Record<string, unknown>;
    const fields = [
      'reset_at', 'resets_at', 'resetAt', 'resetsAt',
      'window_end', 'window_end_at', 'windowEnd', 'windowEndAt'
    ];
    for (const field of fields) {
      if (typeof w[field] === 'string') {
        return w[field] as string;
      }
    }
    return null;
  }

  private normalizeTimestamp(timestamp: string): number {
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

  async getUsageStats(): Promise<ClaudeStatusInfo> {
    const token = await this.getAccessToken();
    
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Session expired. Run: claude /login');
      }
      throw new Error(`Request failed: HTTP ${response.status}`);
    }
    
    const data = await response.json() as ClaudeUsageApiResponse;
    
    const fiveHour = data.five_hour?.utilization || 0;
    const fiveHourReset = this.extractResetTimestamp(data.five_hour);
    const fiveHourResetEpoch = fiveHourReset ? this.normalizeTimestamp(fiveHourReset) : 0;
    
    const weekly = data.seven_day?.utilization || 0;
    const weeklyReset = this.extractResetTimestamp(data.seven_day);
    const weeklyResetEpoch = weeklyReset ? this.normalizeTimestamp(weeklyReset) : 0;
    
    return {
      sessionUsed: Math.floor(fiveHour),
      sessionResetTime: fiveHourResetEpoch > 0 
        ? new Date(fiveHourResetEpoch * 1000).toISOString()
        : 'Unknown',
      weeklyUsed: Math.floor(weekly),
      weeklyResetTime: weeklyResetEpoch > 0 
        ? new Date(weeklyResetEpoch * 1000).toISOString()
        : 'Unknown',
      hasSubscription: true
    };
  }
}
