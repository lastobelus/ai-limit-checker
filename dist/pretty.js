import { colors } from './lib/colors.js';
function formatTimestamp(ts) {
    if (!ts || ts === 0)
        return 'Unknown';
    const date = new Date(ts);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day} ${hours}:${mins}`;
}
function getColorForUsage(usage) {
    if (usage < 50)
        return colors.important;
    if (usage < 80)
        return colors.status;
    if (usage < 97)
        return colors.yellow;
    return colors.error;
}
function get5hWindow(result) {
    if (result.windows) {
        const w5h = result.windows.find(w => w.type === '5h');
        if (w5h) {
            return { usage: w5h.usagePercent, reset: formatTimestamp(w5h.resetAt) };
        }
        return { usage: undefined, reset: 'Unknown' };
    }
    return { usage: result.usagePercent, reset: formatTimestamp(result.resetAt) };
}
function getWeeklyWindow(result) {
    if (result.windows) {
        const weekly = result.windows.find(w => w.type === 'weekly');
        if (weekly) {
            return { usage: weekly.usagePercent, reset: formatTimestamp(weekly.resetAt) };
        }
    }
    return { usage: undefined, reset: 'Unknown' };
}
function formatStatus(result) {
    const usage = get5hWindow(result).usage ?? 0;
    if (result.status === 'error') {
        return colors.error('⚠️  error');
    }
    if (result.status === 'rate_limit_exceed' || usage >= 97) {
        return colors.error('❌ rate limited');
    }
    const colorFn = getColorForUsage(usage);
    return colorFn('✅ available');
}
function formatUsage(usage) {
    const colorFn = getColorForUsage(usage);
    return colorFn(`${usage}%`);
}
function visibleWidth(str) {
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    let width = 0;
    for (const char of stripped) {
        const code = char.codePointAt(0) ?? 0;
        if (code > 0xFFFF ||
            (code >= 0x2600 && code <= 0x27BF) ||
            (code >= 0x1F300 && code <= 0x1F9FF) ||
            (code >= 0x2700 && code <= 0x27BF)) {
            width += 2;
        }
        else if (code >= 0x1100 && (code <= 0x115F ||
            code === 0x2329 || code === 0x232A ||
            (code >= 0x2E80 && code <= 0xA4CF) ||
            (code >= 0xAC00 && code <= 0xD7A3) ||
            (code >= 0xF900 && code <= 0xFAFF) ||
            (code >= 0xFE10 && code <= 0xFE1F) ||
            (code >= 0xFE30 && code <= 0xFE6F) ||
            (code >= 0xFF00 && code <= 0xFF60) ||
            (code >= 0xFFE0 && code <= 0xFFE6))) {
            width += 2;
        }
        else {
            width += 1;
        }
    }
    return width;
}
function padRight(str, len) {
    const visLen = visibleWidth(str);
    return str + ' '.repeat(Math.max(0, len - visLen));
}
function padLeft(str, len) {
    const visLen = visibleWidth(str);
    return ' '.repeat(Math.max(0, len - visLen)) + str;
}
function formatDebounceDuration(ms) {
    if (ms <= 0) {
        return 'off';
    }
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (hours > 0) {
        return `${hours}h`;
    }
    if (minutes > 0 && seconds > 0) {
        return `${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
        return `${minutes}m`;
    }
    return `${seconds}s`;
}
function formatClaudeDebounceHeader(results) {
    const claude = results.find(result => result.provider === 'claude');
    if (!claude?.debounce) {
        return null;
    }
    const duration = formatDebounceDuration(claude.debounce.waitMs);
    const suffix = claude.debounce.waitMs > 0 && claude.debounce.source === 'cache'
        ? ' (cached)'
        : '';
    return colors.dim(`Claude debounce: ${duration}${suffix}`);
}
export function formatPrettyOutput(results) {
    const lines = [];
    const debounceHeader = formatClaudeDebounceHeader(results);
    if (debounceHeader) {
        lines.push(debounceHeader);
    }
    const colWidths = {
        provider: 10,
        status: 20,
        usage5h: 12,
        usageWeekly: 14,
        reset: 22,
    };
    const totalWidth = colWidths.provider + colWidths.status + colWidths.usage5h + colWidths.usageWeekly + colWidths.reset;
    const header = padRight('Provider', colWidths.provider) +
        padRight('Status', colWidths.status) +
        padRight('5h Usage', colWidths.usage5h) +
        padRight('Weekly Usage', colWidths.usageWeekly) +
        padLeft('Resets At', colWidths.reset);
    lines.push(colors.dim(header));
    lines.push(colors.dim('─'.repeat(totalWidth)));
    for (const result of results) {
        const w5h = get5hWindow(result);
        const weekly = getWeeklyWindow(result);
        const provider = padRight(colors.projectName(result.provider), colWidths.provider);
        const status = padRight(formatStatus(result), colWidths.status);
        const usage5h = padRight(w5h.usage === undefined ? colors.dim('-') : formatUsage(w5h.usage), colWidths.usage5h);
        const usageWeekly = padRight(weekly.usage === undefined ? colors.dim('-') : formatUsage(weekly.usage), colWidths.usageWeekly);
        let resetDisplay = colors.dim('-');
        if (result.status === 'error') {
            resetDisplay = colors.error(result.errorMessage ?? 'Error');
        }
        else if (w5h.reset !== 'Unknown') {
            resetDisplay = colors.dim(w5h.reset);
        }
        else if (weekly.reset !== 'Unknown') {
            resetDisplay = colors.dim(weekly.reset);
        }
        lines.push(provider + status + usage5h + usageWeekly + padLeft(resetDisplay, colWidths.reset));
        if (result.status !== 'error' && weekly.usage !== undefined && weekly.reset !== 'Unknown' && weekly.reset !== w5h.reset) {
            const indent = colWidths.provider + colWidths.status + colWidths.usage5h + colWidths.usageWeekly;
            const weeklyLabel = colors.lowkey('Weekly: ');
            const weeklyTs = colors.dim(weekly.reset);
            const tsWidth = visibleWidth(weeklyTs);
            const labelWidth = visibleWidth(weeklyLabel);
            const padding = Math.max(0, colWidths.reset - labelWidth - tsWidth);
            lines.push(' '.repeat(indent) + weeklyLabel + ' '.repeat(padding) + weeklyTs);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=pretty.js.map