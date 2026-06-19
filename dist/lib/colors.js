const RESET = "\x1b[0m";
function wrap(code, text) {
    return `${code}${text}${RESET}`;
}
function rgb(r, g, b) {
    return `\x1b[38;2;${r};${g};${b}m`;
}
const AMBER_GLOW = rgb(255, 162, 28);
const DUSTY_LAVENDER = rgb(126, 107, 143);
const DARK_AMETHYST = rgb(51, 0, 54);
const PACIFIC_CYAN = rgb(24, 143, 167);
const FROZEN_WATER = rgb(203, 247, 237);
const ERROR_RED = rgb(203, 0, 44);
export const colors = {
    amber: (text) => wrap(AMBER_GLOW, text),
    lavender: (text) => wrap(DUSTY_LAVENDER, text),
    amethyst: (text) => wrap(DARK_AMETHYST, text),
    cyan: (text) => wrap(PACIFIC_CYAN, text),
    ice: (text) => wrap(FROZEN_WATER, text),
    error: (text) => wrap(ERROR_RED, text),
    dim: (text) => wrap(DUSTY_LAVENDER, text),
    bold: (text) => wrap("\x1b[1m", text),
    projectName: (text) => wrap(`\x1b[1m${AMBER_GLOW}`, text),
    status: (text) => wrap(PACIFIC_CYAN, text),
    important: (text) => wrap(FROZEN_WATER, text),
    lowkey: (text) => wrap(DUSTY_LAVENDER, text),
    red: (text) => wrap(ERROR_RED, text),
    green: (text) => wrap("\x1b[1;32m", text),
    yellow: (text) => wrap("\x1b[1;33m", text),
    blue: (text) => wrap("\x1b[1;34m", text),
    magenta: (text) => wrap("\x1b[1;35m", text),
};
//# sourceMappingURL=colors.js.map