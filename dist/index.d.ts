import { ZaiClient } from './zai/client.js';
import { GeminiClient } from './gemini/client.js';
import { ClaudeClient } from './claude/client.js';
import { CodexClient } from './codex/client.js';
import type { GeminiModelUsage } from './gemini/types.js';
import type { ClaudeStatusInfo } from './claude/types.js';
import type { CodexStatusInfo } from './codex/types.js';
import type { RunContext } from './config/index.js';
type ProviderName = 'claude' | 'gemini' | 'zai' | 'codex';
export interface UsageWindow {
    type: '5h' | 'weekly' | 'session' | 'other';
    usagePercent: number;
    resetAt?: number;
    resetAtHuman?: string;
}
export interface LlmLimitStatus {
    provider: string;
    status: 'rate_limit_exceed' | 'available' | 'error';
    usagePercent?: number;
    resetAt?: number;
    resetAtHuman?: string;
    windows?: UsageWindow[];
    errorMessage?: string;
    checkedAt: number;
    debounce?: {
        waitMs: number;
        source: 'live' | 'cache';
        expiresAt?: number;
    };
}
export declare function checkLimits(tools?: ProviderName[]): Promise<LlmLimitStatus[]>;
export type { GeminiModelUsage, ClaudeStatusInfo, CodexStatusInfo, RunContext };
export { ZaiClient, GeminiClient, ClaudeClient, CodexClient };
//# sourceMappingURL=index.d.ts.map