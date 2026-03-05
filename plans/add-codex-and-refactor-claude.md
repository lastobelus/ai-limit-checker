# Plan: Add Codex Provider and Refactor Claude to Use API

## Overview

Refactor `ai-limit-checker` to support Codex usage checking and improve Claude usage reporting by switching from PTY automation to direct API calls. The refactored system will report both 5-hour and weekly usage windows with reset timestamps for each provider.

## Goals

1. Add Codex as a new provider alongside Claude, Gemini, and ZAI
2. Refactor Claude client to use OAuth API calls instead of PTY automation
3. Report both 5-hour and weekly usage windows with reset timestamps
4. Maintain backward compatibility with existing API
5. Use Test-Driven Development (TDD) approach with Vitest

## Technical Specifications

### Claude OAuth API

**Endpoint:**
```
GET https://api.anthropic.com/api/oauth/usage
```

**Required Headers:**
```typescript
{
  'Authorization': `Bearer ${accessToken}`,
  'anthropic-beta': 'oauth-2025-04-20',
  'Accept': 'application/json'
}
```

**Credentials File Structure:**
```json
// ~/.claude/.credentials.json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oauth-...",
    "refreshToken": "...",
    "expiresAt": 1234567890
  }
}
```

**macOS Keychain (fallback):**
- Service: "Claude Code-credentials"
- Extract JSON then parse `.claudeAiOauth.accessToken`

**API Response Structure:**
```json
{
  "five_hour": {
    "utilization": 45.5,
    "reset_at": "2024-01-04T16:00:00Z"
  },
  "seven_day": {
    "utilization": 23.2,
    "resets_at": "2024-01-07T00:00:00Z"
  },
  "extra_usage": {
    "is_enabled": true,
    "utilization": 15.0,
    "used_credits": 500,
    "monthly_limit": 5000
  }
}
```

**Reset Timestamp Fields (try in order):**
- `reset_at`
- `resets_at`
- `resetAt`
- `resetsAt`
- `window_end`
- `window_end_at`
- `windowEnd`
- `windowEndAt`

### Codex API

**Endpoint:**
```
GET https://chatgpt.com/backend-api/wham/usage
```

**Required Headers:**
```typescript
{
  'Authorization': `Bearer ${accessToken}`,
  'Accept': 'application/json',
  'ChatGPT-Account-Id': accountId // optional but recommended
}
```

**Credentials File Structure:**
```json
// ~/.codex/auth.json or $CODEX_HOME/auth.json
{
  "tokens": {
    "access_token": "eyJhbG...",
    "account_id": "user-abc123"
  }
}
```

**API Response Structure:**
```json
{
  "rate_limit": {
    "primary_window": {
      "used_percent": 42.5,
      "reset_at": "2024-01-04T15:30:00Z"
    },
    "secondary_window": {
      "used_percent": 18.3,
      "window_end": "2024-01-07T00:00:00Z"
    }
  }
}
```

**Reset Timestamp Fields (try in order):**
- Same as Claude (all variants)

### Timestamp Normalization

The API may return timestamps in various formats:
1. **Unix seconds**: `1704384000`
2. **Unix milliseconds**: `1704384000000` (convert to seconds by dividing by 1000)
3. **ISO 8601**: `2024-01-04T16:00:00Z`
4. **ISO with offset**: `2024-01-04T16:00:00+00:00`
5. **ISO with milliseconds**: `2024-01-04T16:00:00.123Z` (strip milliseconds)

**Normalization Logic (from bash script):**
```bash
# If numeric and > 100000000000, it's milliseconds
if ((int > 100000000000)); then
  int=$((int / 1000))
fi

# For ISO strings, strip fractional seconds
cleaned=$(printf "%s" "$raw" | sed -E 's/([0-9])\.[0-9]+/\1/')

# Convert Z to +0000 for parsing
if [[ "$cleaned" == *Z ]]; then
  cleaned="${cleaned%Z}+0000"
fi

# Parse with date command (platform-specific)
```

## Implementation Details

### Type System Updates

**File: `src/index.ts`**

```typescript
// Add to existing types
export interface UsageWindow {
  type: '5h' | 'weekly' | 'session' | 'other';
  usagePercent: number;
  resetAt?: number;
  resetAtHuman?: string;
}

export interface LlmLimitStatus {
  provider: string;
  status: 'rate_limit_exceed' | 'available' | 'error';
  usagePercent?: number;  // Primary window for backward compatibility (5h)
  resetAt?: number;        // Primary window reset
  resetAtHuman?: string;
  windows?: UsageWindow[];  // All available windows
  errorMessage?: string;
  checkedAt: number;
}

// Update provider type
type ProviderName = 'claude' | 'gemini' | 'zai' | 'codex';
```

