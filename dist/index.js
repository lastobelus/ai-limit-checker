import which from 'which';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getRunContext } from './config/index.js';
import { ZaiClient } from './zai/client.js';
import { GeminiClient } from './gemini/client.js';
import { ClaudeClient } from './claude/client.js';
import { CodexClient } from './codex/client.js';
function printWarning(message) {
    console.error(`Warning: ${message}`);
}
function isCommandAvailable(command) {
    try {
        which.sync(command);
        return true;
    }
    catch {
        return false;
    }
}
function getClaudeCachePath(context) {
    return resolve(context.runtimeRoot, 'cache', 'claude-status.json');
}
function withClaudeDebounce(status, debounceMs, source) {
    return {
        ...status,
        debounce: {
            waitMs: debounceMs,
            source,
            expiresAt: debounceMs > 0 ? status.checkedAt + debounceMs : undefined,
        },
    };
}
function isClaudeCacheRecord(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    return candidate.status?.provider === 'claude'
        && typeof candidate.status.checkedAt === 'number'
        && typeof candidate.status.status === 'string';
}
async function readClaudeStatusCache(context, now) {
    const debounceMs = context.debounceMs.claude;
    if (debounceMs <= 0) {
        return null;
    }
    try {
        const content = await readFile(getClaudeCachePath(context), 'utf-8');
        const parsed = JSON.parse(content);
        if (!isClaudeCacheRecord(parsed)) {
            return null;
        }
        const { status } = parsed;
        if (status.status === 'error') {
            return null;
        }
        if (now - status.checkedAt >= debounceMs) {
            return null;
        }
        return withClaudeDebounce(status, debounceMs, 'cache');
    }
    catch {
        return null;
    }
}
async function writeClaudeStatusCache(context, status) {
    const debounceMs = context.debounceMs.claude;
    if (debounceMs <= 0 || status.status === 'error') {
        return;
    }
    try {
        const cachePath = getClaudeCachePath(context);
        await mkdir(dirname(cachePath), { recursive: true });
        await writeFile(cachePath, JSON.stringify({ status }, null, 2), 'utf-8');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        printWarning(`claude cache write failed: ${errorMessage}`);
    }
}
function parseZaiResetTime(timestamp) {
    if (!timestamp) {
        const now = Date.now();
        return { resetAt: now, human: 'Unknown' };
    }
    return {
        resetAt: timestamp,
        human: new Date(timestamp).toISOString(),
    };
}
function parseGeminiResetTime(resetStr) {
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
async function getZaiStatus(context) {
    const checkedAt = Date.now();
    try {
        const client = new ZaiClient(context);
        const limits = await client.getUsageQuota();
        const tokenLimits = limits.filter((limit) => limit.type === 'TOKENS_LIMIT');
        const fiveHourLimit = tokenLimits.find((limit) => limit.unit === 3) ?? tokenLimits[0];
        const weeklyLimit = tokenLimits.find((limit) => limit.unit === 6);
        if (fiveHourLimit) {
            const isRateLimited = fiveHourLimit.percentage >= 100;
            const { resetAt, human } = parseZaiResetTime(fiveHourLimit.nextResetTime);
            const windows = [];
            windows.push({
                type: '5h',
                usagePercent: fiveHourLimit.percentage,
                resetAt,
                resetAtHuman: human,
            });
            if (weeklyLimit) {
                const weeklyReset = parseZaiResetTime(weeklyLimit.nextResetTime);
                windows.push({
                    type: 'weekly',
                    usagePercent: weeklyLimit.percentage,
                    resetAt: weeklyReset.resetAt,
                    resetAtHuman: weeklyReset.human,
                });
            }
            return {
                provider: 'zai',
                status: isRateLimited ? 'rate_limit_exceed' : 'available',
                usagePercent: fiveHourLimit.percentage,
                resetAt,
                resetAtHuman: human,
                windows,
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
    }
    catch (error) {
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
async function getGeminiStatus(context) {
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
    }
    catch (error) {
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
async function getClaudeStatus(context) {
    const checkedAt = Date.now();
    const cached = await readClaudeStatusCache(context, checkedAt);
    if (cached) {
        return cached;
    }
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
        const result = withClaudeDebounce({
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
        }, context.debounceMs.claude, 'live');
        await writeClaudeStatusCache(context, result);
        return result;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        printWarning(`claude check failed: ${errorMessage}`);
        return withClaudeDebounce({
            provider: 'claude',
            status: 'error',
            resetAt: 0,
            resetAtHuman: 'Error',
            errorMessage,
            checkedAt,
        }, context.debounceMs.claude, 'live');
    }
}
async function getCodexStatus(context) {
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
    }
    catch (error) {
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
export async function checkLimits(tools) {
    const context = getRunContext();
    const providersToCheck = tools && tools.length > 0
        ? tools
        : ['claude', 'gemini', 'zai', 'codex'];
    const promises = [];
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
export { ZaiClient, GeminiClient, ClaudeClient, CodexClient };
//# sourceMappingURL=index.js.map