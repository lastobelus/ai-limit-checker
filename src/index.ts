import which from 'which';
import { getRunContext } from './config/index.js';
import { ZaiClient } from './zai/client.js';
import { GeminiClient } from './gemini/client.js';
import { ClaudeClient } from './claude/client.js';
import { CodexClient } from './codex/client.js';
import type { GeminiModelUsage } from './gemini/types.js';
import type { ClaudeStatusInfo } from './claude/types.js';
import type { CodexStatusInfo } from './codex/types.js';
import type { RunContext } from './config/index.js';

type ProviderName = 'claude' | 'gemini' | 'zai' | 'codex';

function printWarning(message: string): void {
  console.error(`Warning: ${message}`);
}

function isCommandAvailable(command: string): boolean {
  try {
    which.sync(command);
    return true;
  } catch {
    return false;
  }
}

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
}

interface ZaiLimit {
  type: string;
  nextResetTime?: number;
  percentage: number;
}

function parseZaiResetTime(timestamp?: number): { resetAt: number; human: string } {
  if (!timestamp) {
    const now = Date.now();
    return { resetAt: now, human: 'Unknown' };
  }
  return {
    resetAt: timestamp,
    human: new Date(timestamp).toISOString(),
  };
}

function parseGeminiResetTime(resetStr: string): number {
  const now = Date.now();
  let ms = 0;

  const dayMatch = resetStr.match(/(\d+)d/);
  if (dayMatch) {
    ms += parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;
  }

  const hourMatch = resetStr.match(/(\d+)h/);
  if (hourMatch) {
    ms += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
  }

  const minMatch = resetStr.match(/(\d+)m/);
  if (minMatch) {
    ms += parseInt(minMatch[1], 10) * 60 * 1000;
  }

  return now + ms;
}

async function getZaiStatus(context: RunContext): Promise<LlmLimitStatus> {
  const checkedAt = Date.now();
  
  try {
    const client = new ZaiClient(context);
    const limits = await client.getUsageQuota();

    const tokensLimit = limits.find((limit) => limit.type === 'TOKENS_LIMIT');
    if (tokensLimit) {
      const isRateLimited = tokensLimit.percentage >= 100;
      const { resetAt, human } = parseZaiResetTime(tokensLimit.nextResetTime);
      return {
        provider: 'zai',
        status: isRateLimited ? 'rate_limit_exceed' : 'available',
        usagePercent: tokensLimit.percentage,
        resetAt,
        resetAtHuman: human,
        checkedAt,
      };
    }

    return {
      provider: 'zai',
      status: 'available',
      usagePercent: 0,
      resetAt: 0,
      resetAtHuman: 'Unknown',
      checkedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    printWarning(`zai check failed: ${errorMessage}`);
    return {
      provider: 'zai',
      status: 'error',
      resetAt: 0,
      resetAtHuman: 'Error',
      errorMessage,
      checkedAt,
    };
  }
}

async function getGeminiStatus(context: RunContext): Promise<LlmLimitStatus> {
  const checkedAt = Date.now();
  
  if (!isCommandAvailable('gemini')) {
    return {
      provider: 'gemini',
      status: 'error',
      resetAt: 0,
      resetAtHuman: 'Error',
      errorMessage: 'CLI is not available on this system',
      checkedAt,
    };
  }

  try {
    const client = new GeminiClient(context);
    const usage = await client.getUsageStats();

    const hasRateLimit = usage.some((u) => parseFloat(u.usage) >= 99);
    const maxUsage = Math.max(...usage.map((u) => parseFloat(u.usage)));

    let earliestReset = Infinity;
    for (const model of usage) {
      const resetTime = parseGeminiResetTime(model.resets);
      if (resetTime < earliestReset) {
        earliestReset = resetTime;
      }
    }

    return {
      provider: 'gemini',
      status: hasRateLimit ? 'rate_limit_exceed' : 'available',
      usagePercent: maxUsage,
      resetAt: earliestReset === Infinity ? 0 : earliestReset,
      resetAtHuman: earliestReset === Infinity ? 'Unknown' : new Date(earliestReset).toISOString(),
      checkedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    printWarning(`gemini check failed: ${errorMessage}`);
    return {
      provider: 'gemini',
      status: 'error',
      resetAt: 0,
      resetAtHuman: 'Error',
      errorMessage,
      checkedAt,
    };
  }
}

async function getClaudeStatus(context: RunContext): Promise<LlmLimitStatus> {
  const checkedAt = Date.now();

  try {
    const client = new ClaudeClient(context);
    const status = await client.getUsageStats();

    const isRateLimited = status.sessionUsed >= 100;

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

async function getCodexStatus(context: RunContext): Promise<LlmLimitStatus> {
  const checkedAt = Date.now();
  
  try {
    const client = new CodexClient(context);
    const status = await client.getUsageStats();

    const isRateLimited = status.primaryWindowUsed >= 100;

    let primaryResetTime = 0;
    if (status.primaryWindowResetTime !== 'Unknown') {
      primaryResetTime = new Date(status.primaryWindowResetTime).getTime();
    }
    
    let secondaryResetTime = 0;
    if (status.secondaryWindowResetTime !== 'Unknown') {
      secondaryResetTime = new Date(status.secondaryWindowResetTime).getTime();
    }

    return {
      provider: 'codex',
      status: isRateLimited ? 'rate_limit_exceed' : 'available',
      usagePercent: status.primaryWindowUsed,
      resetAt: primaryResetTime,
      resetAtHuman: status.primaryWindowResetTime,
      windows: [
        {
          type: '5h',
          usagePercent: status.primaryWindowUsed,
          resetAt: primaryResetTime || undefined,
          resetAtHuman: primaryResetTime > 0 ? status.primaryWindowResetTime : undefined
        },
        {
          type: 'weekly',
          usagePercent: status.secondaryWindowUsed,
          resetAt: secondaryResetTime || undefined,
          resetAtHuman: secondaryResetTime > 0 ? status.secondaryWindowResetTime : undefined
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

export type { GeminiModelUsage, ClaudeStatusInfo, CodexStatusInfo, RunContext };
export { ZaiClient, GeminiClient, ClaudeClient, CodexClient };
