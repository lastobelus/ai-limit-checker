import { spawn } from 'node-pty';
import type { ClaudeStatusInfo } from './types.js';
import type { RunContext } from '../config/index.js';

function stripAnsiCodes(text: string): string {
  let cleaned = text.replace(/\x1b\[[0-9;]*m/g, '');
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  cleaned = cleaned.replace(/\x1b\[?[0-9;]*[0-9;]*[0-9;]*[a-zA-Z]/g, '');
  return cleaned;
}

function matchPattern(text: string, patterns: string[]): boolean {
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  return patterns.some(p => normalized.includes(p.replace(/\s+/g, '').toLowerCase()));
}

export class ClaudeClient {
  private context: RunContext;

  constructor(context: RunContext) {
    this.context = context;
  }

  async getUsageStats(): Promise<ClaudeStatusInfo> {
    const timeout = this.context.timeouts.claude;
    
    const ptyProcess = spawn('claude', [], {
      name: 'xterm-color',
      cols: 120,
      rows: 40,
      cwd: this.context.cwd,
      env: this.context.env,
    });

    let output = '';
    let rawOutput = '';

    ptyProcess.onData((data) => {
      output += data;
      rawOutput += stripAnsiCodes(data);
    });

    const deadline = Date.now() + timeout;
    
    while (Date.now() < deadline) {
      if (matchPattern(rawOutput, ['trust this folder'])) {
        await this.delay(500);
        ptyProcess.write('\r');
        await this.delay(2000);
        rawOutput = '';
      }
      
      if (matchPattern(rawOutput, ['Tips for getting started', 'What would you like'])) {
        break;
      }
      
      await this.delay(200);
    }

    await this.delay(500);
    ptyProcess.write('/usage\r');
    await this.delay(3000);

    ptyProcess.write('\x1b');
    await this.delay(300);
    ptyProcess.write('/exit\r');
    await this.delay(500);

    ptyProcess.kill();

    return this.parseStatusOutput(output);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseStatusOutput(output: string): ClaudeStatusInfo {
    const cleaned = stripAnsiCodes(output);

    const hasSubscription = !cleaned.includes('only available for subscription plans');

    let sessionUsed = 0;
    const sessionMatch = cleaned.match(/Current session.*?(\d+)%\s*used/is);
    if (sessionMatch) {
      sessionUsed = parseInt(sessionMatch[1], 10);
    }

    let sessionResetTime = 'Unknown';
    const sessionResetMatch = cleaned.match(/Current session.*?Resets\s+([^\(]+)/is);
    if (sessionResetMatch) {
      sessionResetTime = sessionResetMatch[1].trim();
    }

    let weeklyUsed = 0;
    const weeklyMatch = cleaned.match(/Current week.*?(\d+)%\s*used/is);
    if (weeklyMatch) {
      weeklyUsed = parseInt(weeklyMatch[1], 10);
    }

    let weeklyResetTime = 'Unknown';
    const weeklyResetMatch = cleaned.match(/Current week.*?Resets\s+([^\(]+)/is);
    if (weeklyResetMatch) {
      weeklyResetTime = weeklyResetMatch[1].trim();
    }

    return {
      sessionUsed,
      sessionResetTime,
      weeklyUsed,
      weeklyResetTime,
      hasSubscription,
    };
  }
}
