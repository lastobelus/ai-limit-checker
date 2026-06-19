#!/usr/bin/env node
import { checkLimits } from './index.js';
import { getRunContext } from './config/index.js';
import { runLogin } from './login.js';
import { colors } from './lib/colors.js';
import { formatPrettyOutput } from './pretty.js';
function parseToolsFlag(arg) {
    if (!arg) {
        return null;
    }
    const value = arg.replace(/^--tools=/, '');
    const tools = value.split(',').map(t => t.trim().toLowerCase());
    const validTools = ['claude', 'gemini', 'zai', 'codex'];
    const invalidTools = tools.filter(t => !validTools.includes(t));
    if (invalidTools.length > 0) {
        throw new Error(`Invalid tool(s): ${invalidTools.join(', ')}. Valid options are: ${validTools.join(', ')}`);
    }
    return tools;
}
function parseLoginProvider(arg) {
    if (!arg) {
        return null;
    }
    const provider = arg.trim().toLowerCase();
    const validProviders = ['claude', 'gemini', 'zai', 'codex'];
    if (!validProviders.includes(provider)) {
        throw new Error(`Invalid provider: ${provider}. Valid options are: ${validProviders.join(', ')}`);
    }
    return provider;
}
function printError(message) {
    console.error(colors.error(`Error: ${message}`));
}
async function main() {
    try {
        const subcommand = process.argv[2];
        if (subcommand === 'login') {
            const provider = parseLoginProvider(process.argv[3]);
            if (!provider) {
                printError('login requires a provider');
                console.error('\nUsage: ai-limit-checker login <provider>');
                console.error('\nValid providers: claude, gemini, zai, codex');
                process.exit(1);
            }
            await runLogin(provider, getRunContext());
            return;
        }
        const toolsArg = process.argv.find(arg => arg.startsWith('--tools'));
        const prettyArg = process.argv.includes('--pretty');
        if (!toolsArg) {
            printError('--tools flag is required. Please specify which tools to check.');
            console.error('\nUsage: ai-limit-checker --tools=<tool1,tool2,...> [--pretty]');
            console.error('       ai-limit-checker login <provider>');
            console.error('\nValid tools: claude, gemini, zai, codex');
            console.error('\nExamples:');
            console.error('  ai-limit-checker --tools=codex --pretty');
            console.error('  ai-limit-checker --tools=claude,codex');
            console.error('  ai-limit-checker --tools=claude,gemini,zai,codex --pretty');
            console.error('  ai-limit-checker login zai');
            process.exit(1);
        }
        const tools = parseToolsFlag(toolsArg);
        if (!tools || tools.length === 0) {
            throw new Error('At least one tool must be specified');
        }
        const results = await checkLimits(tools);
        if (prettyArg) {
            console.log(formatPrettyOutput(results));
        }
        else {
            console.log(JSON.stringify(results, null, 2));
        }
    }
    catch (error) {
        if (error instanceof Error) {
            printError(error.message);
        }
        else {
            printError('An unknown error occurred');
        }
        process.exit(1);
    }
}
main();
//# sourceMappingURL=cli.js.map