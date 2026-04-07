import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runShellCommand } from '../src/core/process.js';

describe('process helpers', () => {
  it('requires an explicit cwd', () => {
    expect(() => runShellCommand('node -e "process.exit(0)"')).toThrow(/Command cwd is required/i);
  });

  it('hard-kills a command that ignores SIGTERM after timeout', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ai-operator-process-'));
    const scriptPath = path.join(dir, 'hang.mjs');

    await writeFile(
      scriptPath,
      [
        "process.on('SIGTERM', () => {",
        '  // Ignore termination so the hard-kill path is exercised.',
        '});',
        'setInterval(() => {}, 1_000);',
      ].join('\n'),
      'utf8',
    );

    const startedAt = Date.now();
    const result = await runShellCommand(`node ${JSON.stringify(scriptPath)}`, {
      cwd: dir,
      timeoutMs: 50,
      hardKillDelayMs: 50,
    });
    const elapsed = Date.now() - startedAt;

    expect(result.timedOut).toBe(true);
    expect(result.code).not.toBe(0);
    expect(elapsed).toBeLessThan(1_000);
  });
});
