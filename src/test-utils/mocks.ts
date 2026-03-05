import { vi } from 'vitest';
import * as fs from 'fs/promises';
import * as childProcess from 'child_process';

export function mockFetch(response: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
  });
}

export function mockFileContent(content: string) {
  vi.spyOn(fs, 'readFile').mockResolvedValue(content);
}

export function mockExec(stdout: string, stderr = '') {
  vi.spyOn(childProcess, 'exec').mockImplementation((cmd, options, callback?) => {
    const cb = typeof options === 'function' ? options : callback;
    if (cb) {
      cb(null, stdout, stderr);
    }
    return {} as childProcess.ChildProcess;
  });
}

export function mockExecError(error: Error) {
  vi.spyOn(childProcess, 'exec').mockImplementation((cmd, options, callback?) => {
    const cb = typeof options === 'function' ? options : callback;
    if (cb) {
      cb(error as childProcess.ExecException, '', '');
    }
    return {} as childProcess.ChildProcess;
  });
}
