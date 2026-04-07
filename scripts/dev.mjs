import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binDir = path.join(rootDir, 'node_modules', '.bin');

function binPath(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(binDir, `${name}${suffix}`);
}

function spawnBinary(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal || (typeof code === 'number' && code !== 0)) {
      process.exitCode = code ?? 1;
      shutdown();
    }
  });

  return child;
}

function waitForServer(url, timeoutMs = 45_000) {
  const started = Date.now();
  return (async () => {
    while (Date.now() - started < timeoutMs) {
      try {
        const response = await fetch(url, { method: 'GET' });
        if (response.ok) return;
      } catch {
        // keep waiting
      }
      await delay(250);
    }
    throw new Error(`Timed out waiting for ${url}`);
  })();
}

let viteProcess;
let electronProcess;

function shutdown() {
  for (const child of [electronProcess, viteProcess]) {
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(process.exitCode ?? 0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

viteProcess = spawnBinary(binPath('vite'), ['--host', '127.0.0.1', '--port', '5173', '--strictPort']);

await waitForServer('http://127.0.0.1:5173');

electronProcess = spawnBinary(binPath('electron'), ['.'], {
  VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
});
