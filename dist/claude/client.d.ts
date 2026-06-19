import type { RunContext } from '../config/index.js';
import type { ClaudeStatusInfo } from './types.js';
export declare class ClaudeClient {
    private context;
    constructor(context: RunContext);
    private getTokenFromFile;
    private getTokenFromKeychain;
    private getAccessToken;
    private extractResetTimestamp;
    private normalizeTimestamp;
    getUsageStats(): Promise<ClaudeStatusInfo>;
}
//# sourceMappingURL=client.d.ts.map