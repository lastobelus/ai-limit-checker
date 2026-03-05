import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeClient } from './client.js';
import { getRunContext } from '../config/index.js';
import * as childProcess from 'child_process';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import * as fs from 'fs/promises';

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
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockCreds));
      
      const token = await (client as any).getTokenFromFile();
      expect(token).toBe('test-token-123');
    });

    it('should return null when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      
      const token = await (client as any).getTokenFromFile();
      expect(token).toBeNull();
    });

    it('should return null when accessToken is missing', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({}));
      
      const token = await (client as any).getTokenFromFile();
      expect(token).toBeNull();
    });
  });

  describe('getTokenFromKeychain', () => {
    it('should return null on non-macOS platforms', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      
      const token = await (client as any).getTokenFromKeychain();
      expect(token).toBeNull();
      
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
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
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockCreds));
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
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      
      const linuxClient = new ClaudeClient(getRunContext());
      
      await expect(linuxClient.getUsageStats()).rejects.toThrow('Not logged in');
      
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should throw error on 401 response', async () => {
      const mockCreds = {
        claudeAiOauth: { accessToken: 'expired-token' }
      };
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockCreds));
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
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockCreds));
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
