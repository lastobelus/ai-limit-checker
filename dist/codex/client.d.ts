import type { RunContext } from '../config/index.js';
import type { CodexStatusInfo } from './types.js';
export declare class CodexClient {
    private context;
    constructor(context: RunContext);
    private getCredentials;
    private extractResetTimestamp;
    private normalizeTimestamp;
    private extractAccountIdFromToken;
    getUsageStats(): Promise<CodexStatusInfo>;
}
//# sourceMappingURL=client.d.ts.map