#!/usr/bin/env node

import { checkLimits, type LlmLimitStatus } from './index.js';
import { colors } from './lib/colors.js';

type ProviderName = 'claude' | 'gemini' | 'zai' | 'codex';

function parseToolsFlag(arg: string | undefined): ProviderName[] | null {
  if (!arg) {
    return null;
  }

  const value = arg.replace(/^--tools=/, '');

  const tools = value.split(',').map(t => t.trim().toLowerCase());

  const validTools: ProviderName[] = ['claude', 'gemini', 'zai', 'codex'];
  const invalidTools = tools.filter(t => !validTools.includes(t as ProviderName));

  if (invalidTools.length > 0) {
    throw new Error(`Invalid tool(s): ${invalidTools.join(', ')}. Valid options are: ${validTools.join(', ')}`);
  }

  return tools as ProviderName[];
}

function formatTimestamp(ts: number | undefined): string {
  if (!ts || ts === 0) return 'Unknown';
  const date = new Date(ts);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const mins = date.getMinutes().toString().padStart(2, '0');
  return `${month} ${day} ${hours}:${mins}`;
}

function getColorForUsage(usage: number): (text: string) => string {
  if (usage < 50) return colors.important;
  if (usage < 80) return colors.status;
  if (usage < 97) return colors.yellow;
  return colors.error;
}

function formatStatus(result: LlmLimitStatus): string {
  const usage = get5hWindow(result).usage;
  
  if (result.status === 'error') {
    return colors.error('⚠️  error');
  }
  if (result.status === 'rate_limit_exceed' || usage >= 97) {
    return colors.error('❌ rate limited');
  }
  
  const colorFn = getColorForUsage(usage);
  return colorFn('✅ available');
}

function get5hWindow(result: LlmLimitStatus): { usage: number; reset: string } {
  if (result.windows) {
    const w5h = result.windows.find(w => w.type === '5h');
    if (w5h) {
      return { usage: w5h.usagePercent, reset: formatTimestamp(w5h.resetAt) };
    }
  }
  return { usage: result.usagePercent ?? 0, reset: formatTimestamp(result.resetAt) };
}

function getWeeklyWindow(result: LlmLimitStatus): { usage: number; reset: string } {
  if (result.windows) {
    const weekly = result.windows.find(w => w.type === 'weekly');
    if (weekly) {
      return { usage: weekly.usagePercent, reset: formatTimestamp(weekly.resetAt) };
    }
  }
  return { usage: 0, reset: 'Unknown' };
}

function formatUsage(usage: number): string {
  const colorFn = getColorForUsage(usage);
  return colorFn(`${usage}%`);
}

function visibleWidth(str: string): number {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  let width = 0;
  for (const char of stripped) {
    const code = char.codePointAt(0) ?? 0;
    if (
      code > 0xFFFF ||
      (code >= 0x2600 && code <= 0x27BF) ||
      (code >= 0x1F300 && code <= 0x1F9FF) ||
      (code >= 0x2700 && code <= 0x27BF)
    ) {
      width += 2;
    } else if (code >= 0x1100 && (
      code <= 0x115F ||
      code === 0x2329 || code === 0x232A ||
      (code >= 0x2E80 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7A3) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE10 && code <= 0xFE1F) ||
      (code >= 0xFE30 && code <= 0xFE6F) ||
      (code >= 0xFF00 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6)
    )) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function padRight(str: string, len: number): string {
  const visLen = visibleWidth(str);
  return str + ' '.repeat(Math.max(0, len - visLen));
}

function padLeft(str: string, len: number): string {
  const visLen = visibleWidth(str);
  return ' '.repeat(Math.max(0, len - visLen)) + str;
}

function outputPretty(results: LlmLimitStatus[]): void {
  const colWidths = {
    provider: 10,
    status: 20,
    usage5h: 12,
    usageWeekly: 14,
    reset: 22
  };
  const totalWidth = colWidths.provider + colWidths.status + colWidths.usage5h + colWidths.usageWeekly + colWidths.reset;

  const header = 
    padRight('Provider', colWidths.provider) +
    padRight('Status', colWidths.status) +
    padRight('5h Usage', colWidths.usage5h) +
    padRight('Weekly Usage', colWidths.usageWeekly) +
    padLeft('Resets At', colWidths.reset);
  
  console.log(colors.dim(header));
  console.log(colors.dim('─'.repeat(totalWidth)));

  for (const result of results) {
    const w5h = get5hWindow(result);
    const weekly = getWeeklyWindow(result);
    
    const provider = padRight(colors.projectName(result.provider), colWidths.provider);
    const status = padRight(formatStatus(result), colWidths.status);
    const usage5h = padRight(formatUsage(w5h.usage), colWidths.usage5h);
    const usageWeekly = padRight(weekly.usage > 0 ? formatUsage(weekly.usage) : colors.dim('-'), colWidths.usageWeekly);
    
    let resetDisplay = colors.dim('-');
    if (result.status === 'error') {
      resetDisplay = colors.error(result.errorMessage ?? 'Error');
    } else if (w5h.reset !== 'Unknown') {
      resetDisplay = colors.dim(w5h.reset);
    } else if (weekly.reset !== 'Unknown') {
      resetDisplay = colors.dim(weekly.reset);
    }
    
    console.log(provider + status + usage5h + usageWeekly + padLeft(resetDisplay, colWidths.reset));
    
    if (result.status !== 'error' && weekly.usage > 0 && weekly.reset !== 'Unknown' && weekly.reset !== w5h.reset) {
      const indent = colWidths.provider + colWidths.status + colWidths.usage5h + colWidths.usageWeekly;
      const weeklyLabel = colors.lowkey('Weekly: ');
      const weeklyTs = colors.dim(weekly.reset);
      const tsWidth = visibleWidth(weeklyTs);
      const labelWidth = visibleWidth(weeklyLabel);
      const padding = Math.max(0, colWidths.reset - labelWidth - tsWidth);
      console.log(' '.repeat(indent) + weeklyLabel + ' '.repeat(padding) + weeklyTs);
    }
  }
}

function printError(message: string): void {
  console.error(colors.error(`Error: ${message}`));
}

async function main() {
  try {
    const toolsArg = process.argv.find(arg => arg.startsWith('--tools'));
    const prettyArg = process.argv.includes('--pretty');

    if (!toolsArg) {
      printError('--tools flag is required. Please specify which tools to check.');
      console.error('\nUsage: ai-limit-checker --tools=<tool1,tool2,...> [--pretty]');
      console.error('\nValid tools: claude, gemini, zai, codex');
      console.error('\nExamples:');
      console.error('  ai-limit-checker --tools=codex --pretty');
      console.error('  ai-limit-checker --tools=claude,codex');
      console.error('  ai-limit-checker --tools=claude,gemini,zai,codex --pretty');
      process.exit(1);
    }

    const tools = parseToolsFlag(toolsArg);

    if (!tools || tools.length === 0) {
      throw new Error('At least one tool must be specified');
    }

    const results = await checkLimits(tools);
    
    if (prettyArg) {
      outputPretty(results);
    } else {
      console.log(JSON.stringify(results, null, 2));
    }
  } catch (error) {
    if (error instanceof Error) {
      printError(error.message);
    } else {
      printError('An unknown error occurred');
    }
    process.exit(1);
  }
}

main();