**File: `src/claude/types.ts`**

```typescript
export interface ClaudeCredentials {
  claudeAiOauth: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

export interface ClaudeUsageApiResponse {
  five_hour?: {
    utilization?: number;
    reset_at?: string;
    resets_at?: string;
    resetAt?: string;
    resetsAt?: string;
    window_end?: string;
    window_end_at?: string;
    windowEnd?: string;
    windowEndAt?: string;
  };
  seven_day?: {
    utilization?: number;
    reset_at?: string;
    resets_at?: string;
    resetAt?: string;
    resetsAt?: string;
    window_end?: string;
    window_end_at?: string;
    windowEnd?: string;
    windowEndAt?: string;
  };
  extra_usage?: {
    is_enabled?: boolean;
    utilization?: number;
    used_credits?: number;
    monthly_limit?: number;
  };
}

// Keep existing ClaudeStatusInfo for backward compatibility
export interface ClaudeStatusInfo {
  sessionUsed: number;
  sessionResetTime: string;
  weeklyUsed: number;
  weeklyResetTime: string;
  hasSubscription: boolean;
}
```

**File: `src/codex/types.ts` (new)**

```typescript
export interface CodexAuth {
  tokens: {
    access_token: string;
    account_id?: string;
  };
}

export interface CodexUsageApiResponse {
  rate_limit: {
    primary_window?: {
      used_percent?: number;
      reset_at?: string;
      resets_at?: string;
      resetAt?: string;
      resetsAt?: string;
      window_end?: string;
      window_end_at?: string;
      windowEnd?: string;
      windowEndAt?: string;
    };
    secondary_window?: {
      used_percent?: number;
      reset_at?: string;
      resets_at?: string;
      resetAt?: string;
      resetsAt?: string;
      window_end?: string;
      window_end_at?: string;
      windowEnd?: string;
      windowEndAt?: string;
    };
  };
}

export interface CodexStatusInfo {
  primaryWindowUsed: number;
  primaryWindowResetTime: string;
  secondaryWindowUsed: number;
  secondaryWindowResetTime: string;
}
```

### Claude Client Implementation

**File: `src/claude/client.ts`**

Key functions to implement:

```typescript
// 1. Extract token from credentials file
private async getTokenFromFile(): Promise<string | null> {
  const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    const content = await fs.readFile(credsPath, 'utf-8');
    const creds = JSON.parse(content) as ClaudeCredentials;
    return creds.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

// 2. Extract token from macOS keychain
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

// 3. Get token (try file first, then keychain)
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

// 4. Extract reset timestamp from window object
private extractResetTimestamp(window: any): string | null {
  const fields = [
    'reset_at', 'resets_at', 'resetAt', 'resetsAt',
    'window_end', 'window_end_at', 'windowEnd', 'windowEndAt'
  ];
  for (const field of fields) {
    if (window[field]) {
      return window[field];
    }
  }
  return null;
}

// 5. Normalize timestamp to epoch seconds
private normalizeTimestamp(timestamp: string): number {
  // If numeric
  if (/^\d+(\.\d+)?$/.test(timestamp)) {
    let num = parseFloat(timestamp);
    // Convert milliseconds to seconds
    if (num > 100000000000) {
      num = Math.floor(num / 1000);
    }
    return Math.floor(num);
  }
  
  // Parse ISO string
  // Strip fractional seconds
  let cleaned = timestamp.replace(/(\d)\.\d+/, '$1');
  // Replace Z with +00:00
  if (cleaned.endsWith('Z')) {
    cleaned = cleaned.slice(0, -1) + '+00:00';
  }
  
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) {
    return 0;
  }
  return Math.floor(date.getTime() / 1000);
}

// 6. Fetch usage from API
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
  
  // Parse 5h window
  const fiveHour = data.five_hour?.utilization || 0;
  const fiveHourReset = this.extractResetTimestamp(data.five_hour);
  const fiveHourResetEpoch = fiveHourReset ? this.normalizeTimestamp(fiveHourReset) : 0;
  
  // Parse weekly window
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
```

### Codex Client Implementation

**File: `src/codex/client.ts` (new)**

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { RunContext } from '../config/index.js';
import type { CodexAuth, CodexUsageApiResponse, CodexStatusInfo } from './types.js';

