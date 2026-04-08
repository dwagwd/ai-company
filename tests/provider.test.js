import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProvider } from '../src/core/provider.js';
import { createRunner } from '../src/core/runner.js';

describe('command provider', () => {
  it('unwraps codex-style envelopes for plan and review responses', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ai-operator-provider-'));
    const scriptPath = path.join(dir, 'provider.mjs');

    await writeFile(
      scriptPath,
      [
        "const kind = process.env.AI_OPERATOR_KIND;",
        "if (kind === 'plan') {",
        "  process.stdout.write(JSON.stringify({",
        "    provider: 'codex',",
        "    kind,",
        "    ok: true,",
        "    result: {",
        "      summary: 'Plan from codex',",
        "      workerPrompt: 'Worker prompt',",
        "      reviewPrompt: 'Reviewer prompt',",
        "      steps: [",
        "        { title: 'Inspect workspace', role: 'worker', kind: 'analysis', permission: 'read', note: 'Review the workspace' },",
        "        { title: 'Make change', role: 'worker', kind: 'execute', permission: 'write', note: 'Implement one fix' },",
        "        { title: 'Review result', role: 'reviewer', kind: 'review', permission: 'read', note: 'Verify the output' }",
        '      ]',
        '    }',
        '  }));',
        '} else {',
        "  process.stdout.write(JSON.stringify({",
        "    provider: 'codex',",
        "    kind,",
        "    ok: true,",
        "    result: {",
        '      approved: true,',
        '      needsFollowUp: false,',
        "      notes: 'Looks good',",
        "      followUpTitle: '',",
        "      followUpObjective: ''",
        '    }',
        '  }));',
        '}',
      ].join('\n'),
    );

    const provider = createProvider({
      providerMode: 'command',
      providerCommand: `node ${JSON.stringify(scriptPath)}`,
      workspacePath: dir,
    });

    const plan = await provider.plan({
      task: {
        title: 'Task',
        objective: 'Objective',
        scope: 'workspace',
        kind: 'custom',
        priority: 3,
      },
      memory: [],
    });

    expect(plan.summary).toBe('Plan from codex');
    expect(plan.steps).toHaveLength(3);

    const review = await provider.review({
      task: {
        title: 'Task',
        objective: 'Objective',
      },
      results: [],
      memory: [],
    });

    expect(review.approved).toBe(true);
    expect(review.notes).toBe('Looks good');
  });

  it('rejects codex fallback envelopes instead of treating them as success', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ai-operator-provider-'));
    const scriptPath = path.join(dir, 'fallback-provider.mjs');

    await writeFile(
      scriptPath,
      [
        "const kind = process.env.AI_OPERATOR_KIND;",
        "process.stdout.write(JSON.stringify({",
        "  provider: 'codex',",
        '  kind,',
        '  ok: false,',
        '  fallback: true,',
        "  reason: 'Codex binary not found',",
        '  result: {',
        "    summary: 'Fallback plan',",
        "    workerPrompt: 'Worker prompt',",
        "    reviewPrompt: 'Reviewer prompt',",
        "    steps: [",
        "      { title: 'Inspect workspace', role: 'worker', kind: 'analysis', permission: 'read', note: 'Review the workspace' },",
        "      { title: 'Make change', role: 'worker', kind: 'execute', permission: 'write', note: 'Implement one fix' },",
        "      { title: 'Review result', role: 'reviewer', kind: 'review', permission: 'read', note: 'Verify the output' }",
        '    ]',
        '  }',
        '}));',
      ].join('\n'),
    );

    const provider = createProvider({
      providerMode: 'command',
      providerCommand: `node ${JSON.stringify(scriptPath)}`,
      workspacePath: dir,
    });

    await expect(provider.plan({
      task: {
        title: 'Task',
        objective: 'Objective',
        scope: 'workspace',
        kind: 'custom',
        priority: 3,
      },
      memory: [],
    })).rejects.toThrow(/fallback response/i);
  });

  it('requires a command when command mode is selected', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ai-operator-provider-'));
    const provider = createProvider({
      providerMode: 'command',
      providerCommand: '',
      workspacePath: dir,
    });

    await expect(provider.plan({
      task: {
        title: 'Task',
        objective: 'Objective',
        scope: 'workspace',
        kind: 'custom',
        priority: 3,
      },
      memory: [],
    })).rejects.toThrow(/Provider command is required/i);
  });

  it('requires a shell command when shell mode has no command to run', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ai-operator-runner-'));
    const runner = createRunner({
      runnerMode: 'shell',
      runnerCommand: '',
      workspacePath: dir,
    });

    await expect(runner.run({
      title: 'Step',
      kind: 'execute',
      role: 'worker',
      permission: 'write',
      command: '',
      note: '',
    })).rejects.toThrow(/Runner command is required/i);
  });
});
