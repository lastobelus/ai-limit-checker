import type { RunContext } from './config/index.js';
export type ProviderName = 'claude' | 'gemini' | 'zai' | 'codex';
export declare function getLoginCommand(provider: ProviderName): string;
export declare function runLogin(provider: ProviderName, context: RunContext): Promise<void>;
//# sourceMappingURL=login.d.ts.map