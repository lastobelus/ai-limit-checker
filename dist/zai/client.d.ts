import type { ZaiLimit } from './types.js';
import type { RunContext } from '../config/index.js';
export declare class ZaiClient {
    private context;
    constructor(context: RunContext);
    private waitForUsageQuotaResponse;
    private closeBlockingDialogs;
    private clickUsageNavigation;
    getUsageQuota(): Promise<ZaiLimit[]>;
}
//# sourceMappingURL=client.d.ts.map