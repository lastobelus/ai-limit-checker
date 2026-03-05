const RESET = "\x1b[0m";

function wrap(code: string, text: string): string {
  return `${code}${text}${RESET}`;
}

function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

const AMBER_GLOW = rgb(255, 162, 28);
const DUSTY_LAVENDER = rgb(126, 107, 143);
const DARK_AMETHYST = rgb(51, 0, 54);
const PACIFIC_CYAN = rgb(24, 143, 167);
const FROZEN_WATER = rgb(203, 247, 237);
const ERROR_RED = rgb(203, 0, 44);

export const colors = {
  amber: (text: string): string => wrap(AMBER_GLOW, text),
  lavender: (text: string): string => wrap(DUSTY_LAVENDER, text),
  amethyst: (text: string): string => wrap(DARK_AMETHYST, text),
  cyan: (text: string): string => wrap(PACIFIC_CYAN, text),
  ice: (text: string): string => wrap(FROZEN_WATER, text),
  error: (text: string): string => wrap(ERROR_RED, text),
  dim: (text: string): string => wrap(DUSTY_LAVENDER, text),
  bold: (text: string): string => wrap("\x1b[1m", text),
  projectName: (text: string): string => wrap(`\x1b[1m${AMBER_GLOW}`, text),
  status: (text: string): string => wrap(PACIFIC_CYAN, text),
  important: (text: string): string => wrap(FROZEN_WATER, text),
  lowkey: (text: string): string => wrap(DUSTY_LAVENDER, text),
  red: (text: string): string => wrap(ERROR_RED, text),
  green: (text: string): string => wrap("\x1b[1;32m", text),
  yellow: (text: string): string => wrap("\x1b[1;33m", text),
  blue: (text: string): string => wrap("\x1b[1;34m", text),
  magenta: (text: string): string => wrap("\x1b[1;35m", text),
};
