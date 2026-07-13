import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunContext } from './config/index.js';

const {
  getRunContextMock,
  getClaudeUsageStatsMock,
  getCodexUsageStatsMock,
  mkdirMock,
  readFileMock,
  writeFileMock,
} = vi.hoisted(() => ({
  getRunContextMock: vi.fn(),
  getClaudeUsageStatsMock: vi.fn(),
  getCodexUsageStatsMock: vi.fn(),
  mkdirMock: vi.fn(),
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock('./config/index.js', () => ({
  getRunContext: getRunContextMock,
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
}));

vi.mock('./claude/client.js', () => ({
  ClaudeClient: class {
    getUsageStats = getClaudeUsageStatsMock;
  },
}));

vi.mock('./gemini/client.js', () => ({
  GeminiClient: class {},
}));

vi.mock('./zai/client.js', () => ({
  ZaiClient: class {},
}));

vi.mock('./codex/client.js', () => ({
  CodexClient: class {
    getUsageStats = getCodexUsageStatsMock;
  },
}));

import { checkLimits } from './index.js';

describe('checkLimits Claude debounce', () => {
  const context: RunContext = {
    runtimeRoot: '/tmp/ai-limit-checker',
    cwd: '/tmp',
    env: {},
    timeouts: {
      claude: 1,
      gemini: 1,
      zai: 1,
      codex: 1,
    },
    debounceMs: {
      claude: 5 * 60 * 1000,
    },
    zai: {
      userDataDir: '/tmp/chrome-data',
      outputDir: '/tmp/chrome-output',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getRunContextMock.mockReturnValue(context);
  });

  it('reuses a cached Claude result within the debounce window', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    readFileMock.mockResolvedValue(JSON.stringify({
      status: {
        provider: 'claude',
        status: 'available',
        usagePercent: 12,
        checkedAt: 9_000,
      },
    }));

    const [result] = await checkLimits(['claude']);

    expect(getClaudeUsageStatsMock).not.toHaveBeenCalled();
    expect(result.debounce).toEqual({
      waitMs: 5 * 60 * 1000,
      source: 'cache',
      expiresAt: 309_000,
    });
  });

  it('fetches live Claude usage and persists it when the cache is stale', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    readFileMock.mockResolvedValue(JSON.stringify({
      status: {
        provider: 'claude',
        status: 'available',
        usagePercent: 12,
        checkedAt: -400_000,
      },
    }));
    getClaudeUsageStatsMock.mockResolvedValue({
      sessionUsed: 45,
      sessionResetTime: '2024-01-04T16:00:00.000Z',
      weeklyUsed: 23,
      weeklyResetTime: '2024-01-07T00:00:00.000Z',
    });

    const [result] = await checkLimits(['claude']);

    expect(getClaudeUsageStatsMock).toHaveBeenCalledTimes(1);
    expect(result.debounce).toEqual({
      waitMs: 5 * 60 * 1000,
      source: 'live',
      expiresAt: 310_000,
    });
    expect(mkdirMock).toHaveBeenCalledWith('/tmp/ai-limit-checker/cache', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledTimes(1);

    const [, payload] = writeFileMock.mock.calls[0];
    expect(JSON.parse(payload as string)).toMatchObject({
      status: {
        provider: 'claude',
        status: 'available',
        checkedAt: 10_000,
      },
    });
  });

  it('disables the Claude cache when the configured debounce is 0', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    getRunContextMock.mockReturnValue({
      ...context,
      debounceMs: { claude: 0 },
    });
    getClaudeUsageStatsMock.mockResolvedValue({
      sessionUsed: 45,
      sessionResetTime: '2024-01-04T16:00:00.000Z',
      weeklyUsed: 23,
      weeklyResetTime: '2024-01-07T00:00:00.000Z',
    });

    const [result] = await checkLimits(['claude']);

    expect(readFileMock).not.toHaveBeenCalled();
    expect(getClaudeUsageStatsMock).toHaveBeenCalledTimes(1);
    expect(result.debounce).toEqual({
      waitMs: 0,
      source: 'live',
      expiresAt: undefined,
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uses the weekly Codex window for top-level status when the 5h window is unavailable', async () => {
    getCodexUsageStatsMock.mockResolvedValue({
      primaryWindowUsed: undefined,
      primaryWindowResetTime: 'Unknown',
      secondaryWindowUsed: 13,
      secondaryWindowResetTime: '2024-01-07T00:00:00.000Z',
    });

    const [result] = await checkLimits(['codex']);

    expect(result).toMatchObject({
      provider: 'codex',
      status: 'available',
      usagePercent: 13,
      resetAt: new Date('2024-01-07T00:00:00.000Z').getTime(),
      resetAtHuman: '2024-01-07T00:00:00.000Z',
      windows: [{
        type: 'weekly',
        usagePercent: 13,
      }],
    });
  });
});
