import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodexClient } from './client.js';
import { getRunContext } from '../config/index.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

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
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockAuth));
      
      const creds = await (client as any).getCredentials();
      expect(creds.tokens.access_token).toBe('test-codex-token');
      expect(creds.tokens.account_id).toBe('user-123');
    });

    it('should throw error when auth.json missing', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      
      await expect((client as any).getCredentials()).rejects.toThrow('Not logged in');
    });

    it('should use CODEX_HOME environment variable', async () => {
      const originalCodexHome = process.env.CODEX_HOME;
      process.env.CODEX_HOME = '/custom/codex';
      
      const mockAuth = {
        tokens: { access_token: 'token' }
      };
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockAuth));
      
      await (client as any).getCredentials();
      
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('/custom/codex'),
        'utf-8'
      );
      
      process.env.CODEX_HOME = originalCodexHome;
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
      const window = { used_percent: 50 };
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
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockAuth));
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
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockAuth));
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
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      
      await expect(client.getUsageStats()).rejects.toThrow('Not logged in');
    });

    it('should throw error on 401 response', async () => {
      const mockAuth = {
        tokens: { access_token: 'expired-token' }
      };
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockAuth));
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
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockAuth));
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
