import { spawn } from 'node-pty';
import type { GeminiModelUsage } from './types.js';
import type { RunContext } from '../config/index.js';

function stripAnsiCodes(text: string): string {
  let cleaned = text.replace(/\x1b\[[0-9;]*m/g, '');
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  cleaned = cleaned.replace(/\x1b\[?[0-9;]*[0-9;]*[0-9;]*[a-zA-Z]/g, '');
  return cleaned;
}

export class GeminiClient {
  private context: RunContext;

  constructor(context: RunContext) {
    this.context = context;
  }

  async getUsageStats(): Promise<GeminiModelUsage[]> {
    const timeout = this.context.timeouts.gemini;
    
    const ptyProcess = spawn('gemini', [], {
      name: 'xterm-color',
      cols: 120,
      rows: 40,
      cwd: this.context.cwd,
      env: this.context.env,
    });

    let output = '';

    ptyProcess.onData((data) => {
      output += data;
    });

    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (output.includes('Type your message') || output.includes('/exit')) {
        break;
      }
      await this.delay(300);
    }

    await this.delay(500);
    ptyProcess.write('/stats\r');
    await this.delay(5000);

    ptyProcess.write('/exit\r');
    await this.delay(500);

    ptyProcess.kill();

    return this.parseUsageStats(output);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseUsageStats(output: string): GeminiModelUsage[] {
    const normalizedOutput = output.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedOutput.split('\n');
    const modelUsage: GeminiModelUsage[] = [];

    for (const line of lines) {
      const cleanLine = stripAnsiCodes(line);
      const match = cleanLine.match(/gemini[\w.-]+\s+(-|\d+)\s+([\d.]+)%\s*\(Resets in ([^)]+)\)/);
      if (match) {
        modelUsage.push({
          model: match[0].match(/gemini[\w.-]+/)![0],
          requests: match[1],
          usage: match[2],
          resets: match[3],
        });
      }
    }

    if (modelUsage.length === 0) {
      const contextMatch = normalizedOutput.match(/(\d+)%\s*context\s*left/i);
      if (contextMatch) {
        const contextPercent = parseInt(contextMatch[1], 10);
        return [{
          model: 'gemini-context',
          requests: '-',
          usage: (100 - contextPercent).toString(),
          resets: 'Unknown',
        }];
      }
      
      throw new Error('Failed to parse usage data from Gemini CLI. Output format may have changed.');
    }

    return modelUsage;
  }
}
