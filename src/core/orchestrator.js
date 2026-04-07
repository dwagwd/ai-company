import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import {
  createApprovalRecord,
  createLogEntry,
  createMemoryEntry,
  createWorkspaceRecord,
  createWorkspaceTemplateRecord,
  createTaskRecord,
  nowIso,
  normalizeStep,
  normalizeTaskTemplate,
  normalizeWorkspace,
} from './defaultState.js';
import { evaluatePermission, inferRequiredAction } from './policy.js';
import { createProvider, ScriptedProvider } from './provider.js';
import { createRunner, SimulatedRunner } from './runner.js';

const DEFAULT_TICK_MS = 5_000;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isRunnableTask(task) {
  return task && task.status === 'queued';
}

function orderTasks(tasks = []) {
  return [...tasks].sort((a, b) => {
    const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  });
}

function stepStatusFromKind(kind = '') {
  const normalized = String(kind).toLowerCase();
  if (normalized.includes('test')) return 'testing';
  if (normalized.includes('review')) return 'reviewing';
  if (normalized.includes('plan') || normalized.includes('analysis')) return 'planning';
  return 'executing';
}

function limitCollection(collection = [], max = 200) {
  return collection.length > max ? collection.slice(0, max) : collection;
}

function stepTitle(step = {}) {
  return step.title || step.kind || 'Step';
}

function findApprovedStep(task, index, action) {
  const approvedSteps = Array.isArray(task?.approvedSteps) ? task.approvedSteps : [];
  return approvedSteps.findIndex((entry) => entry.stepIndex === index && entry.action === action);
}

function createLogMessage(source, taskId, message, level = 'info', stepId = null) {
  return createLogEntry({
    taskId,
    stepId,
    source,
    level,
    message,
  });
}

function syncActiveWorkspaceSettings(draft, workspace) {
  if (!workspace) return;

  draft.settings = {
    ...draft.settings,
    activeWorkspaceId: workspace.id,
    workspacePath: workspace.path,
    providerMode: workspace.providerMode,
    providerCommand: workspace.providerCommand,
    providerTimeoutMs: workspace.providerTimeoutMs,
    runnerMode: workspace.runnerMode,
    runnerCommand: workspace.runnerCommand,
    runnerTimeoutMs: workspace.runnerTimeoutMs,
  };
}

function findWorkspace(draft, workspaceId) {
  return Array.isArray(draft.workspaces)
    ? draft.workspaces.find((workspace) => workspace.id === workspaceId) ?? null
    : null;
}

function findTemplateByWorkspace(draft, workspaceId) {
  return Array.isArray(draft.taskTemplates)
    ? draft.taskTemplates.find((template) => template.workspaceId === workspaceId) ?? null
    : null;
}

function deriveWorkspaceName(workspacePath = '') {
  const candidate = basename(String(workspacePath ?? '').replace(/[\\/]+$/, ''));
  if (!candidate || candidate === '.' || candidate === '/' || candidate === '\\') {
    return 'Workspace';
  }
  return candidate;
}

export class OperatorOrchestrator extends EventEmitter {
  constructor(store, options = {}) {
    super();
    this.store = store;
    this.options = options;
    this.tickTimer = null;
    this.busy = false;

    this.store.on('change', (snapshot, meta) => {
      this.emit('change', snapshot, meta);
    });
  }

  async init() {
    await this.store.init();
    return this.snapshot();
  }

  snapshot() {
    return this.store.snapshot();
  }

  async start() {
    if (!this.tickTimer) {
      this.tickTimer = setInterval(() => {
        void this.runOnce();
      }, DEFAULT_TICK_MS);
    }

    void this.runOnce();
    return this.snapshot();
  }