const execAsync = promisify(exec);

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
    } catch (error) {
      throw new Error('Not logged in. Run: codex login');
    }
  }

  private extractResetTimestamp(window: any): string | null {
    const fields = [
      'reset_at', 'resets_at', 'resetAt', 'resetsAt',
      'window_end', 'window_end_at', 'windowEnd', 'windowEndAt'
    ];
    for (const field of fields) {
      if (window[field]) {
        return window[field];
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

  async getUsageStats(): Promise<CodexStatusInfo> {
    const creds = await this.getCredentials();
    const token = creds.tokens?.access_token;
    const accountId = creds.tokens?.account_id;
    
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
```

### Update Main Index

**File: `src/index.ts`**

Add Codex integration:

```typescript
import { CodexClient } from './codex/client.js';
import type { CodexStatusInfo } from './codex/types.js';

type ProviderName = 'claude' | 'gemini' | 'zai' | 'codex';

async function getCodexStatus(context: RunContext): Promise<LlmLimitStatus> {
  const checkedAt = Date.now();
  
  try {
    const client = new CodexClient(context);
    const status = await client.getUsageStats();

    const isRateLimited = status.primaryWindowUsed >= 100;

    return {
      provider: 'codex',
      status: isRateLimited ? 'rate_limit_exceed' : 'available',
      usagePercent: status.primaryWindowUsed,
      resetAt: status.primaryWindowResetTime !== 'Unknown' 
        ? new Date(status.primaryWindowResetTime).getTime()
        : 0,
      resetAtHuman: status.primaryWindowResetTime,
      windows: [
        {
          type: '5h',
          usagePercent: status.primaryWindowUsed,
          resetAt: status.primaryWindowResetTime !== 'Unknown'
            ? new Date(status.primaryWindowResetTime).getTime()
            : undefined,
          resetAtHuman: status.primaryWindowResetTime !== 'Unknown'
            ? status.primaryWindowResetTime
            : undefined
        },
        {
          type: 'weekly',
          usagePercent: status.secondaryWindowUsed,
          resetAt: status.secondaryWindowResetTime !== 'Unknown'
            ? new Date(status.secondaryWindowResetTime).getTime()
            : undefined,
          resetAtHuman: status.secondaryWindowResetTime !== 'Unknown'
            ? status.secondaryWindowResetTime
            : undefined
        }
      ],
      checkedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    printWarning(`codex check failed: ${errorMessage}`);
    return {
      provider: 'codex',
      status: 'error',
      resetAt: 0,
      resetAtHuman: 'Error',
      errorMessage,
      checkedAt,
    };
  }
}

// Update checkLimits to include codex
export async function checkLimits(tools?: ProviderName[]): Promise<LlmLimitStatus[]> {
  const context = getRunContext();
  const providersToCheck = tools && tools.length > 0 
    ? tools 
    : ['claude', 'gemini', 'zai', 'codex'];

  const promises: Promise<LlmLimitStatus>[] = [];

  for (const provider of providersToCheck) {
    switch (provider) {
      case 'claude':
        promises.push(getClaudeStatus(context));
        break;
      case 'gemini':
        promises.push(getGeminiStatus(context));
        break;
      case 'zai':
        promises.push(getZaiStatus(context));
        break;
      case 'codex':
        promises.push(getCodexStatus(context));
        break;
    }
  }

  const results = await Promise.all(promises);
  return results;
}

// Update exports
export type { CodexStatusInfo } from './codex/types.js';
export { CodexClient };
```

### Update Claude Status to Include Windows

Update `getClaudeStatus` in `src/index.ts`:

```typescript
async function getClaudeStatus(context: RunContext): Promise<LlmLimitStatus> {
  const checkedAt = Date.now();
  
  if (!isCommandAvailable('claude')) {
    return {
      provider: 'claude',
      status: 'error',
      resetAt: 0,
      resetAtHuman: 'Error',
      errorMessage: 'CLI is not available on this system',
      checkedAt,
    };
  }

  try {
    const client = new ClaudeClient(context);
    const status = await client.getUsageStats();

    const isRateLimited = status.sessionUsed >= 100;

    // Parse reset times to timestamps
    let sessionResetTime = 0;
    if (status.sessionResetTime !== 'Unknown') {
      sessionResetTime = new Date(status.sessionResetTime).getTime();
    }
    
    let weeklyResetTime = 0;
    if (status.weeklyResetTime !== 'Unknown') {
      weeklyResetTime = new Date(status.weeklyResetTime).getTime();
    }

    return {
      provider: 'claude',
      status: isRateLimited ? 'rate_limit_exceed' : 'available',
      usagePercent: status.sessionUsed,
      resetAt: sessionResetTime,
      resetAtHuman: status.sessionResetTime,
      windows: [
        {
          type: '5h',
          usagePercent: status.sessionUsed,
          resetAt: sessionResetTime || undefined,
          resetAtHuman: sessionResetTime > 0 ? status.sessionResetTime : undefined
        },
        {
          type: 'weekly',
          usagePercent: status.weeklyUsed,
          resetAt: weeklyResetTime || undefined,
          resetAtHuman: weeklyResetTime > 0 ? status.weeklyResetTime : undefined
        }
      ],
      checkedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    printWarning(`claude check failed: ${errorMessage}`);
    return {
      provider: 'claude',
      status: 'error',
      resetAt: 0,
      resetAtHuman: 'Error',
      errorMessage,
      checkedAt,
    };
  }
}
```

### Update CLI

**File: `src/cli.ts`**

Update valid tools list:

```typescript
const validTools: ProviderName[] = ['claude', 'gemini', 'zai', 'codex'];
```

Update help text:

```typescript
console.error('\nValid tools: claude, gemini, zai, codex');
console.error('\nExamples:');
console.error('  ai-limit-checker --tools=codex');
console.error('  ai-limit-checker --tools=claude,codex');
console.error('  ai-limit-checker --tools=claude,gemini,zai,codex');
```

### Update Config

**File: `src/config/index.ts`**

Add Codex timeout:

```typescript
const DEFAULT_TIMEOUTS = {
  claude: 60000,
  gemini: 60000,
  zai: 60000,
  codex: 30000,  // New
};

export interface AiLimitCheckerConfig {
  runtimeRoot: string;
  inheritEnvAllowlist: string[];
  zai: {
    userDataDir: string;
    outputDir: string;
  };
  timeoutsMs: {
    claude: number;
    gemini: number;
    zai: number;
    codex: number;  // New
  };
}

export interface RunContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeouts: {
    claude: number;
    gemini: number;
    zai: number;
    codex: number;  // New
  };
  zai: {
    userDataDir: string;
    outputDir: string;
  };
}
```

## Test Plan (Red-Green-Refactor)

### Test Framework Setup

**Install Vitest:**
```bash
npm install --save-dev vitest @vitest/expect
```

**Add to `package.json`:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage"
  }
}
```

**Create `vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

### Test Utilities

**Create `src/test-utils/mocks.ts`:**
```typescript
import { vi } from 'vitest';

export function mockFetch(response: any, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
  });
}

export function mockFileContent(content: string) {
  const fs = await import('fs/promises');
  vi.spyOn(fs, 'readFile').mockResolvedValue(content);
}

export function mockExec(stdout: string, stderr = '') {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  vi.spyOn(childProcess, 'exec').mockImplementation((cmd, options, callback) => {
    if (typeof callback === 'function') {
      callback(null, { stdout, stderr });
    }
    return {} as any;
  });
}
```

### Claude Client Tests

**File: `src/claude/client.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeClient } from './client.js';
import { getRunContext } from '../config/index.js';
import * as fs from 'fs/promises';
import * as childProcess from 'child_process';

describe('ClaudeClient', () => {
  let client: ClaudeClient;
  
  beforeEach(() => {
    client = new ClaudeClient(getRunContext());
    vi.clearAllMocks();
  });

  describe('getTokenFromFile', () => {
    it('should extract token from credentials file', async () => {
      const mockCreds = {
        claudeAiOauth: {
          accessToken: 'test-token-123'
        }
      };
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockCreds));
      
      const token = await (client as any).getTokenFromFile();
      expect(token).toBe('test-token-123');
    });

    it('should return null when file does not exist', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
      
      const token = await (client as any).getTokenFromFile();
      expect(token).toBeNull();
    });

    it('should return null when accessToken is missing', async () => {
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify({}));
      
      const token = await (client as any).getTokenFromFile();
      expect(token).toBeNull();
    });
  });

  describe('getTokenFromKeychain', () => {
    it('should extract token from macOS keychain', async () => {
      if (process.platform !== 'darwin') {
        return; // Skip on non-macOS
      }
      
      const mockCreds = {
        claudeAiOauth: {
          accessToken: 'keychain-token-456'
        }
      };
      
      vi.spyOn(childProcess, 'exec').mockImplementation((cmd, options, callback) => {
        callback(null, { stdout: JSON.stringify(mockCreds), stderr: '' });
        return {} as any;
      });
      
      const token = await (client as any).getTokenFromKeychain();
      expect(token).toBe('keychain-token-456');
    });

    it('should return null when keychain lookup fails', async () => {
      if (process.platform !== 'darwin') {
        return;
      }
      
      vi.spyOn(childProcess, 'exec').mockImplementation((cmd, options, callback) => {
        callback(new Error('Keychain error'), { stdout: '', stderr: '' });
        return {} as any;
      });
      
      const token = await (client as any).getTokenFromKeychain();
      expect(token).toBeNull();
    });

    it('should return null on non-macOS platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      const token = await (client as any).getTokenFromKeychain();
      expect(token).toBeNull();
    });
  });

  describe('extractResetTimestamp', () => {
    it('should extract reset_at field', () => {
      const window = { reset_at: '2024-01-04T16:00:00Z' };
      const result = (client as any).extractResetTimestamp(window);
      expect(result).toBe('2024-01-04T16:00:00Z');
    });

    it('should try multiple field names', () => {
      const window = { windowEnd: '2024-01-04T16:00:00Z' };
      const result = (client as any).extractResetTimestamp(window);
      expect(result).toBe('2024-01-04T16:00:00Z');
    });

    it('should return null when no reset field found', () => {
      const window = { utilization: 50 };
      const result = (client as any).extractResetTimestamp(window);
      expect(result).toBeNull();
    });
  });

  describe('normalizeTimestamp', () => {
    it('should convert milliseconds to seconds', () => {
      const result = (client as any).normalizeTimestamp('1704384000000');
      expect(result).toBe(1704384000);
    });

    it('should keep seconds as is', () => {
      const result = (client as any).normalizeTimestamp('1704384000');
      expect(result).toBe(1704384000);
    });

    it('should parse ISO string with Z', () => {
      const result = (client as any).normalizeTimestamp('2024-01-04T16:00:00Z');
      expect(result).toBe(1704384000);
    });

    it('should strip fractional seconds', () => {
      const result = (client as any).normalizeTimestamp('2024-01-04T16:00:00.123Z');
      expect(result).toBe(1704384000);
    });

    it('should return 0 for invalid timestamp', () => {
      const result = (client as any).normalizeTimestamp('invalid');
      expect(result).toBe(0);
    });
  });

  describe('getUsageStats', () => {
    it('should fetch and parse usage data', async () => {
      const mockCreds = {
        claudeAiOauth: { accessToken: 'test-token' }
      };
      
      const mockResponse = {
        five_hour: {
          utilization: 45.5,
          reset_at: '2024-01-04T16:00:00Z'
        },
        seven_day: {
          utilization: 23.2,
          reset_at: '2024-01-07T00:00:00Z'
        }
      };
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockCreds));
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });
      
      const status = await client.getUsageStats();
      
      expect(status.sessionUsed).toBe(45);
      expect(status.weeklyUsed).toBe(23);
      expect(status.sessionResetTime).toBe('2024-01-04T16:00:00.000Z');
      expect(status.weeklyResetTime).toBe('2024-01-07T00:00:00.000Z');
    });

    it('should throw error when not logged in', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
      vi.spyOn(childProcess, 'exec').mockImplementation((cmd, options, callback) => {
        callback(new Error('Not found'), { stdout: '', stderr: '' });
        return {} as any;
      });
      
      await expect(client.getUsageStats()).rejects.toThrow('Not logged in');
    });

    it('should throw error on 401 response', async () => {
      const mockCreds = {
        claudeAiOauth: { accessToken: 'expired-token' }
      };
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockCreds));
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401
      });
      
      await expect(client.getUsageStats()).rejects.toThrow('Session expired');
    });

    it('should handle missing utilization fields', async () => {
      const mockCreds = {
        claudeAiOauth: { accessToken: 'test-token' }
      };
      
      const mockResponse = {};
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockCreds));
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });
      
      const status = await client.getUsageStats();
      
      expect(status.sessionUsed).toBe(0);
      expect(status.weeklyUsed).toBe(0);
      expect(status.sessionResetTime).toBe('Unknown');
      expect(status.weeklyResetTime).toBe('Unknown');
    });
  });
});
```

### Codex Client Tests

**File: `src/codex/client.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodexClient } from './client.js';
import { getRunContext } from '../config/index.js';
import * as fs from 'fs/promises';

