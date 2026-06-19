import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getLoginCommand } from '../login.js';
const execAsync = promisify(exec);
export class ClaudeClient {
    context;
    constructor(context) {
        this.context = context;
    }
    async getTokenFromFile() {
        const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
        try {
            const content = await readFile(credsPath, 'utf-8');
            const creds = JSON.parse(content);
            return creds.claudeAiOauth?.accessToken || null;
        }
        catch {
            return null;
        }
    }
    async getTokenFromKeychain() {
        if (process.platform !== 'darwin')
            return null;
        try {
            const { stdout } = await execAsync('security find-generic-password -s "Claude Code-credentials" -w');
            const creds = JSON.parse(stdout);
            return creds.claudeAiOauth?.accessToken || null;
        }
        catch {
            return null;
        }
    }
    async getAccessToken() {
        let token = await this.getTokenFromFile();
        if (!token) {
            token = await this.getTokenFromKeychain();
        }
        if (!token) {
            throw new Error(`Not logged in. Run: ${getLoginCommand('claude')}`);
        }
        return token;
    }
    extractResetTimestamp(window) {
        if (!window || typeof window !== 'object')
            return null;
        const w = window;
        const fields = [
            'reset_at', 'resets_at', 'resetAt', 'resetsAt',
            'window_end', 'window_end_at', 'windowEnd', 'windowEndAt'
        ];
        for (const field of fields) {
            if (typeof w[field] === 'string') {
                return w[field];
            }
        }
        return null;
    }
    normalizeTimestamp(timestamp) {
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
    async getUsageStats() {
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
                throw new Error(`Session expired. Run: ${getLoginCommand('claude')}`);
            }
            throw new Error(`Request failed: HTTP ${response.status}`);
        }
        const data = await response.json();
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
//# sourceMappingURL=client.js.map