  async stop() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    await this.store.flush();
  }

  updateSettings(patch = {}) {
    const next = this.store.update((draft) => {
      draft.settings = {
        ...draft.settings,
        ...clone(patch),
        permissions: {
          ...draft.settings.permissions,
          ...(patch.permissions ?? {}),
        },
      };
      return draft;
    }, { type: 'settings-updated' });

    return next;
  }

  setLocale(locale) {
    return this.updateSettings({ locale });
  }

  setWorkspacePath(workspacePath) {
    const snapshot = this.snapshot();
    const activeWorkspaceId = snapshot.settings.activeWorkspaceId;
    if (!activeWorkspaceId) {
      return this.updateSettings({ workspacePath });
    }

    return this.updateWorkspace(activeWorkspaceId, { path: workspacePath });
  }

  pause() {
    return this.updateSettings({ paused: true });
  }

  resume() {
    return this.updateSettings({ paused: false });
  }

  toggleAutoLoop() {
    const snapshot = this.snapshot();
    return this.updateSettings({ autoLoop: !snapshot.settings.autoLoop });
  }

  createWorkspace(input = {}) {
    const snapshot = this.snapshot();
    const providedPath = typeof input.path === 'string' ? input.path.trim() : '';
    const existing = providedPath
      ? snapshot.workspaces.find((workspace) => workspace.path === providedPath) ?? null
      : null;

    if (existing) {
      return this.setActiveWorkspace(existing.id);
    }

    const workspaceName = input.name || (providedPath ? deriveWorkspaceName(providedPath) : `Workspace ${snapshot.workspaces.length + 1}`);
    const workspace = createWorkspaceRecord({
      ...clone(input),
      path: providedPath,
      name: workspaceName,
    }, snapshot.settings);
    const template = createWorkspaceTemplateRecord(workspace, input.template ?? {});

    return this.store.update((draft) => {
      draft.workspaces = [
        workspace,
        ...draft.workspaces.filter((entry) => entry.id !== workspace.id),
      ];
      draft.taskTemplates = [
        template,
        ...draft.taskTemplates.filter((entry) => entry.workspaceId !== workspace.id),
      ];
      syncActiveWorkspaceSettings(draft, workspace);
      draft.logs.unshift(
        createLogMessage('ui', workspace.id, `Created workspace: ${workspace.name}`, 'info'),
      );
      draft.logs = limitCollection(draft.logs, 500);
      return draft;
    }, { type: 'workspace-created', workspaceId: workspace.id, templateId: template.id });
  }

  updateWorkspace(workspaceId, patch = {}) {
    return this.store.update((draft) => {
      const workspace = findWorkspace(draft, workspaceId);
      if (!workspace) return draft;

      const nextWorkspace = normalizeWorkspace({
        ...workspace,
        ...clone(patch),
        id: workspace.id,
        createdAt: workspace.createdAt,
        updatedAt: nowIso(),
      });

      Object.assign(workspace, nextWorkspace);

      const template = findTemplateByWorkspace(draft, workspace.id);
      if (template) {
        template.workspacePath = workspace.path;
        template.updatedAt = nowIso();
      }

      if (draft.settings.activeWorkspaceId === workspace.id) {
        syncActiveWorkspaceSettings(draft, workspace);
      }
      return draft;
    }, { type: 'workspace-updated', workspaceId });
  }

  setActiveWorkspace(workspaceId) {
    return this.store.update((draft) => {
      const workspace = findWorkspace(draft, workspaceId);
      if (!workspace) return draft;

      syncActiveWorkspaceSettings(draft, workspace);
      draft.logs.unshift(
        createLogMessage('ui', workspace.id, `Activated workspace: ${workspace.name}`, 'info'),
      );
      draft.logs = limitCollection(draft.logs, 500);
      return draft;
    }, { type: 'workspace-activated', workspaceId });
  }

  updateWorkspaceTemplate(templateId, patch = {}) {
    return this.store.update((draft) => {
      const templateIndex = Array.isArray(draft.taskTemplates)
        ? draft.taskTemplates.findIndex((entry) => entry.id === templateId)
        : -1;
      if (templateIndex < 0) return draft;

      const template = draft.taskTemplates[templateIndex];
      const nextTemplate = normalizeTaskTemplate({
        ...template,
        ...clone(patch),
        id: template.id,
        workspaceId: template.workspaceId,
        workspacePath: template.workspacePath,
        createdAt: template.createdAt,
        updatedAt: nowIso(),
      });

      Object.assign(template, nextTemplate);
      const workspace = findWorkspace(draft, template.workspaceId);
      if (workspace) {
        template.workspacePath = workspace.path;
      }
      return draft;
    }, { type: 'workspace-template-updated', templateId });
  }

  createTask(input = {}) {
    const snapshot = this.snapshot();
    const task = createTaskRecord(input, snapshot.settings, '');

    return this.store.update((draft) => {
      draft.tasks.unshift(task);
      draft.logs.unshift(
        createLogMessage('orchestrator', task.id, `Queued task: ${task.title}`, 'info'),
      );
      draft.logs = limitCollection(draft.logs, 500);
      return draft;
    }, { type: 'task-created', taskId: task.id });
  }

  seedDemoTasks() {
    const existing = this.snapshot().tasks.length;
    if (existing > 0) {
      return this.snapshot();
    }

    this.createTask({
      title: 'Stabilize the operator loop',
      objective: 'Review recent runs, summarize blockers, and propose one safe improvement.',
      kind: 'maintenance',
      priority: 5,
      autoGenerated: true,
    });

    this.createTask({
      title: 'Workspace onboarding',
      objective: 'Inspect the current workspace and capture the next implementation step.',
      kind: 'analysis',
      priority: 3,
      autoGenerated: true,
    });

    return this.snapshot();
  }

  seedWorkspaceTask(templateId = null) {
    const snapshot = this.snapshot();
    const templates = Array.isArray(snapshot.taskTemplates) ? snapshot.taskTemplates : [];
    const activeWorkspace = Array.isArray(snapshot.workspaces)
      ? snapshot.workspaces.find((entry) => entry.id === snapshot.settings.activeWorkspaceId) ?? snapshot.workspaces[0] ?? null
      : null;
    const template = templateId
      ? templates.find((entry) => entry.id === templateId) ?? null
      : templates.find((entry) => entry.workspaceId === activeWorkspace?.id) ?? templates[0] ?? null;

    if (!template) {
      return snapshot;
    }

    const workspace = Array.isArray(snapshot.workspaces)
      ? snapshot.workspaces.find((entry) => entry.id === template.workspaceId) ?? activeWorkspace ?? snapshot.workspaces[0] ?? null
      : null;

    if (workspace && workspace.id !== snapshot.settings.activeWorkspaceId) {
      this.setActiveWorkspace(workspace.id);
    }

    const refreshedSnapshot = this.snapshot();
    const refreshedTemplate = templateId
      ? refreshedSnapshot.taskTemplates.find((entry) => entry.id === templateId) ?? template
      : refreshedSnapshot.taskTemplates.find((entry) => entry.workspaceId === workspace?.id) ?? template;

    const refreshedWorkspace = Array.isArray(refreshedSnapshot.workspaces)
      ? refreshedSnapshot.workspaces.find((entry) => entry.id === refreshedTemplate.workspaceId)
        ?? refreshedSnapshot.workspaces.find((entry) => entry.id === refreshedSnapshot.settings.activeWorkspaceId)
        ?? refreshedSnapshot.workspaces[0]
        ?? null
      : null;

    const workspacePath = refreshedWorkspace?.path
      ?? refreshedTemplate.workspacePath
      ?? refreshedSnapshot.settings.workspacePath
      ?? '';

    const taskSettings = {
      ...refreshedSnapshot.settings,
      workspacePath,
      providerMode: refreshedTemplate.providerMode ?? refreshedWorkspace?.providerMode ?? refreshedSnapshot.settings.providerMode,
      providerCommand: refreshedTemplate.providerCommand ?? refreshedWorkspace?.providerCommand ?? refreshedSnapshot.settings.providerCommand,
      providerTimeoutMs: refreshedTemplate.providerTimeoutMs ?? refreshedWorkspace?.providerTimeoutMs ?? refreshedSnapshot.settings.providerTimeoutMs,
      runnerMode: refreshedTemplate.runnerMode ?? refreshedWorkspace?.runnerMode ?? refreshedSnapshot.settings.runnerMode,
      runnerCommand: refreshedTemplate.runnerCommand ?? refreshedWorkspace?.runnerCommand ?? refreshedSnapshot.settings.runnerCommand,
      runnerTimeoutMs: refreshedTemplate.runnerTimeoutMs ?? refreshedWorkspace?.runnerTimeoutMs ?? refreshedSnapshot.settings.runnerTimeoutMs,
    };

    const task = createTaskRecord({
      title: refreshedTemplate.title,
      objective: refreshedTemplate.objective,
      scope: refreshedTemplate.scope,
      kind: refreshedTemplate.kind,
      priority: refreshedTemplate.priority,
      providerMode: taskSettings.providerMode,
      providerCommand: taskSettings.providerCommand,
      providerTimeoutMs: taskSettings.providerTimeoutMs,
      runnerMode: taskSettings.runnerMode,
      runnerCommand: taskSettings.runnerCommand,
      runnerTimeoutMs: taskSettings.runnerTimeoutMs,
      workspacePath,
      autoGenerated: true,
      sourceTaskId: refreshedTemplate.id,
    }, taskSettings, workspacePath);

    this.store.update((draft) => {
      draft.tasks.unshift(task);
      draft.logs.unshift(
        createLogMessage('orchestrator', task.id, `Seeded workspace template: ${task.title}`, 'info'),
      );
      draft.logs = limitCollection(draft.logs, 500);
      return draft;
    }, { type: 'workspace-task-seeded', taskId: task.id, templateId: refreshedTemplate.id });

    return this.snapshot();
  }

  async approveTask(taskId, approvalId = null) {
    const snapshot = this.store.update((draft) => {
      const task = draft.tasks.find((entry) => entry.id === taskId);
      if (!task) return draft;

      const pendingApprovalId = task.pendingApprovalId;
      const approval = draft.approvals.find((entry) => entry.id === (approvalId ?? pendingApprovalId) || entry.taskId === taskId);
      task.status = 'queued';
      task.pendingApprovalId = null;
      task.updatedAt = nowIso();
      if (approval) {
        task.approvedSteps.unshift(
          {
            stepIndex: approval.stepIndex,
            action: approval.action,
            approvalId: approval.id,
            approvedAt: nowIso(),
          },
        );
        task.approvedSteps = limitCollection(task.approvedSteps, 50);
        approval.decision = 'approved';
        approval.resolvedAt = nowIso();
      }
      task.logs.unshift(
        createLogMessage('ui', task.id, 'Approval granted. Task re-queued.', 'success'),
      );
      task.logs = limitCollection(task.logs, 100);

      draft.logs.unshift(
        createLogMessage('ui', task.id, 'Manual approval granted from the UI.', 'success'),
      );
      draft.logs = limitCollection(draft.logs, 500);
      return draft;
    }, { type: 'approval-approved', taskId, approvalId });

    await this.runOnce();
    return this.snapshot();
  }

  rejectTask(taskId, approvalId = null) {
    const snapshot = this.store.update((draft) => {
      const task = draft.tasks.find((entry) => entry.id === taskId);
      if (!task) return draft;

      const pendingApprovalId = task.pendingApprovalId;
      task.status = 'blocked';
      task.pendingApprovalId = null;
      task.blockedReason = 'Rejected by user';
      task.updatedAt = nowIso();
      task.logs.unshift(
        createLogMessage('ui', task.id, 'Approval rejected. Task blocked.', 'warn'),
      );
      task.logs = limitCollection(task.logs, 100);

      const approval = draft.approvals.find((entry) => entry.id === (approvalId ?? pendingApprovalId) || entry.taskId === taskId);
      if (approval) {
        approval.decision = 'rejected';
        approval.resolvedAt = nowIso();
      }

      draft.logs.unshift(
        createLogMessage('ui', task.id, 'Manual approval rejected from the UI.', 'warn'),
      );
      draft.logs = limitCollection(draft.logs, 500);
      return draft;
    }, { type: 'approval-rejected', taskId, approvalId });

    return snapshot;
  }

  async runOnce() {
    if (this.busy) return false;

    const snapshot = this.snapshot();
    if (!snapshot.system.startedAt) {
      return false;
    }

    if (snapshot.settings.paused) {
      this.store.update((draft) => {
        draft.system.lastTickAt = nowIso();
        return draft;
      }, { type: 'tick-paused' });
      return false;
    }

    this.busy = true;
    try {
      this.store.update((draft) => {
        draft.system.lastTickAt = nowIso();
        return draft;
      }, { type: 'tick' });

      await this.#ensureHeartbeat(snapshot);
      const nextSnapshot = this.snapshot();
      const nextTask = orderTasks(nextSnapshot.tasks).find(isRunnableTask);
      if (!nextTask) {
        return false;
      }

      await this.#processTask(nextTask.id);
      return true;
    } finally {
      this.busy = false;
    }
  }

  async #ensureHeartbeat(snapshot) {
    const queuedOrRunning = snapshot.tasks.some((task) => ['queued', 'planning', 'executing', 'testing', 'reviewing', 'waiting-approval'].includes(task.status));
    if (!snapshot.settings.autoLoop || queuedOrRunning) {
      return;
    }

    const now = Date.now();
    const lastHeartbeatAt = snapshot.system.lastHeartbeatAt ? Date.parse(snapshot.system.lastHeartbeatAt) : 0;
    if (Number.isFinite(lastHeartbeatAt) && now - lastHeartbeatAt < snapshot.settings.autoLoopIntervalMs) {
      return;
    }

    const heartbeatTask = createTaskRecord({
      title: 'Maintenance heartbeat',
      objective: 'Review recent runs, summarize blockers, and propose one safe improvement.',
      kind: 'maintenance',
      priority: 1,
      autoGenerated: true,
      scope: 'workspace',
      providerMode: snapshot.settings.providerMode,
      providerCommand: snapshot.settings.providerCommand,
      providerTimeoutMs: snapshot.settings.providerTimeoutMs,
      runnerMode: snapshot.settings.runnerMode,
      runnerCommand: snapshot.settings.runnerCommand,
      runnerTimeoutMs: snapshot.settings.runnerTimeoutMs,
      workspacePath: snapshot.settings.workspacePath,
    }, snapshot.settings, '');

    this.store.update((draft) => {
      draft.system.lastHeartbeatAt = nowIso();
      draft.tasks.unshift(heartbeatTask);
      draft.logs.unshift(
        createLogMessage('orchestrator', heartbeatTask.id, 'Auto loop enqueued a maintenance task.', 'info'),
      );
      draft.logs = limitCollection(draft.logs, 500);
      return draft;
    }, { type: 'heartbeat-created', taskId: heartbeatTask.id });
  }

  async #processTask(taskId) {
    const snapshot = this.snapshot();
    const task = snapshot.tasks.find((entry) => entry.id === taskId);
    if (!task || task.status !== 'queued') {
      return false;
    }

    try {
      const settings = snapshot.settings;
      const provider = createProvider({
        ...settings,
        providerMode: task.providerMode,
        providerCommand: task.providerCommand,
        providerTimeoutMs: task.providerTimeoutMs,
        workspacePath: task.workspacePath || settings.workspacePath,
      });
      const runner = createRunner({
        ...settings,
        runnerMode: task.runnerMode,
        runnerCommand: task.runnerCommand,
        runnerTimeoutMs: task.runnerTimeoutMs,
        workspacePath: task.workspacePath || settings.workspacePath,
      });

      const memory = snapshot.memory.slice(0, 5);
      const plan = await provider.plan({ task, memory, locale: settings.locale, settings });
      const steps = Array.isArray(plan.steps) && plan.steps.length > 0
        ? plan.steps.map((step, index) => normalizeStep(step, index))
        : [];

      this.store.update((draft) => {
        const target = draft.tasks.find((entry) => entry.id === taskId);
        if (!target) return draft;

        target.status = 'planning';
        target.plan = {
          summary: plan.summary,
          workerPrompt: plan.workerPrompt ?? '',
          reviewPrompt: plan.reviewPrompt ?? '',
        };
        target.steps = steps;
        target.stepResults = [];
        target.logs.unshift(
          createLogMessage('worker', target.id, `Plan ready: ${plan.summary}`, 'info'),
        );
        target.logs = limitCollection(target.logs, 100);
        draft.system.activeTaskId = target.id;
        draft.logs.unshift(
          createLogMessage('worker', target.id, `Planning started for ${target.title}`, 'info'),
        );
        draft.logs = limitCollection(draft.logs, 500);
        return draft;
      }, { type: 'task-planning', taskId });

      for (let index = task.resumeFromStepIndex ?? 0; index < steps.length; index += 1) {
        const step = steps[index];
        const currentSnapshot = this.snapshot();
        const currentTask = currentSnapshot.tasks.find((entry) => entry.id === taskId);
        if (!currentTask) {
          return false;
        }

        if (currentSnapshot.settings.paused) {
          this.store.update((draft) => {
            const target = draft.tasks.find((entry) => entry.id === taskId);
            if (!target) return draft;
            target.status = 'paused';
            target.updatedAt = nowIso();
            draft.system.activeTaskId = null;
            draft.logs.unshift(
              createLogMessage('orchestrator', taskId, 'Task paused while running.', 'warn'),
            );
            draft.logs = limitCollection(draft.logs, 500);
            return draft;
          }, { type: 'task-paused', taskId });
          return false;
        }

        const action = inferRequiredAction(step);
        const approvedStepIndex = findApprovedStep(currentTask, index, action);
        const approvalBypass = approvedStepIndex >= 0;
        const gate = evaluatePermission({
          permissions: currentSnapshot.settings.permissions,
          action,
          requireHighRiskApproval: currentSnapshot.settings.requireHighRiskApproval,
          scope: currentTask.scope,
        });

        if (gate.requiresApproval && !approvalBypass) {
          const approval = createApprovalRecord({
            taskId: currentTask.id,
            stepId: step.id,
            stepIndex: index,
            action,
            reason: gate.reason,
          });

          this.store.update((draft) => {
            const target = draft.tasks.find((entry) => entry.id === taskId);
            if (!target) return draft;

            target.status = 'waiting-approval';
            target.pendingApprovalId = approval.id;
            target.resumeFromStepIndex = index;
            target.blockedReason = gate.reason;
            target.updatedAt = nowIso();
            target.logs.unshift(
              createLogMessage('orchestrator', target.id, gate.reason, 'warn', step.id),
            );
            target.logs = limitCollection(target.logs, 100);
            draft.approvals.unshift(approval);
            draft.approvals = limitCollection(draft.approvals, 100);
            draft.logs.unshift(
              createLogMessage('orchestrator', target.id, `Awaiting approval for ${stepTitle(step)}.`, 'warn', step.id),
            );
            draft.logs = limitCollection(draft.logs, 500);
            return draft;
          }, { type: 'task-waiting-approval', taskId, approvalId: approval.id });

          return true;
        }

        if (!gate.allowed && !approvalBypass) {
          this.store.update((draft) => {
            const target = draft.tasks.find((entry) => entry.id === taskId);
            if (!target) return draft;

            target.status = 'blocked';
            target.pendingApprovalId = null;
            target.blockedReason = gate.reason;
            target.updatedAt = nowIso();
            target.logs.unshift(
              createLogMessage('orchestrator', target.id, gate.reason, 'error', step.id),
            );
            target.logs = limitCollection(target.logs, 100);
            draft.system.activeTaskId = null;
            draft.logs.unshift(
              createLogMessage('orchestrator', target.id, gate.reason, 'error', step.id),
            );
            draft.logs = limitCollection(draft.logs, 500);
            return draft;
          }, { type: 'task-blocked', taskId });

          return true;
        }

        this.store.update((draft) => {
          const target = draft.tasks.find((entry) => entry.id === taskId);
          if (!target) return draft;
          target.status = stepStatusFromKind(step.kind);
          target.resumeFromStepIndex = index;
          target.updatedAt = nowIso();
          if (approvalBypass) {
            target.approvedSteps.splice(approvedStepIndex, 1);
          }
          target.logs.unshift(
            createLogMessage(step.role, target.id, `Starting ${stepTitle(step)}.`, 'info', step.id),
          );
          target.logs = limitCollection(target.logs, 100);
          draft.logs.unshift(
            createLogMessage(step.role, target.id, `Starting ${stepTitle(step)}.`, 'info', step.id),
          );
          draft.logs = limitCollection(draft.logs, 500);
          return draft;
        }, { type: 'step-started', taskId, stepId: step.id });

        const runOutput = await runner.run(step, {
          task: currentTask,
          settings: currentSnapshot.settings,
          onStdout: (text) => {
            this.store.update((draft) => {
              const target = draft.tasks.find((entry) => entry.id === taskId);
              if (!target) return draft;
              target.logs.unshift(
                createLogMessage(step.role, target.id, text.trim(), 'info', step.id),
              );
              target.logs = limitCollection(target.logs, 100);
              draft.logs.unshift(
                createLogMessage(step.role, target.id, text.trim(), 'info', step.id),
              );
              draft.logs = limitCollection(draft.logs, 500);
              return draft;
            }, { type: 'step-output', taskId, stepId: step.id });
          },
          onStderr: (text) => {
            this.store.update((draft) => {
              const target = draft.tasks.find((entry) => entry.id === taskId);
              if (!target) return draft;
              target.logs.unshift(
                createLogMessage(step.role, target.id, text.trim(), 'warn', step.id),
              );
              target.logs = limitCollection(target.logs, 100);
              draft.logs.unshift(
                createLogMessage(step.role, target.id, text.trim(), 'warn', step.id),
              );
              draft.logs = limitCollection(draft.logs, 500);
              return draft;
            }, { type: 'step-error-output', taskId, stepId: step.id });
          },
        });

        this.store.update((draft) => {
          const target = draft.tasks.find((entry) => entry.id === taskId);
          if (!target) return draft;

          const result = {
            id: `result-${randomUUID()}`,
            stepId: step.id,
            title: step.title,
            role: step.role,
            permission: action,
            status: runOutput.code === 0 ? 'succeeded' : 'failed',
            command: step.command ?? '',
            exitCode: runOutput.code,
            stdout: runOutput.stdout,
            stderr: runOutput.stderr,
            startedAt: currentSnapshot.system.lastTickAt ?? nowIso(),
            finishedAt: nowIso(),
            message: runOutput.timedOut ? 'Timed out' : '',
          };

          target.stepResults = [...target.stepResults, result].slice(-100);
          target.resumeFromStepIndex = index + 1;
          target.updatedAt = nowIso();
          if (runOutput.code !== 0) {
            target.status = 'failed';
            target.blockedReason = runOutput.timedOut ? 'Timed out' : 'Runner returned a non-zero exit code';
            target.logs.unshift(
              createLogMessage('runner', target.id, target.blockedReason, 'error', step.id),
            );
            target.logs = limitCollection(target.logs, 100);
            draft.system.activeTaskId = null;
            draft.logs.unshift(
              createLogMessage('runner', target.id, target.blockedReason, 'error', step.id),
            );
            draft.logs = limitCollection(draft.logs, 500);
            return draft;
          }

          target.logs.unshift(
            createLogMessage('runner', target.id, `${stepTitle(step)} completed successfully.`, 'success', step.id),
          );
          target.logs = limitCollection(target.logs, 100);
          draft.logs.unshift(
            createLogMessage('runner', target.id, `${stepTitle(step)} completed successfully.`, 'success', step.id),
          );
          draft.logs = limitCollection(draft.logs, 500);
          return draft;
        }, { type: 'step-finished', taskId, stepId: step.id });

        if (runOutput.code !== 0) {
          const latest = this.snapshot().tasks.find((entry) => entry.id === taskId);
          if (!latest) {
            return false;
          }

          if (latest.retryCount < currentSnapshot.settings.maxRetries) {
            this.store.update((draft) => {
              const target = draft.tasks.find((entry) => entry.id === taskId);
              if (!target) return draft;

              target.retryCount += 1;
              target.status = 'queued';
              target.resumeFromStepIndex = 0;
              target.pendingApprovalId = null;
              target.updatedAt = nowIso();
              target.logs.unshift(
                createLogMessage('orchestrator', target.id, `Retry scheduled (${target.retryCount}/${currentSnapshot.settings.maxRetries}).`, 'warn'),
              );
              target.logs = limitCollection(target.logs, 100);
              draft.system.activeTaskId = null;
              draft.logs.unshift(
                createLogMessage('orchestrator', target.id, `Retry scheduled (${target.retryCount}/${currentSnapshot.settings.maxRetries}).`, 'warn'),
              );
              draft.logs = limitCollection(draft.logs, 500);
              return draft;
            }, { type: 'task-retry', taskId });
          } else {
            this.store.update((draft) => {
              const target = draft.tasks.find((entry) => entry.id === taskId);
              if (!target) return draft;
              target.status = 'failed';
              target.updatedAt = nowIso();
              draft.system.activeTaskId = null;
              return draft;
            }, { type: 'task-failed', taskId });

            this.#appendMemory(taskId, task.title, 'failed', `Task failed during ${stepTitle(step)}.`);
          }
          return true;
        }
      }

      const postSnapshot = this.snapshot();
      const finishedTask = postSnapshot.tasks.find((entry) => entry.id === taskId);
      if (!finishedTask) {
        return false;
      }

      const review = await provider.review({
        task: finishedTask,
        results: finishedTask.stepResults,
        memory: postSnapshot.memory.slice(0, 5),
        locale: settings.locale,
        settings,
      });

      this.store.update((draft) => {
        const target = draft.tasks.find((entry) => entry.id === taskId);
        if (!target) return draft;

        target.review = review;
        target.updatedAt = nowIso();
        target.status = review.approved ? 'completed' : 'failed';
        target.blockedReason = review.approved ? null : review.notes;
        target.logs.unshift(
          createLogMessage('reviewer', target.id, review.notes, review.approved ? 'success' : 'warn'),
        );
        target.logs = limitCollection(target.logs, 100);
        draft.system.activeTaskId = null;
        draft.logs.unshift(
          createLogMessage('reviewer', target.id, review.notes, review.approved ? 'success' : 'warn'),
        );
        draft.logs = limitCollection(draft.logs, 500);
        return draft;
      }, { type: 'task-reviewed', taskId });

      if (review.approved && review.needsFollowUp) {
        this.createTask({
          title: review.followUpTitle || `Follow-up: ${finishedTask.title}`,
          objective: review.followUpObjective || review.notes || 'Investigate the latest improvement opportunity.',
          scope: 'workspace',
          kind: 'maintenance',
          priority: Math.max(1, finishedTask.priority - 1),
          autoGenerated: true,
          parentTaskId: finishedTask.id,
          sourceTaskId: finishedTask.id,
        });
      }

      this.#appendMemory(taskId, finishedTask.title, review.approved ? 'completed' : 'failed', review.notes);

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.update((draft) => {
        const target = draft.tasks.find((entry) => entry.id === taskId);
        if (!target) return draft;

        target.status = 'failed';
        target.pendingApprovalId = null;
        target.blockedReason = message;
        target.updatedAt = nowIso();
        target.logs.unshift(
          createLogMessage('orchestrator', target.id, message, 'error'),
        );
        target.logs = limitCollection(target.logs, 100);
        draft.system.activeTaskId = null;
        draft.logs.unshift(
          createLogMessage('orchestrator', taskId, message, 'error'),
        );
        draft.logs = limitCollection(draft.logs, 500);
        return draft;
      }, { type: 'task-error', taskId });

      this.#appendMemory(taskId, task.title, 'failed', message);
      return false;
    }
  }

  #appendMemory(taskId, title, outcome, summary) {
    this.store.update((draft) => {
      draft.memory.unshift(
        createMemoryEntry({
          taskId,
          title,
          outcome,
          summary,
        }),
      );
      draft.memory = limitCollection(draft.memory, 100);
      return draft;
    }, { type: 'memory-added', taskId });
  }
}