describe('CodexClient', () => {
  let client: CodexClient;
  
  beforeEach(() => {
    client = new CodexClient(getRunContext());
    vi.clearAllMocks();
  });

  describe('getCredentials', () => {
    it('should extract credentials from auth.json', async () => {
      const mockAuth = {
        tokens: {
          access_token: 'test-codex-token',
          account_id: 'user-123'
        }
      };
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockAuth));
      
      const creds = await (client as any).getCredentials();
      expect(creds.tokens.access_token).toBe('test-codex-token');
      expect(creds.tokens.account_id).toBe('user-123');
    });

    it('should throw error when auth.json missing', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
      
      await expect((client as any).getCredentials()).rejects.toThrow('Not logged in');
    });

    it('should use CODEX_HOME environment variable', async () => {
      process.env.CODEX_HOME = '/custom/codex';
      
      const mockAuth = {
        tokens: { access_token: 'token' }
      };
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockAuth));
      
      await (client as any).getCredentials();
      
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('/custom/codex'),
        'utf-8'
      );
      
      delete process.env.CODEX_HOME;
    });
  });

  describe('getUsageStats', () => {
    it('should fetch and parse usage data', async () => {
      const mockAuth = {
        tokens: {
          access_token: 'test-token',
          account_id: 'user-123'
        }
      };
      
      const mockResponse = {
        rate_limit: {
          primary_window: {
            used_percent: 42.5,
            reset_at: '2024-01-04T15:30:00Z'
          },
          secondary_window: {
            used_percent: 18.3,
            reset_at: '2024-01-07T00:00:00Z'
          }
        }
      };
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockAuth));
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });
      
      const status = await client.getUsageStats();
      
      expect(status.primaryWindowUsed).toBe(42);
      expect(status.secondaryWindowUsed).toBe(18);
      expect(status.primaryWindowResetTime).toBe('2024-01-04T15:30:00.000Z');
      expect(status.secondaryWindowResetTime).toBe('2024-01-07T00:00:00.000Z');
    });

    it('should include ChatGPT-Account-Id header when available', async () => {
      const mockAuth = {
        tokens: {
          access_token: 'test-token',
          account_id: 'user-123'
        }
      };
      
      const mockResponse = {
        rate_limit: {
          primary_window: { used_percent: 0 },
          secondary_window: { used_percent: 0 }
        }
      };
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockAuth));
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });
      
      await client.getUsageStats();
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://chatgpt.com/backend-api/wham/usage',
        expect.objectContaining({
          headers: expect.objectContaining({
            'ChatGPT-Account-Id': 'user-123'
          })
        })
      );
    });

    it('should throw error when not logged in', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
      
      await expect(client.getUsageStats()).rejects.toThrow('Not logged in');
    });

    it('should throw error on 401 response', async () => {
      const mockAuth = {
        tokens: { access_token: 'expired-token' }
      };
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockAuth));
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401
      });
      
      await expect(client.getUsageStats()).rejects.toThrow('Session expired');
    });

    it('should handle missing rate_limit fields', async () => {
      const mockAuth = {
        tokens: { access_token: 'test-token' }
      };
      
      const mockResponse = {};
      
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockAuth));
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });
      
      const status = await client.getUsageStats();
      
      expect(status.primaryWindowUsed).toBe(0);
      expect(status.secondaryWindowUsed).toBe(0);
      expect(status.primaryWindowResetTime).toBe('Unknown');
      expect(status.secondaryWindowResetTime).toBe('Unknown');
    });
  });
});
```

### Integration Tests

**File: `src/index.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkLimits } from './index.js';

