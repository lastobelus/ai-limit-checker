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
});
