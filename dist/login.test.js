import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const { spawnMock } = vi.hoisted(() => ({
    spawnMock: vi.fn(),
}));
vi.mock('node:child_process', () => ({
    spawn: spawnMock,
}));
import { getLoginCommand, runLogin } from './login.js';
describe('login helpers', () => {
    const context = {
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
            claude: 300000,
        },
        zai: {
            userDataDir: '/tmp/chrome-data',
            outputDir: '/tmp/chrome-output',
        },
    };
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it('returns stable recovery commands for auth-dependent providers', () => {
        expect(getLoginCommand('claude')).toBe('ai-limit-checker login claude');
        expect(getLoginCommand('codex')).toBe('ai-limit-checker login codex');
        expect(getLoginCommand('zai')).toBe('ai-limit-checker login zai');
    });
    it('runs claude login interactively', async () => {
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child);
        const promise = runLogin('claude', context);
        child.emit('exit', 0);
        await promise;
        expect(spawnMock).toHaveBeenCalledWith('claude', ['/login'], { stdio: 'inherit' });
    });
    it('runs codex login interactively', async () => {
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child);
        const promise = runLogin('codex', context);
        child.emit('exit', 0);
        await promise;
        expect(spawnMock).toHaveBeenCalledWith('codex', ['login'], { stdio: 'inherit' });
    });
    it('opens z.ai in a normal Chrome window on macOS', async () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child);
        const promise = runLogin('zai', context);
        child.emit('exit', 0);
        await promise;
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        expect(spawnMock).toHaveBeenCalledWith('open', [
            '-W',
            '-n',
            '-a',
            'Google Chrome',
            '--args',
            '--user-data-dir=/tmp/chrome-data',
            '--new-window',
            'https://z.ai/manage-apikey/subscription',
        ], { stdio: 'inherit' });
    });
    it('falls back to google-chrome on non-macOS platforms', async () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child);
        const promise = runLogin('zai', context);
        child.emit('exit', 0);
        await promise;
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        expect(spawnMock).toHaveBeenCalledWith('google-chrome', [
            '--user-data-dir=/tmp/chrome-data',
            '--new-window',
            'https://z.ai/manage-apikey/subscription',
        ], { stdio: 'inherit' });
    });
    it('rejects gemini login because it is not automated', async () => {
        await expect(runLogin('gemini', context)).rejects.toThrow('Gemini login is not automated');
    });
});
//# sourceMappingURL=login.test.js.map