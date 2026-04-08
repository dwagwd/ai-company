import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PersistentStore } from '../src/core/store.js';
import { OperatorOrchestrator } from '../src/core/orchestrator.js';

async function createHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), 'ai-operator-'));
  const store = new PersistentStore(path.join(dir, 'state.json'));
  const orchestrator = new OperatorOrchestrator(store);
  await orchestrator.init();
  const activeWorkspaceId = orchestrator.snapshot().settings.activeWorkspaceId;
  orchestrator.updateWorkspace(activeWorkspaceId, {
    providerMode: 'scripted',
    providerCommand: '',
    runnerMode: 'simulated',
    runnerCommand: '',
  });
  return { dir, store, orchestrator };
}

describe('operator orchestrator', () => {
  it('completes a scripted workspace task', async () => {
    const { orchestrator, store } = await createHarness();

    orchestrator.updateSettings({
      autoLoop: false,
      paused: false,
      permissions: {
        selfEdit: true,
      },
    });

    orchestrator.createTask({
      title: 'Trim task queue',
      objective: 'Review the queue and record one safe improvement.',
      kind: 'custom',
      priority: 4,
    });

    await orchestrator.runOnce();
    await orchestrator.runOnce();

    const snapshot = store.snapshot();
    expect(snapshot.tasks[0].status).toBe('completed');
    expect(snapshot.tasks[0].review).toBeTruthy();
    expect(snapshot.tasks[0].ownerAgentId).toBe('forge');
    expect(snapshot.tasks[0].departmentId).toBe('production');
    expect(snapshot.logs.length).toBeGreaterThan(0);
  });

  it('halts for manual approval on an orchestrator task when high-risk approval is enabled', async () => {
    const { orchestrator, store } = await createHarness();

    orchestrator.updateSettings({
      autoLoop: false,
      paused: false,
      permissions: {
        selfEdit: true,
      },
      requireHighRiskApproval: true,
    });

    orchestrator.createTask({
      title: 'Refine operator policies',
      objective: 'Update the orchestration core with a small change.',
      scope: 'orchestrator',
      kind: 'custom',
      priority: 5,
    });

    await orchestrator.runOnce();

    let snapshot = store.snapshot();
    const task = snapshot.tasks[0];
    expect(task.status).toBe('waiting-approval');
    expect(task.ownerAgentId).toBe('astra');
    expect(task.departmentId).toBe('command');
    expect(snapshot.approvals[0].decision).toBe('pending');

    await orchestrator.approveTask(task.id, task.pendingApprovalId);

    snapshot = store.snapshot();
    expect(snapshot.tasks[0].status).toBe('completed');
    expect(snapshot.approvals[0].decision).toBe('approved');
  });

  it('seeds the neutral default workspace template without borrowing a repo path', async () => {
    const { orchestrator, store } = await createHarness();

    const snapshot = orchestrator.seedWorkspaceTask();
    const firstTask = snapshot.tasks[0];
    const firstWorkspace = snapshot.workspaces[0];
    const firstTemplate = snapshot.taskTemplates[0];

    expect(snapshot.settings.activeWorkspaceId).toBe(firstWorkspace.id);
    expect(firstWorkspace.name).toBe('Workspace 1');
    expect(firstWorkspace.path).toBe('');
    expect(firstWorkspace.leadAgentId).toBe('astra');
    expect(firstTemplate.workspacePath).toBe('');
    expect(firstTemplate.title).toBe('Bootstrap the workspace');
    expect(firstTemplate.ownerAgentId).toBe('astra');
    expect(firstTemplate.departmentId).toBe('command');
    expect(firstTemplate.providerMode).toBe('scripted');
    expect(firstTemplate.providerCommand).toBe('');
    expect(firstTemplate.runnerMode).toBe('simulated');
    expect(firstTemplate.runnerCommand).toBe('');
    expect(firstTask.title).toBe(firstTemplate.title);
    expect(firstTask.ownerAgentId).toBe('astra');
    expect(firstTask.departmentId).toBe('command');
    expect(firstTask.providerMode).toBe('scripted');
    expect(firstTask.providerCommand).toBe('');
    expect(firstTask.runnerMode).toBe('simulated');
    expect(firstTask.runnerCommand).toBe('');
    expect(firstTask.workspacePath).toBe('');
    expect(firstTask.sourceTaskId).toBe(firstTemplate.id);
    expect(store.snapshot().tasks[0].status).toBe('queued');
  });

  it('creates a new workspace without copying the active workspace path', async () => {
    const { orchestrator, store } = await createHarness();
    const activeWorkspaceId = orchestrator.snapshot().settings.activeWorkspaceId;

    orchestrator.updateWorkspace(activeWorkspaceId, {
      path: '/tmp/selected-project',
    });

    const snapshot = orchestrator.createWorkspace({
      name: 'Scratch Workspace',
    });

    const created = snapshot.workspaces.find((entry) => entry.name === 'Scratch Workspace');

    expect(created).toBeTruthy();
    if (!created) {
      throw new Error('Scratch Workspace was not created');
    }
    expect(created.path).toBe('');
    expect(snapshot.settings.activeWorkspaceId).toBe(created.id);
    expect(snapshot.settings.workspacePath).toBe('');
    expect(store.snapshot().workspaces.find((entry) => entry.id === created.id).path).toBe('');
  });

  it('fails a task instead of silently falling back when the provider command is missing', async () => {
    const { orchestrator, store, dir } = await createHarness();
    const activeWorkspaceId = orchestrator.snapshot().settings.activeWorkspaceId;

    orchestrator.updateWorkspace(activeWorkspaceId, {
      path: path.join(dir, 'command-workspace'),
      providerMode: 'command',
      providerCommand: '',
      runnerMode: 'simulated',
      runnerCommand: '',
    });

    orchestrator.createTask({
      title: 'Missing provider command',
      objective: 'The task should fail cleanly when command mode is misconfigured.',
      kind: 'custom',
      priority: 4,
    });

    await orchestrator.runOnce();

    const task = store.snapshot().tasks[0];
    expect(task.status).toBe('failed');
    expect(task.blockedReason).toMatch(/Provider command is required/i);
  });

  it('fails a task instead of silently falling back when the shell runner command is missing', async () => {
    const { orchestrator, store, dir } = await createHarness();
    const activeWorkspaceId = orchestrator.snapshot().settings.activeWorkspaceId;

    orchestrator.updateWorkspace(activeWorkspaceId, {
      path: path.join(dir, 'shell-workspace'),
      providerMode: 'scripted',
      providerCommand: '',
      runnerMode: 'shell',
      runnerCommand: '',
    });

    orchestrator.createTask({
      title: 'Missing runner command',
      objective: 'The task should fail cleanly when shell mode is misconfigured.',
      kind: 'custom',
      priority: 4,
    });

    await orchestrator.runOnce();

    const task = store.snapshot().tasks[0];
    expect(task.status).toBe('failed');
    expect(task.blockedReason).toMatch(/Runner command is required/i);
  });

  it('creates a second workspace and lets the template drive the seeded task', async () => {
    const { orchestrator, store } = await createHarness();

    const created = orchestrator.createWorkspace({
      name: 'Docs Workspace',
      path: '/tmp/docs-workspace',
      providerMode: 'command',
      providerCommand: 'node ./scripts/codex-provider.mjs',
      providerTimeoutMs: 90_000,
      runnerMode: 'shell',
      runnerCommand: 'pnpm test',
      runnerTimeoutMs: 90_000,
    });

    expect(created.settings.activeWorkspaceId).not.toBeNull();
    expect(created.settings.workspacePath).toBe('/tmp/docs-workspace');

    const workspace = created.workspaces.find((entry) => entry.id === created.settings.activeWorkspaceId);
    if (!workspace) {
      throw new Error('Expected the new workspace to be active');
    }
    const template = created.taskTemplates.find((entry) => entry.workspaceId === workspace.id);
    if (!template) {
      throw new Error('Expected a template for the new workspace');
    }

    orchestrator.updateWorkspaceTemplate(template.id, {
      title: 'Docs bootstrap',
      objective: 'Use the Codex app wrapper against the docs workspace and verify the path.',
      ownerAgentId: 'mira',
      departmentId: 'planning',
      runnerCommand: 'pnpm test docs',
      providerTimeoutMs: 45_000,
    });

    const snapshot = orchestrator.seedWorkspaceTask();
    const seededTask = snapshot.tasks[0];
    const seededTemplate = snapshot.taskTemplates.find((entry) => entry.workspaceId === snapshot.settings.activeWorkspaceId);

    expect(seededTemplate.title).toBe('Docs bootstrap');
    expect(seededTask.title).toBe('Docs bootstrap');
    expect(seededTask.objective).toContain('docs workspace');
    expect(seededTask.ownerAgentId).toBe('mira');
    expect(seededTask.departmentId).toBe('planning');
    expect(seededTask.runnerCommand).toBe('pnpm test docs');
    expect(seededTask.providerTimeoutMs).toBe(45_000);
    expect(snapshot.settings.workspacePath).toBe('/tmp/docs-workspace');
    expect(store.snapshot().tasks[0].sourceTaskId).toBe(seededTemplate.id);
  });
});
