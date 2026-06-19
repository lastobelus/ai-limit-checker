import { vi } from 'vitest';
import * as fs from 'fs/promises';
import * as childProcess from 'child_process';
export function mockFetch(response, status = 200) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => response,
    });
}
export function mockFileContent(content) {
    vi.spyOn(fs, 'readFile').mockResolvedValue(content);
}
export function mockExec(stdout, stderr = '') {
    vi.spyOn(childProcess, 'exec').mockImplementation((cmd, options, callback) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
            cb(null, stdout, stderr);
        }
        return {};
    });
}
export function mockExecError(error) {
    vi.spyOn(childProcess, 'exec').mockImplementation((cmd, options, callback) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
            cb(error, '', '');
        }
        return {};
    });
}
//# sourceMappingURL=mocks.js.map