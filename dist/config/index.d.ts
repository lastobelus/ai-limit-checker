export interface AiLimitCheckerConfig {
    runtimeRoot: string;
    inheritEnvAllowlist: string[];
    zai: {
        userDataDir: string;
        outputDir: string;
    };
    debounceMs: {
        claude: number;
    };
    timeoutsMs: {
        claude: number;
        gemini: number;
        zai: number;
        codex: number;
    };
}
export interface RunContext {
    runtimeRoot: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeouts: {
        claude: number;
        gemini: number;
        zai: number;
        codex: number;
    };
    debounceMs: {
        claude: number;
    };
    zai: {
        userDataDir: string;
        outputDir: string;
    };
}
export declare function loadConfig(): AiLimitCheckerConfig;
export declare function createRunContext(config: AiLimitCheckerConfig): RunContext;
export declare function getRunContext(): RunContext;
//# sourceMappingURL=index.d.ts.map