import { spawn } from 'node:child_process';
import type { RunContext } from './config/index.js';

export type ProviderName = 'claude' | 'gemini' | 'zai' | 'codex';

const ZAI_LOGIN_URL = 'https://z.ai/manage-apikey/subscription';

export function getLoginCommand(provider: ProviderName): string {
  switch (provider) {
    case 'claude':
      return 'ai-limit-checker login claude';
    case 'codex':
      return 'ai-limit-checker login codex';
    case 'zai':
      return 'ai-limit-checker login zai';
    case 'gemini':
      return 'Configure Gemini authentication separately; ai-limit-checker does not automate Gemini login';
  }
}

function spawnInteractive(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function runZaiLogin(context: RunContext): Promise<void> {
  console.error(
    [
      'Opened Chrome with the ai-limit-checker z.ai profile.',
      'Log in to z.ai, open the Usage tab once, then close the browser window.',
    ].join(' ')
  );

  if (process.platform === 'darwin') {
    await spawnInteractive('open', [
      '-W',
      '-n',
      '-a',
      'Google Chrome',
      '--args',
      `--user-data-dir=${context.zai.userDataDir}`,
      '--new-window',
      ZAI_LOGIN_URL,
    ]);
    return;
  }

  await spawnInteractive('google-chrome', [
    `--user-data-dir=${context.zai.userDataDir}`,
    '--new-window',
    ZAI_LOGIN_URL,
  ]);
}

export async function runLogin(provider: ProviderName, context: RunContext): Promise<void> {
  switch (provider) {
    case 'claude':
      await spawnInteractive('claude', ['/login']);
      return;
    case 'codex':
      await spawnInteractive('codex', ['login']);
      return;
    case 'zai':
      await runZaiLogin(context);
      return;
    case 'gemini':
      throw new Error('Gemini login is not automated. Configure Gemini authentication outside ai-limit-checker.');
  }
}
