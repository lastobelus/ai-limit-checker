import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createRunContext, loadConfig } from './index.js';
describe('config', () => {
    const originalConfigDir = process.env.AI_LIMIT_CHECKER_CONFIG_DIR;
    afterEach(() => {
        if (originalConfigDir === undefined) {
            delete process.env.AI_LIMIT_CHECKER_CONFIG_DIR;
        }
        else {
            process.env.AI_LIMIT_CHECKER_CONFIG_DIR = originalConfigDir;
        }
    });
    it('defaults Claude debounce to 5 minutes', () => {
        const configDir = mkdtempSync(resolve(tmpdir(), 'ai-limit-checker-config-'));
        process.env.AI_LIMIT_CHECKER_CONFIG_DIR = configDir;
        const config = loadConfig();
        expect(config.debounceMs.claude).toBe(5 * 60 * 1000);
        rmSync(configDir, { recursive: true, force: true });
    });
    it('loads configurable Claude debounce into the run context', () => {
        const configDir = mkdtempSync(resolve(tmpdir(), 'ai-limit-checker-config-'));
        const runtimeRoot = mkdtempSync(resolve(tmpdir(), 'ai-limit-checker-runtime-'));
        mkdirSync(configDir, { recursive: true });
        writeFileSync(resolve(configDir, 'config.json'), JSON.stringify({
            runtimeRoot,
            debounceMs: {
                claude: 45000,
            },
        }, null, 2));
        process.env.AI_LIMIT_CHECKER_CONFIG_DIR = configDir;
        const config = loadConfig();
        const context = createRunContext(config);
        expect(config.debounceMs.claude).toBe(45000);
        expect(context.debounceMs.claude).toBe(45000);
        rmSync(configDir, { recursive: true, force: true });
        rmSync(runtimeRoot, { recursive: true, force: true });
    });
});
//# sourceMappingURL=index.test.js.map