describe('checkLimits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check codex provider', async () => {
    const mockAuth = {
      tokens: { access_token: 'test-token' }
    };
    
    const mockResponse = {
      rate_limit: {
        primary_window: { used_percent: 50 },
        secondary_window: { used_percent: 25 }
      }
    };
    
    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockAuth));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    
    const results = await checkLimits(['codex']);
    
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('codex');
    expect(results[0].usagePercent).toBe(50);
    expect(results[0].windows).toHaveLength(2);
    expect(results[0].windows![0].type).toBe('5h');
    expect(results[0].windows![0].usagePercent).toBe(50);
    expect(results[0].windows![1].type).toBe('weekly');
    expect(results[0].windows![1].usagePercent).toBe(25);
  });

  it('should return error status for failed checks', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
    
    const results = await checkLimits(['codex']);
    
    expect(results[0].status).toBe('error');
    expect(results[0].errorMessage).toContain('Not logged in');
  });

  it('should include both windows for claude', async () => {
    const mockCreds = {
      claudeAiOauth: { accessToken: 'test-token' }
    };
    
    const mockResponse = {
      five_hour: { utilization: 60 },
      seven_day: { utilization: 30 }
    };
    
    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockCreds));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    vi.spyOn(which, 'sync').mockReturnValue('/usr/bin/claude');
    
    const results = await checkLimits(['claude']);
    
    expect(results[0].windows).toHaveLength(2);
    expect(results[0].windows![0].type).toBe('5h');
    expect(results[0].windows![0].usagePercent).toBe(60);
    expect(results[0].windows![1].type).toBe('weekly');
    expect(results[0].windows![1].usagePercent).toBe(30);
  });

  it('should check all providers by default', async () => {
    // Mock all providers
    // ... (setup mocks for claude, gemini, zai, codex)
    
    const results = await checkLimits();
    
    expect(results).toHaveLength(4);
    expect(results.map(r => r.provider)).toContain('claude');
    expect(results.map(r => r.provider)).toContain('gemini');
    expect(results.map(r => r.provider)).toContain('zai');
    expect(results.map(r => r.provider)).toContain('codex');
  });
});
```

## Implementation Order

### Day 1: Setup and Type System

1. **Install test framework**
   ```bash
   npm install --save-dev vitest @vitest/expect
   ```

2. **Create vitest.config.ts**

3. **Update package.json scripts**

4. **Create test utilities** (`src/test-utils/mocks.ts`)

5. **Update type definitions**
   - Add `UsageWindow` interface to `src/index.ts`
   - Update `LlmLimitStatus` to include `windows`
   - Update `ProviderName` to include `'codex'`

6. **Create Claude types**
   - Create `ClaudeCredentials` interface
   - Create `ClaudeUsageApiResponse` interface

7. **Create Codex types**
   - Create `src/codex/types.ts`
   - Define `CodexAuth`, `CodexUsageApiResponse`, `CodexStatusInfo`

8. **Write type tests** (verify TypeScript compilation)

### Day 2: Claude Client Refactor (TDD)

1. **Write tests for token extraction**
   - Test `getTokenFromFile()` (RED)
   - Implement `getTokenFromFile()` (GREEN)
   - Refactor if needed (REFACTOR)
   - Test `getTokenFromKeychain()` (RED)
   - Implement `getTokenFromKeychain()` (GREEN)
   - Refactor if needed (REFACTOR)

2. **Write tests for timestamp handling**
   - Test `extractResetTimestamp()` (RED)
   - Implement `extractResetTimestamp()` (GREEN)
   - Test `normalizeTimestamp()` (RED)
   - Implement `normalizeTimestamp()` (GREEN)

3. **Write tests for API client**
   - Test successful API call (RED)
   - Implement API fetch logic (GREEN)
   - Test 401/403 errors (RED)
   - Implement error handling (GREEN)
   - Test network errors (RED)
   - Implement network error handling (GREEN)

4. **Write tests for response parsing**
   - Test full response parsing (RED)
   - Implement parsing logic (GREEN)
   - Test missing fields (RED)
   - Implement defaults (GREEN)

5. **Update Claude status reporting**
   - Modify `getClaudeStatus()` in `src/index.ts`
   - Add windows array to response

### Day 3: Codex Implementation (TDD)

1. **Write tests for credential extraction**
   - Test `getCredentials()` success (RED)
   - Implement credential loading (GREEN)
   - Test missing auth file (RED)
   - Implement error handling (GREEN)
   - Test CODEX_HOME env var (RED)
   - Implement env var support (GREEN)

2. **Write tests for API client**
   - Test successful API call (RED)
   - Implement fetch logic (GREEN)
   - Test with account ID header (RED)
   - Implement header logic (GREEN)
   - Test error responses (RED)
   - Implement error handling (GREEN)

3. **Write tests for response parsing**
   - Test full response parsing (RED)
   - Implement parsing (GREEN)
   - Test missing fields (RED)
   - Implement defaults (GREEN)

4. **Create Codex client file**
   - Create `src/codex/client.ts`
   - Implement all methods following TDD

5. **Integrate into main system**
   - Add `getCodexStatus()` to `src/index.ts`
   - Add 'codex' to switch in `checkLimits()`
   - Export CodexClient and types

### Day 4: Integration and CLI

1. **Update CLI**
   - Add 'codex' to valid tools list
   - Update help text
   - Update examples

2. **Update config**
   - Add codex timeout to defaults
   - Add codex timeout to interfaces

3. **Write integration tests**
   - Test `checkLimits(['codex'])`
   - Test `checkLimits(['claude', 'codex'])`
   - Test `checkLimits()` (all providers)
   - Test error scenarios

4. **Manual testing**
   - Test with real Claude credentials
   - Test with real Codex credentials
   - Test with missing credentials
   - Test with expired tokens

5. **Update output format**
   - Verify JSON output includes windows
   - Verify backward compatibility
   - Test with various usage scenarios

### Day 5: Documentation and Cleanup

1. **Update README.md**
   - Add Codex to provider list
   - Add Codex prerequisites
   - Update output format examples
   - Add Codex usage examples
   - Update API reference

2. **Update type documentation**
   - Document `UsageWindow` interface
   - Document changes to `LlmLimitStatus`
   - Document Codex types

3. **Final testing**
   - Run all tests: `npm test`
   - Build project: `npm run build`
   - Test CLI: `./dist/cli.js --tools=codex`
   - Test all providers: `./dist/cli.js --tools=claude,gemini,zai,codex`

4. **Code cleanup**
   - Remove PTY code from Claude client
   - Remove unused imports
   - Add inline documentation
   - Ensure consistent code style

5. **Create migration guide**
   - Document breaking changes (if any)
   - Document new features
   - Provide upgrade steps

## Success Criteria

1. ✅ Codex provider fully functional with API tests passing
2. ✅ Claude uses OAuth API instead of PTY
3. ✅ Both 5h and weekly windows reported for Claude and Codex
4. ✅ Reset timestamps accurate and normalized
5. ✅ All tests passing (`npm test` exits with 0)
6. ✅ TypeScript compiles without errors (`npm run build`)
7. ✅ Documentation updated in README.md
8. ✅ Backward compatibility maintained (existing API still works)
9. ✅ No regression in existing providers (Gemini, ZAI)
10. ✅ Error handling robust (network errors, auth failures, missing data)

## Breaking Changes

**None** - The changes are backward compatible:
- Existing `usagePercent` field still present (maps to 5h window)
- Existing `resetAt` field still present (maps to 5h reset)
- New `windows` array is optional
- Codex is a new provider, doesn't affect existing ones

## Migration Notes

### For Users

No migration needed. To use new features:

1. **Use Codex:**
   ```bash
   ai-limit-checker --tools=codex
   ```

2. **Check detailed windows:**
   ```javascript
   const results = await checkLimits(['claude', 'codex']);
   results.forEach(r => {
     if (r.windows) {
       r.windows.forEach(w => {
         console.log(`${r.provider} ${w.type}: ${w.usagePercent}%`);
       });
     }
   });
   ```

### For Developers

The `LlmLimitStatus` interface has a new optional field:

```typescript
interface LlmLimitStatus {
  // ... existing fields
  windows?: UsageWindow[];  // New optional field
}
```

Existing code will continue to work without changes.

## File Structure After Implementation

```
src/
├── claude/
│   ├── client.ts           # Refactored - uses OAuth API
│   ├── client.test.ts      # New - comprehensive tests
│   └── types.ts            # Updated - added API types
├── codex/
│   ├── client.ts           # New - Codex API client
│   ├── client.test.ts      # New - comprehensive tests
│   └── types.ts            # New - Codex types
├── gemini/
│   ├── client.ts           # Unchanged
│   └── types.ts            # Unchanged
├── zai/
│   ├── client.ts           # Unchanged
│   └── types.ts            # Unchanged
├── config/
│   └── index.ts            # Updated - added codex timeout
├── test-utils/
│   └── mocks.ts            # New - test utilities
├── index.ts                # Updated - added codex, windows
├── index.test.ts           # New - integration tests
└── cli.ts                  # Updated - added codex support
```

## References

- **Cloned tool reference**: `resources/clone-of-frittlechasm-aiusage/aiusage`
- **Claude OAuth API**: `https://api.anthropic.com/api/oauth/usage`
- **Codex Usage API**: `https://chatgpt.com/backend-api/wham/usage`
- **Claude credentials**: `~/.claude/.credentials.json` (or macOS keychain)
- **Codex auth**: `~/.codex/auth.json` (or `$CODEX_HOME/auth.json`)
- **Vitest docs**: https://vitest.dev/

## Next Steps for Implementation Agent

1. **Start with Day 1**: Set up test framework and update types
2. **Follow TDD strictly**: Write failing test first, then implement
3. **Commit frequently**: After each green phase
4. **Run tests often**: `npm test` should always pass
5. **Build regularly**: `npm run build` should always succeed
6. **Refer to this plan**: All technical details are self-contained here

**Important**: This plan is self-contained. The implementation agent should NOT need to:
- Read the cloned tool in `resources/`
- Understand conversation context
- Make assumptions about API formats
- Guess at field names or structures

Everything needed is documented above.
