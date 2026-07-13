import { describe, expect, it } from 'vitest';
import { formatPrettyOutput } from './pretty.js';

describe('formatPrettyOutput', () => {
  it('prints the configured Claude debounce in the pretty header', () => {
    const output = formatPrettyOutput([{
      provider: 'claude',
      status: 'available',
      usagePercent: 24,
      checkedAt: 10_000,
      debounce: {
        waitMs: 5 * 60 * 1000,
        source: 'live',
        expiresAt: 310_000,
      },
    }]);

    expect(output).toContain('Claude debounce: 5m');
  });

  it('marks the pretty header when Claude output came from the debounce cache', () => {
    const output = formatPrettyOutput([{
      provider: 'claude',
      status: 'available',
      usagePercent: 24,
      checkedAt: 10_000,
      debounce: {
        waitMs: 5 * 60 * 1000,
        source: 'cache',
        expiresAt: 310_000,
      },
    }]);

    expect(output).toContain('Claude debounce: 5m (cached)');
  });

  it('leaves 5h usage empty when only the weekly Codex window is available', () => {
    const output = formatPrettyOutput([{
      provider: 'codex',
      status: 'available',
      usagePercent: 13,
      resetAt: new Date('2024-01-07T00:00:00Z').getTime(),
      windows: [{
        type: 'weekly',
        usagePercent: 13,
        resetAt: new Date('2024-01-07T00:00:00Z').getTime(),
      }],
      checkedAt: 10_000,
    }]);
    const codexRow = (output.split('\n').find(line => line.includes('codex')) ?? '')
      .replace(/\x1b\[[0-9;]*m/g, '');

    expect(codexRow).toMatch(/codex\s+✅ available\s+-\s+13%/);
  });
});
