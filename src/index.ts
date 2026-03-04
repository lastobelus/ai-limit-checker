import which from 'which';
import { getRunContext } from './config/index.js';
import { ZaiClient } from './zai/client.js';
import { GeminiClient } from './gemini/client.js';
import { ClaudeClient } from './claude/client.js';
import type { GeminiModelUsage } from './gemini/types.js';
import type { ClaudeStatusInfo } from './claude/types.js';
import type { RunContext } from './config/index.js';

type ProviderName = 'claude' | 'gemini' | 'zai';

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

export interface LlmLimitStatus {
  provider: string;
  status: 'rate_limit_exceed' | 'available' | 'error';
  usagePercent?: number;
  resetAt?: number;
  resetAtHuman?: string;
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

    let resetTime = 0;
    if (status.sessionResetTime !== 'Unknown') {
      const now = new Date();
      const resetStr = status.sessionResetTime;

      const timeMatch = resetStr.match(/(\d+)(am|pm)/i);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        if (timeMatch[2].toLowerCase() === 'pm' && hour !== 12) {
          hour += 12;
        } else if (timeMatch[2].toLowerCase() === 'am' && hour === 12) {
          hour = 0;
        }
        const resetDate = new Date(now);
        resetDate.setHours(hour, 0, 0, 0);
        if (resetDate < now) {
          resetDate.setDate(resetDate.getDate() + 1);
        }
        resetTime = resetDate.getTime();
      }
    }

    return {
      provider: 'claude',
      status: isRateLimited ? 'rate_limit_exceed' : 'available',
      usagePercent: status.sessionUsed,
      resetAt: resetTime,
      resetAtHuman: resetTime > 0 ? new Date(resetTime).toISOString() : status.sessionResetTime,
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

export async function checkLimits(tools?: ProviderName[]): Promise<LlmLimitStatus[]> {
  const context = getRunContext();
  const providersToCheck = tools && tools.length > 0 ? tools : ['claude', 'gemini', 'zai'];

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
    }
  }

  const results = await Promise.all(promises);
  return results;
}

export type { GeminiModelUsage, ClaudeStatusInfo, RunContext };
export { ZaiClient, GeminiClient, ClaudeClient };
