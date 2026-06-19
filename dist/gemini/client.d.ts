import type { GeminiModelUsage } from './types.js';
import type { RunContext } from '../config/index.js';
export declare class GeminiClient {
    private context;
    constructor(context: RunContext);
    getUsageStats(): Promise<GeminiModelUsage[]>;
    private delay;
    private parseUsageStats;
}
//# sourceMappingURL=client.d.ts.map