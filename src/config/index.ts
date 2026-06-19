import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, isAbsolute } from 'node:path';

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

const DEFAULT_ENV_ALLOWLIST = [
  'HOME',
  'PATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'SSH_AUTH_SOCK',
  'CLAUDE_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
];

const DEFAULT_TIMEOUTS = {
  claude: 60000,
  gemini: 60000,
  zai: 60000,
  codex: 30000,
};

const DEFAULT_DEBOUNCE_MS = {
  claude: 5 * 60 * 1000,
};

function getDefaultRuntimeRoot(): string {
  return resolve(homedir(), '.ai-limit-checker-root');
}

function getConfigPath(): string {
  const configDir = process.env.AI_LIMIT_CHECKER_CONFIG_DIR || resolve(homedir(), '.config', 'ai-limit-checker');
  return resolve(configDir, 'config.json');
}

function validateAbsolutePath(path: string, name: string): string {
  const resolved = resolve(path);
  if (!isAbsolute(resolved)) {
    throw new Error(`Config error: ${name} must be an absolute path, got: ${path}`);
  }
  return resolved;
}

function ensureDirectory(path: string, description: string): string {
  if (!existsSync(path)) {
    try {
      mkdirSync(path, { recursive: true });
    } catch (err) {
      throw new Error(`Failed to create ${description} directory: ${path} - ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return path;
}

function readNonNegativeNumber(value: unknown, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error(`Config error: ${name} must be a non-negative number, got: ${String(value)}`);
  }

  return value;
}

export function loadConfig(): AiLimitCheckerConfig {
  const configPath = getConfigPath();
  
  if (!existsSync(configPath)) {
    const runtimeRoot = getDefaultRuntimeRoot();
    return {
      runtimeRoot,
      inheritEnvAllowlist: DEFAULT_ENV_ALLOWLIST,
      zai: {
        userDataDir: resolve(runtimeRoot, 'chrome-data'),
        outputDir: resolve(runtimeRoot, 'chrome-output'),
      },
      debounceMs: { ...DEFAULT_DEBOUNCE_MS },
      timeoutsMs: { ...DEFAULT_TIMEOUTS },
    };
  }

  let rawConfig: Record<string, unknown>;
  try {
    const content = readFileSync(configPath, 'utf-8');
    rawConfig = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to load config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const runtimeRoot = validateAbsolutePath(
    typeof rawConfig.runtimeRoot === 'string' ? rawConfig.runtimeRoot : getDefaultRuntimeRoot(),
    'runtimeRoot'
  );

  const inheritEnvAllowlist = Array.isArray(rawConfig.inheritEnvAllowlist)
    ? rawConfig.inheritEnvAllowlist.filter((v): v is string => typeof v === 'string')
    : DEFAULT_ENV_ALLOWLIST;

  const rawTimeouts = rawConfig.timeoutsMs as Record<string, unknown> | undefined;
  const timeouts = {
    claude: readNonNegativeNumber(rawTimeouts?.claude, DEFAULT_TIMEOUTS.claude, 'timeoutsMs.claude'),
    gemini: readNonNegativeNumber(rawTimeouts?.gemini, DEFAULT_TIMEOUTS.gemini, 'timeoutsMs.gemini'),
    zai: readNonNegativeNumber(rawTimeouts?.zai, DEFAULT_TIMEOUTS.zai, 'timeoutsMs.zai'),
    codex: readNonNegativeNumber(rawTimeouts?.codex, DEFAULT_TIMEOUTS.codex, 'timeoutsMs.codex'),
  };

  const rawDebounce = rawConfig.debounceMs as Record<string, unknown> | undefined;
  const debounceMs = {
    claude: readNonNegativeNumber(rawDebounce?.claude, DEFAULT_DEBOUNCE_MS.claude, 'debounceMs.claude'),
  };

  const rawZai = rawConfig.zai as Record<string, unknown> | undefined;
  const zai = {
    userDataDir: validateAbsolutePath(
      typeof rawZai?.userDataDir === 'string' ? rawZai.userDataDir : resolve(runtimeRoot, 'chrome-data'),
      'zai.userDataDir'
    ),
    outputDir: validateAbsolutePath(
      typeof rawZai?.outputDir === 'string' ? rawZai.outputDir : resolve(runtimeRoot, 'chrome-output'),
      'zai.outputDir'
    ),
  };

  return {
    runtimeRoot,
    inheritEnvAllowlist,
    zai,
    debounceMs,
    timeoutsMs: timeouts,
  };
}

export function createRunContext(config: AiLimitCheckerConfig): RunContext {
  ensureDirectory(config.runtimeRoot, 'runtime root');
  
  ensureDirectory(config.zai.userDataDir, 'zai user data');
  ensureDirectory(config.zai.outputDir, 'zai output');

  const filteredEnv: NodeJS.ProcessEnv = { ...process.env };
  
  const keysToKeep = new Set(config.inheritEnvAllowlist);
  for (const key of Object.keys(filteredEnv)) {
    if (!keysToKeep.has(key)) {
      delete filteredEnv[key];
    }
  }

  if (!filteredEnv.PATH) {
    filteredEnv.PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  }

  const cwd = filteredEnv.HOME || homedir();

  return {
    runtimeRoot: config.runtimeRoot,
    cwd,
    env: filteredEnv,
    timeouts: config.timeoutsMs,
    debounceMs: config.debounceMs,
    zai: config.zai,
  };
}

export function getRunContext(): RunContext {
  const config = loadConfig();
  return createRunContext(config);
}
