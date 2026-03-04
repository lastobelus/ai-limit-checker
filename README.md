# AI Limit Checker

[![npm version](https://badge.fury.io/js/%40shaharia-lab%2Fai-limit-checker.svg)](https://www.npmjs.com/package/@shaharia-lab/ai-limit-checker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@shaharia-lab/ai-limit-checker)](https://nodejs.org)

A powerful CLI tool and library for monitoring rate limits across multiple LLM providers (Claude, Gemini, and z.ai). Perfect for developers, automation scripts, and monitoring systems that need to track API usage and avoid rate limit errors.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Usage](#usage)
  - [CLI Usage](#cli-usage)
  - [Library Usage](#library-usage)
- [Output Format](#output-format)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Use Cases](#use-cases)
- [Development](#development)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

## Features

- ✅ **Multi-Provider Support**: Check rate limits for Claude, Gemini, and z.ai in one command
- ✅ **CLI & Library**: Use as a standalone CLI tool or integrate into your Node.js projects
- ✅ **JSON Output**: Structured JSON output perfect for automation and monitoring
- ✅ **Real-time Status**: Get current usage and reset times for each provider
- ✅ **Zero Configuration**: Works out of the box with provider CLIs already installed
- ✅ **TypeScript Support**: Fully typed for TypeScript projects
- ✅ **Lightweight**: Minimal dependencies, fast execution

## Installation

### Global Installation (CLI)

```bash
npm install -g @shaharia-lab/ai-limit-checker
```

### Local Installation (Library)

```bash
npm install @shaharia-lab/ai-limit-checker
```

## Quick Start

After installing globally, run with the `--tools` flag to specify which providers to check:

```bash
ai-limit-checker --tools=claude,gemini,zai
```

The `--tools` flag is **required** and accepts comma-separated provider names.

**Example Output:**

```json
[
  {
    "provider": "claude",
    "status": "available",
    "resetAt": 1704384000000,
    "resetAtHuman": "2024-01-04T16:00:00.000Z"
  },
  {
    "provider": "gemini",
    "status": "rate_limit_exceed",
    "resetAt": 1704393000000,
    "resetAtHuman": "2024-01-04T18:30:00.000Z"
  },
  {
    "provider": "zai",
    "status": "available",
    "resetAt": 1704412800000,
    "resetAtHuman": "2024-01-05T00:00:00.000Z"
  }
]
```

## Prerequisites

### Required for All Providers

- **Node.js**: Version 18.0.0 or higher
- **npm**: Latest version recommended

### Provider-Specific Requirements

#### Claude
- **Claude CLI**: Install from [claude.ai/code](https://claude.ai/code)
- Ensure you're logged in: `claude`

#### Gemini
- **Gemini CLI**: Install from [Google AI Studio](https://ai.google.dev/)
- Authentication configured with your API key

#### z.ai
- **Chrome Browser**: Required for Playwright automation
- **Environment Variables**: Configure Chrome directories (see [Configuration](#configuration))

## Usage

### CLI Usage

#### Basic Command

The `--tools` flag is **required** and specifies which providers to check.

```bash
# Check all providers
ai-limit-checker --tools=claude,gemini,zai

# Check only Claude
ai-limit-checker --tools=claude

# Check Claude and Gemini
ai-limit-checker --tools=claude,gemini

# Check only z.ai
ai-limit-checker --tools=zai
```

#### Skip Behavior

The tool will automatically skip providers that are not available on your system and display a warning message:

- **Claude**: Skipped if the `claude` CLI is not installed
- **Gemini**: Skipped if the `gemini` CLI is not installed
- **z.ai**: Skipped if Chrome environment variables (`CHROME_OUTPUT_DIR`, `CHROME_USER_DATA_DIR`) are not set

Skipped providers will return `status: "available"` with `resetAtHuman: "Unknown (skipped)"`.

#### Integration with Shell Scripts

```bash
#!/bin/bash

# Check if any provider is rate limited
result=$(ai-limit-checker --tools=claude,gemini,zai)
if echo "$result" | grep -q "rate_limit_exceed"; then
    echo "Warning: One or more providers are rate limited!"
    echo "$result" | jq '.[] | select(.status=="rate_limit_exceed")'
    exit 1
fi

echo "All providers available"
```

#### Monitoring with Cron

Add to your crontab to check limits every hour:

```bash
0 * * * * /usr/local/bin/ai-limit-checker --tools=claude,gemini,zai >> /var/log/llm-limits.log 2>&1
```

### Library Usage

#### Basic Example

```typescript
import { checkLimits } from '@shaharia-lab/ai-limit-checker';

async function main() {
  try {
    // Check specific providers
    const limits = await checkLimits(['claude', 'gemini', 'zai']);

    // Or check all providers (no arguments)
    // const limits = await checkLimits();

    for (const limit of limits) {
      console.log(`${limit.provider}: ${limit.status}`);
      if (limit.resetAtHuman) {
        console.log(`  Resets at: ${limit.resetAtHuman}`);
      }
    }
  } catch (error) {
    console.error('Error checking limits:', error);
  }
}

main();
```

#### Advanced Example: Smart Request Router

```typescript
import { checkLimits, type LlmLimitStatus } from '@shaharia-lab/ai-limit-checker';

async function getAvailableProvider(): Promise<string | null> {
  const limits = await checkLimits();

  // Find the first available provider
  const available = limits.find(limit => limit.status === 'available');

  if (available) {
    console.log(`Using ${available.provider}`);
    return available.provider;
  }

  // All providers rate limited - find the one that resets soonest
  const soonest = limits
    .filter(l => l.resetAt && l.resetAt > 0)
    .sort((a, b) => (a.resetAt! - b.resetAt!))[0];

  if (soonest) {
    const waitTime = soonest.resetAt! - Date.now();
    console.log(`All providers limited. ${soonest.provider} resets in ${waitTime}ms`);
  }

  return null;
}

// Use in your application
const provider = await getAvailableProvider();
if (provider) {
  // Make your API request to the available provider
}
```

#### Using Individual Clients

```typescript
import { ClaudeClient, GeminiClient, ZaiClient, getRunContext } from '@shaharia-lab/ai-limit-checker';

const context = getRunContext();

// Check only Claude
const claudeClient = new ClaudeClient(context);
const claudeStatus = await claudeClient.getUsageStats();
console.log(`Claude session usage: ${claudeStatus.sessionUsed}%`);

// Check only Gemini
const geminiClient = new GeminiClient(context);
const geminiUsage = await geminiClient.getUsageStats();
geminiUsage.forEach(model => {
  console.log(`${model.model}: ${model.usage}% (resets in ${model.resets})`);
});

// Check only z.ai
const zaiClient = new ZaiClient(context);
const zaiLimits = await zaiClient.getUsageQuota();
const tokensLimit = zaiLimits.find(l => l.type === 'TOKENS_LIMIT');
console.log(`z.ai tokens used: ${tokensLimit?.percentage}%`);
```

## Output Format

### Status Object

Each provider returns a status object with the following structure:

```typescript
interface LlmLimitStatus {
  provider: string;                                      // Provider name: 'claude', 'gemini', or 'zai'
  status: 'rate_limit_exceed' | 'available' | 'error';  // Current status
  usagePercent?: number;                                 // Usage percentage (0-100)
  resetAt?: number;                                      // Unix timestamp (ms) when limit resets
  resetAtHuman?: string;                                 // ISO 8601 formatted date string
  errorMessage?: string;                                 // Error message if status is 'error'
  checkedAt: number;                                     // Unix timestamp (ms) when check was performed
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `available` | Provider is operational and accepting requests |
| `rate_limit_exceed` | Provider has reached its rate limit threshold |
| `error` | Check failed - see `errorMessage` for details |

### Example Output

```json
[
  {
    "provider": "claude",
    "status": "available",
    "usagePercent": 45,
    "resetAt": 1704384000000,
    "resetAtHuman": "2024-01-04T16:00:00.000Z",
    "checkedAt": 1704380000000
  },
  {
    "provider": "gemini",
    "status": "available",
    "usagePercent": 12,
    "resetAt": 1704470400000,
    "resetAtHuman": "2024-01-05T16:00:00.000Z",
    "checkedAt": 1704380000001
  },
  {
    "provider": "zai",
    "status": "available",
    "usagePercent": 9,
    "resetAt": 1704412800000,
    "resetAtHuman": "2024-01-05T00:00:00.000Z",
    "checkedAt": 1704380000002
  }
]
```

### Example Outputs

#### All Providers Available

```json
[
  {
    "provider": "claude",
    "status": "available",
    "resetAt": 1704384000000,
    "resetAtHuman": "2024-01-04T16:00:00.000Z"
  },
  {
    "provider": "gemini",
    "status": "available",
    "resetAt": 1704470400000,
    "resetAtHuman": "2024-01-05T16:00:00.000Z"
  },
  {
    "provider": "zai",
    "status": "available",
    "resetAt": 1704412800000,
    "resetAtHuman": "2024-01-05T00:00:00.000Z"
  }
]
```

#### One Provider Rate Limited

```json
[
  {
    "provider": "claude",
    "status": "available",
    "resetAt": 1704384000000,
    "resetAtHuman": "2024-01-04T16:00:00.000Z"
  },
  {
    "provider": "gemini",
    "status": "rate_limit_exceed",
    "resetAt": 1704393000000,
    "resetAtHuman": "2024-01-04T18:30:00.000Z"
  },
  {
    "provider": "zai",
    "status": "available",
    "resetAt": 0,
    "resetAtHuman": "Unknown"
  }
]
```

## Configuration

### Configuration File

The tool loads configuration from `~/.config/ai-limit-checker/config.json`. If not present, sensible defaults are used.

**Configuration Schema:**

```json
{
  "runtimeRoot": "/path/to/runtime-root",
  "inheritEnvAllowlist": [
    "HOME", "PATH", "SHELL", "TERM", "LANG", "LC_ALL", "LC_CTYPE",
    "TMPDIR", "SSH_AUTH_SOCK", "CLAUDE_API_KEY", "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY", "GOOGLE_API_KEY"
  ],
  "zai": {
    "userDataDir": "/path/to/chrome-data",
    "outputDir": "/path/to/chrome-output"
  },
  "timeoutsMs": {
    "claude": 30000,
    "gemini": 30000,
    "zai": 45000
  }
}
```

**Configuration Options:**
- `runtimeRoot`: Directory where provider subprocesses execute (isolated from project CWD)
- `inheritEnvAllowlist`: Environment variables passed to provider subprocesses (others are filtered)
- `zai.userDataDir`: Chrome user data directory for z.ai automation
- `zai.outputDir`: Chrome output directory
- `timeoutsMs`: Per-provider timeouts in milliseconds

### z.ai Chrome Setup

z.ai requires Chrome browser automation using Playwright. Follow these steps:

#### 1. Create Required Directories

```bash
mkdir -p ~/.ai-limit-checker-root/chrome-data
```

#### 2. Set Up Chrome User Data

Launch Chrome with the persistent user data directory and log into z.ai:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --user-data-dir="$HOME/.ai-limit-checker-root/chrome-data" https://z.ai/manage-apikey/subscription

# Linux
google-chrome --user-data-dir="$HOME/.ai-limit-checker-root/chrome-data" https://z.ai/manage-apikey/subscription
```

#### 3. Log into z.ai

1. In the Chrome window that opens, log in to z.ai (Google, Email, or GitHub)
2. Close the browser window when done

**Note:** The tool uses `--use-mock-keychain` to avoid repeated keychain password prompts on macOS.

#### 4. Verify Configuration

The config file at `~/.config/ai-limit-checker/config.json` should have:

```json
{
  "zai": {
    "userDataDir": "/Users/your-username/.ai-limit-checker-root/chrome-data"
  }
}
```

If no config exists, defaults are used automatically.

## Security Model

This tool handles sensitive API credentials and interacts with external providers. Here's how it keeps your data safe:

### Environment Isolation

Provider subprocesses run with a **filtered environment** - only variables in the `inheritEnvAllowlist` are passed. This prevents accidental leakage of unrelated environment variables.

### Isolated Runtime Root

All provider interactions execute from a configurable `runtimeRoot` directory, not your project's working directory. This prevents unintended file access.

### No Debug Data Persistence

- **Claude**: No longer writes debug output to `/tmp`
- **Gemini**: Removed `--yolo` flag, uses safe interaction mode
- **z.ai**: Uses configured directories only

### Explicit Error Status

Provider failures return `status: "error"` instead of silently returning `available`. This ensures you know when checks fail.

```json
{
  "provider": "claude",
  "status": "error",
  "errorMessage": "CLI is not available on this system",
  "checkedAt": 1704384000000
}
```

### Restrictive direnv Setup

For maximum security, use direnv with the provided `.envrc` template:

```bash
# Create runtime root
mkdir -p /path/to/.ai-limit-checker-root
cd /path/to/.ai-limit-checker-root

# Copy the .envrc template and customize
# Add your API keys to .envrc.private (gitignored)
```

The `.envrc` setup:
- Uses `strict_env` to block inherited environment
- Keeps only essential variables (HOME, PATH, etc.)
- Loads API keys from a private file
- Enforces required API keys with `env_vars_required`

### Best Practices

1. **Never commit API keys** to version control
2. **Use direnv** for isolated environments
3. **Review the allowlist** before adding new environment variables
4. **Monitor error statuses** in your automation scripts

### Alternative: Using .env File

For project-specific configuration, create a `.env` file:

```bash
CHROME_OUTPUT_DIR=/path/to/chrome/output
CHROME_USER_DATA_DIR=/path/to/chrome/user-data
```

Then load it in your script:

```typescript
import { config } from 'dotenv';
config();

import { checkLimits } from '@shaharia-lab/ai-limit-checker';
// ...
```

## API Reference

### `checkLimits()`

Main function that checks provider limits.

```typescript
function checkLimits(tools?: ProviderName[]): Promise<LlmLimitStatus[]>

type ProviderName = 'claude' | 'gemini' | 'zai';
```

**Parameters**:
- `tools` (optional): Array of provider names to check. If not provided, checks all providers.

**Returns**: Promise that resolves to an array of status objects for the specified providers.

**Examples**:
```typescript
// Check specific providers
const limits = await checkLimits(['claude', 'gemini']);

// Check all providers
const allLimits = await checkLimits();
```

### `ClaudeClient`

Client for checking Claude CLI usage.

```typescript
import { ClaudeClient, getRunContext } from '@shaharia-lab/ai-limit-checker';

const context = getRunContext();
const client = new ClaudeClient(context);

class ClaudeClient {
  constructor(context: RunContext)
  async getUsageStats(): Promise<ClaudeStatusInfo>
}

interface ClaudeStatusInfo {
  sessionUsed: number;        // Session usage percentage (0-100)
  sessionResetTime: string;   // Human-readable reset time
  weeklyUsed: number;         // Weekly usage percentage (0-100)
  weeklyResetTime: string;    // Human-readable weekly reset time
  hasSubscription: boolean;   // Whether user has a subscription
}
```

### `GeminiClient`

Client for checking Gemini CLI usage.

```typescript
import { GeminiClient, getRunContext } from '@shaharia-lab/ai-limit-checker';

const context = getRunContext();
const client = new GeminiClient(context);

class GeminiClient {
  constructor(context: RunContext)
  async getUsageStats(): Promise<GeminiModelUsage[]>
}

interface GeminiModelUsage {
  model: string;     // Model name (e.g., "gemini-2.5-flash")
  requests: string;  // Number of requests or "-"
  usage: string;     // Usage percentage
  resets: string;    // Time until reset (e.g., "2h 30m")
}
```

### `ZaiClient`

Client for checking z.ai usage via browser automation.

```typescript
import { ZaiClient, getRunContext } from '@shaharia-lab/ai-limit-checker';

const context = getRunContext();
const client = new ZaiClient(context);

class ZaiClient {
  constructor(context: RunContext)
  async getUsageQuota(): Promise<ZaiLimit[]>
}

interface ZaiLimit {
  type: string;           // Limit type (e.g., "TOKENS_LIMIT")
  percentage: number;     // Usage percentage (0-100)
  nextResetTime?: number; // Unix timestamp of next reset
  // ... other fields
}
```

## Use Cases

### 1. CI/CD Pipeline Integration

```yaml
# .github/workflows/check-llm-limits.yml
name: Check LLM Limits

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  check-limits:
    runs-on: ubuntu-latest
    steps:
      - name: Install AI Limit Checker
        run: npm install -g @shaharia-lab/ai-limit-checker

      - name: Check Limits
        run: |
          ai-limit-checker --tools=claude,gemini,zai > limits.json
          cat limits.json

      - name: Alert on Rate Limit
        run: |
          if grep -q "rate_limit_exceed" limits.json; then
            echo "::warning::One or more LLM providers are rate limited"
          fi
```

### 2. Smart Load Balancer

```typescript
import { checkLimits } from '@shaharia-lab/ai-limit-checker';

class LLMLoadBalancer {
  async getOptimalProvider(): Promise<string> {
    const limits = await checkLimits();

    // Prefer available providers
    const available = limits.filter(l => l.status === 'available');
    if (available.length > 0) {
      // Return random available provider for load distribution
      return available[Math.floor(Math.random() * available.length)].provider;
    }

    // All limited - queue request for soonest reset
    const soonest = limits
      .filter(l => l.resetAt && l.resetAt > 0)
      .sort((a, b) => a.resetAt! - b.resetAt!)[0];

    throw new Error(`All providers limited. Retry after ${soonest.resetAtHuman}`);
  }
}
```

### 3. Monitoring Dashboard

```typescript
import { checkLimits } from '@shaharia-lab/ai-limit-checker';
import express from 'express';

const app = express();

app.get('/api/llm-status', async (req, res) => {
  try {
    const limits = await checkLimits();
    res.json({
      timestamp: new Date().toISOString(),
      providers: limits,
      healthy: limits.every(l => l.status === 'available')
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check limits' });
  }
});

app.listen(3000, () => console.log('Dashboard running on http://localhost:3000'));
```

### 4. Cost Optimization

```typescript
import { checkLimits } from '@shaharia-lab/ai-limit-checker';

async function selectCostEffectiveProvider(preferCheaper: boolean = true) {
  const limits = await checkLimits();
  const available = limits.filter(l => l.status === 'available');

  if (available.length === 0) {
    throw new Error('No providers available');
  }

  // Example: Gemini is cheaper than Claude for most tasks
  const costOrder = preferCheaper
    ? ['gemini', 'zai', 'claude']
    : ['claude', 'zai', 'gemini'];

  for (const provider of costOrder) {
    if (available.some(a => a.provider === provider)) {
      return provider;
    }
  }

  return available[0].provider;
}
```

## Development

### Prerequisites for Development

- Node.js >= 18.0.0
- npm or yarn
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/shaharia-lab/ai-limit-checker.git
cd ai-limit-checker

# Install dependencies
npm install

# Build the project
npm run build

# Link for local testing
npm link
```

### Project Structure

```
ai-limit-checker/
├── src/
│   ├── claude/         # Claude CLI client
│   ├── gemini/         # Gemini CLI client
│   ├── zai/            # z.ai browser automation client
│   ├── config/         # Environment configuration
│   ├── index.ts        # Main library exports
│   └── cli.ts          # CLI entry point
├── dist/               # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Testing Locally

```bash
# After linking
ai-limit-checker --tools=claude,gemini

# Or run directly
node dist/cli.js --tools=claude
```

## FAQ

### Q: Do I need accounts for all providers?

**A**: No. The tool will gracefully skip providers that are not available on your system and display a warning message. Skipped providers return `available` status with `resetAtHuman: "Unknown (skipped)"`.

### Q: What is the `--tools` flag?

**A**: The `--tools` flag is required and specifies which providers to check. It accepts comma-separated provider names (e.g., `--tools=claude,gemini,zai`). This allows you to check only the providers you're interested in.

### Q: How often should I check limits?

**A**: It depends on your usage. For active development, checking every 5-10 minutes is reasonable. For production monitoring, every hour is usually sufficient.

### Q: What if I don't use z.ai?

**A**: The tool works fine without z.ai configured. Simply don't set the `CHROME_OUTPUT_DIR` and `CHROME_USER_DATA_DIR` environment variables. The z.ai check will return `available` status with unknown reset time.

### Q: Can I use this in a Docker container?

**A**: Yes! For z.ai support in Docker, you'll need to install Chrome and configure Playwright. See the [Playwright Docker documentation](https://playwright.dev/docs/docker) for details.

### Q: Does this work on Windows/macOS/Linux?

**A**: Yes! The tool is cross-platform. Note that Chrome paths may differ:
- **Windows**: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- **macOS**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Linux**: `google-chrome` or `chromium-browser`

### Q: How accurate are the rate limit checks?

**A**: Very accurate. The tool uses the same interfaces (CLIs and web interfaces) that you use manually, ensuring the data is as current as what the providers report.

### Q: Can I contribute support for other providers?

**A**: Absolutely! We welcome contributions. Please see our [Contributing](#contributing) section and open a PR.

## Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

- Use the [GitHub Issues](https://github.com/shaharia-lab/ai-limit-checker/issues) page
- Include your Node.js version, OS, and error messages
- Provide steps to reproduce the issue

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests and build: `npm run build`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Adding New Providers

To add support for a new LLM provider:

1. Create a new directory under `src/` (e.g., `src/newprovider/`)
2. Implement `client.ts` with the provider's API/CLI interface
3. Define types in `types.ts`
4. Update `src/index.ts` to include the new provider in `checkLimits()`
5. Add documentation to README.md
6. Submit a PR!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- **npm Package**: https://www.npmjs.com/package/@shaharia-lab/ai-limit-checker
- **GitHub Repository**: https://github.com/shaharia-lab/ai-limit-checker
- **Issue Tracker**: https://github.com/shaharia-lab/ai-limit-checker/issues
- **Changelog**: https://github.com/shaharia-lab/ai-limit-checker/releases

## Acknowledgments

- Built with [Playwright](https://playwright.dev/) for browser automation
- Uses [node-pty](https://github.com/microsoft/node-pty) for CLI interaction
- Developed by [Shaharia Lab](https://github.com/shaharia-lab)

---

**Made with ❤️ by the Shaharia Lab team**

If you find this tool useful, please consider giving it a ⭐ on [GitHub](https://github.com/shaharia-lab/ai-limit-checker)!
