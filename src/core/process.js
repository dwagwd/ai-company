import { spawn } from 'node:child_process';

export function defaultShell() {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

function shellArgs(command) {
  if (process.platform === 'win32') {
    return ['/d', '/s', '/c', command];
  }
  return ['-lc', command];
}

function toStreamText(chunk) {
  return typeof chunk === 'string' ? chunk : chunk.toString('utf8');
}

function terminateChild(child, signal) {
  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

export function runShellCommand(command, options = {}) {
  const {
    cwd,
    env = {},
    timeoutMs = 0,
    hardKillDelayMs = 2_000,
    shell = defaultShell(),
    input = '',
    onStdout,
    onStderr,
  } = options;

  const resolvedCwd = String(cwd ?? '').trim();
  if (!resolvedCwd) {
    throw new Error('Command cwd is required');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(shell, shellArgs(command), {
      cwd: resolvedCwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let closed = false;
    let timeoutTimer = null;
    let hardKillTimer = null;

    const clearTimers = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (hardKillTimer) {
        clearTimeout(hardKillTimer);
        hardKillTimer = null;
      }
    };

    timeoutTimer = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          terminateChild(child, 'SIGTERM');
          hardKillTimer = setTimeout(() => {
            if (!closed) {
              terminateChild(child, 'SIGKILL');
            }
          }, hardKillDelayMs);
        }, timeoutMs)
      : null;

    child.stdout.on('data', (chunk) => {
      const text = toStreamText(chunk);
      stdout += text;
      onStdout?.(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = toStreamText(chunk);
      stderr += text;
      onStderr?.(text);
    });

    child.on('error', (error) => {
      clearTimers();
      reject(error);
    });

    child.on('close', (code, signal) => {
      closed = true;
      clearTimers();
      resolve({
        code: timedOut
          ? 124
          : typeof code === 'number'
            ? code
            : signal
              ? 1
              : 0,
        signal,
        stdout,
        stderr,
        timedOut,
      });
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

export function tryParseJson(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
