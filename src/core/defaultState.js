import { randomUUID } from 'node:crypto';
import { AVAILABLE_LOCALES, DEFAULT_LOCALE } from './localeConfig.js';
import {
  COMPANY_AGENTS,
  COMPANY_DEPARTMENTS,
  DEFAULT_AGENT_ID,
  DEFAULT_DEPARTMENT_ID,
  getCompanyAgent,
  getCompanyDepartment,
  inferCompanyAssignment,
} from '../shared/companyCatalog.js';

export const SCHEMA_VERSION = 2;

export const DEFAULT_WORKSPACE_PATH = '';
export const DEFAULT_WORKSPACE_ID = 'workspace-default';

export const DEFAULT_PERMISSIONS = {
  read: true,
  write: true,
  test: true,
  pr: false,
  merge: false,
  deploy: false,
  selfEdit: false,
};

export const DEFAULT_SETTINGS = {
  locale: DEFAULT_LOCALE,
  workspacePath: DEFAULT_WORKSPACE_PATH,
  activeWorkspaceId: DEFAULT_WORKSPACE_ID,
  autoLoop: true,
  paused: false,
  autoLoopIntervalMs: 60_000,
  providerMode: 'scripted',
  providerCommand: '',
  providerTimeoutMs: 120_000,
  runnerMode: 'simulated',
  runnerCommand: '',
  runnerTimeoutMs: 120_000,
  permissions: { ...DEFAULT_PERMISSIONS },
  requireHighRiskApproval: true,
  maxRetries: 2,
};

export const DEFAULT_AGENTS = COMPANY_AGENTS;
export const DEFAULT_DEPARTMENTS = COMPANY_DEPARTMENTS;

export const DEFAULT_SYSTEM = {
  startedAt: null,
  lastTickAt: null,
  lastActivityAt: null,
  lastHeartbeatAt: null,
  activeTaskId: null,
};

export const DEFAULT_WORKSPACE = {
  id: DEFAULT_WORKSPACE_ID,
  name: 'Workspace 1',
  path: DEFAULT_WORKSPACE_PATH,
  description: 'Starter workspace with no path configured yet.',
  leadAgentId: DEFAULT_AGENT_ID,
  providerMode: 'scripted',
  providerCommand: '',
  providerTimeoutMs: DEFAULT_SETTINGS.providerTimeoutMs,
  runnerMode: 'simulated',
  runnerCommand: '',
  runnerTimeoutMs: DEFAULT_SETTINGS.runnerTimeoutMs,
};

export const DEFAULT_WORKSPACE_TASK_TEMPLATE = {
  id: 'template-default-workspace',
  workspaceId: DEFAULT_WORKSPACE.id,
  workspacePath: DEFAULT_WORKSPACE_PATH,
  title: 'Bootstrap the workspace',
  objective: 'Inspect the selected workspace and propose one safe improvement.',
  scope: 'workspace',
  kind: 'maintenance',
  priority: 5,
  ownerAgentId: DEFAULT_WORKSPACE.leadAgentId,
  departmentId: DEFAULT_DEPARTMENT_ID,
  providerMode: 'scripted',
  providerCommand: '',
  runnerMode: 'simulated',
  runnerCommand: '',
  description: 'Starter task template for the default workspace.',
};

export function createWorkspaceRecord(input = {}, settings = DEFAULT_SETTINGS) {
  const now = nowIso();
  const source = input ?? {};
  const workspacePath = normalizeString(
    source.path,
    normalizeString(settings.workspacePath, DEFAULT_WORKSPACE_PATH),
  );

  return normalizeWorkspace({
    id: source.id ?? newId('workspace'),
    name: source.name ?? 'New workspace',
    path: workspacePath,
    description: source.description ?? '',
    leadAgentId: source.leadAgentId ?? settings.leadAgentId ?? DEFAULT_WORKSPACE.leadAgentId,
    providerMode: source.providerMode ?? settings.providerMode ?? DEFAULT_WORKSPACE.providerMode,
    providerCommand: source.providerCommand ?? settings.providerCommand ?? DEFAULT_WORKSPACE.providerCommand,
    providerTimeoutMs: source.providerTimeoutMs ?? settings.providerTimeoutMs ?? DEFAULT_SETTINGS.providerTimeoutMs,
    runnerMode: source.runnerMode ?? settings.runnerMode ?? DEFAULT_WORKSPACE.runnerMode,
    runnerCommand: source.runnerCommand ?? settings.runnerCommand ?? DEFAULT_WORKSPACE.runnerCommand,
    runnerTimeoutMs: source.runnerTimeoutMs ?? settings.runnerTimeoutMs ?? DEFAULT_SETTINGS.runnerTimeoutMs,
    createdAt: source.createdAt ?? now,
    updatedAt: source.updatedAt ?? now,
  });
}

export function createWorkspaceTemplateRecord(workspace = DEFAULT_WORKSPACE, input = {}) {
  const now = nowIso();
  const source = input ?? {};
  const workspaceReference = workspace.path || workspace.name || 'the selected workspace';

  return normalizeTaskTemplate({
    id: source.id ?? `template-${workspace.id}`,
    workspaceId: source.workspaceId ?? workspace.id,
    workspacePath: source.workspacePath ?? workspace.path,
    title: source.title ?? `Bootstrap ${workspace.name}`,
    objective: source.objective ?? `Inspect ${workspaceReference} and propose one safe improvement.`,
    scope: source.scope ?? 'workspace',
    kind: source.kind ?? 'maintenance',
    priority: source.priority ?? 5,
    ownerAgentId: source.ownerAgentId ?? workspace.leadAgentId ?? DEFAULT_WORKSPACE_TASK_TEMPLATE.ownerAgentId,
    departmentId: source.departmentId ?? DEFAULT_WORKSPACE_TASK_TEMPLATE.departmentId,
    providerMode: source.providerMode ?? workspace.providerMode ?? DEFAULT_WORKSPACE_TASK_TEMPLATE.providerMode,
    providerCommand: source.providerCommand ?? workspace.providerCommand ?? DEFAULT_WORKSPACE_TASK_TEMPLATE.providerCommand,
    providerTimeoutMs: source.providerTimeoutMs ?? workspace.providerTimeoutMs ?? DEFAULT_SETTINGS.providerTimeoutMs,
    runnerMode: source.runnerMode ?? workspace.runnerMode ?? DEFAULT_WORKSPACE_TASK_TEMPLATE.runnerMode,
    runnerCommand: source.runnerCommand ?? workspace.runnerCommand ?? DEFAULT_WORKSPACE_TASK_TEMPLATE.runnerCommand,
    runnerTimeoutMs: source.runnerTimeoutMs ?? workspace.runnerTimeoutMs ?? DEFAULT_SETTINGS.runnerTimeoutMs,
    description: source.description ?? `Starter task template for ${workspace.name}.`,
    createdAt: source.createdAt ?? now,
    updatedAt: source.updatedAt ?? now,
  });
}

export function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export function createDefaultState() {
  const now = nowIso();
  const workspace = createWorkspaceRecord(DEFAULT_WORKSPACE, DEFAULT_SETTINGS);
  const taskTemplate = createWorkspaceTemplateRecord(workspace, DEFAULT_WORKSPACE_TASK_TEMPLATE);
  const agents = COMPANY_AGENTS.map((agent) => normalizeAgent(agent));
  const departments = COMPANY_DEPARTMENTS.map((department) => normalizeDepartment(department));
  return {
    schemaVersion: SCHEMA_VERSION,
    system: {
      ...DEFAULT_SYSTEM,
      startedAt: now,
      lastActivityAt: now,
    },
    settings: {
      ...deepClone(DEFAULT_SETTINGS),
      workspacePath: workspace.path,
      activeWorkspaceId: workspace.id,
      providerMode: workspace.providerMode,
      providerCommand: workspace.providerCommand,
      providerTimeoutMs: workspace.providerTimeoutMs,
      runnerMode: workspace.runnerMode,
      runnerCommand: workspace.runnerCommand,
      runnerTimeoutMs: workspace.runnerTimeoutMs,
    },
    tasks: [],
    approvals: [],
    logs: [],
    memory: [],
    agents,
    departments,
    workspaces: [workspace],
    taskTemplates: [taskTemplate],
  };
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNumber(value, fallback, min = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, numeric);
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeSettings(settings = {}) {
  const source = settings ?? {};
  return {
    ...deepClone(DEFAULT_SETTINGS),
    ...deepClone(source),
    locale: AVAILABLE_LOCALES.includes(source.locale) ? source.locale : DEFAULT_LOCALE,
    workspacePath: normalizeString(source.workspacePath, DEFAULT_SETTINGS.workspacePath),
    activeWorkspaceId: normalizeString(source.activeWorkspaceId, DEFAULT_SETTINGS.activeWorkspaceId),
    autoLoop: normalizeBoolean(source.autoLoop, DEFAULT_SETTINGS.autoLoop),
    paused: normalizeBoolean(source.paused, DEFAULT_SETTINGS.paused),
    autoLoopIntervalMs: normalizeNumber(source.autoLoopIntervalMs, DEFAULT_SETTINGS.autoLoopIntervalMs, 1_000),
    providerMode: ['scripted', 'command'].includes(source.providerMode)
      ? source.providerMode
      : DEFAULT_SETTINGS.providerMode,
    providerCommand: normalizeString(source.providerCommand, ''),
    providerTimeoutMs: normalizeNumber(source.providerTimeoutMs, DEFAULT_SETTINGS.providerTimeoutMs, 1_000),
    runnerMode: ['simulated', 'shell'].includes(source.runnerMode)
      ? source.runnerMode
      : DEFAULT_SETTINGS.runnerMode,
    runnerCommand: normalizeString(source.runnerCommand, ''),
    runnerTimeoutMs: normalizeNumber(source.runnerTimeoutMs, DEFAULT_SETTINGS.runnerTimeoutMs, 1_000),
    permissions: {
      ...deepClone(DEFAULT_PERMISSIONS),
      ...(source.permissions ?? {}),
    },
    requireHighRiskApproval: normalizeBoolean(
      source.requireHighRiskApproval,
      DEFAULT_SETTINGS.requireHighRiskApproval,
    ),
    maxRetries: normalizeNumber(source.maxRetries, DEFAULT_SETTINGS.maxRetries, 0),
  };
}

export function normalizeSystem(system = {}) {
  const source = system ?? {};
  return {
    ...deepClone(DEFAULT_SYSTEM),
    ...deepClone(source),
    startedAt: normalizeString(source.startedAt, nowIso()),
    lastTickAt: source.lastTickAt ? normalizeString(source.lastTickAt, null) : null,
    lastActivityAt: source.lastActivityAt ? normalizeString(source.lastActivityAt, null) : null,
    lastHeartbeatAt: source.lastHeartbeatAt ? normalizeString(source.lastHeartbeatAt, null) : null,
    activeTaskId: source.activeTaskId ? normalizeString(source.activeTaskId, null) : null,
  };
}

export function normalizeTask(task = {}) {
  const source = task ?? {};
  const now = nowIso();
  return {
    id: normalizeString(source.id, newId('task')),
    title: normalizeString(source.title, 'Untitled task'),
    objective: normalizeString(source.objective, ''),
    scope: ['workspace', 'orchestrator'].includes(source.scope) ? source.scope : 'workspace',
    workspacePath: normalizeString(source.workspacePath, ''),
    ownerAgentId: normalizeString(source.ownerAgentId, ''),
    departmentId: normalizeString(source.departmentId, ''),
    providerMode: ['scripted', 'command'].includes(source.providerMode)
      ? source.providerMode
      : DEFAULT_SETTINGS.providerMode,
    providerCommand: normalizeString(source.providerCommand, ''),
    providerTimeoutMs: normalizeNumber(source.providerTimeoutMs, DEFAULT_SETTINGS.providerTimeoutMs, 1_000),
    runnerMode: ['simulated', 'shell'].includes(source.runnerMode)
      ? source.runnerMode
      : DEFAULT_SETTINGS.runnerMode,
    runnerCommand: normalizeString(source.runnerCommand, ''),
    runnerTimeoutMs: normalizeNumber(source.runnerTimeoutMs, DEFAULT_SETTINGS.runnerTimeoutMs, 1_000),
    priority: normalizeNumber(source.priority, 3, 1),
    kind: normalizeString(source.kind, 'custom'),
    status: normalizeString(source.status, 'queued'),
    resumeFromStepIndex: normalizeNumber(source.resumeFromStepIndex, 0, 0),
    retryCount: normalizeNumber(source.retryCount, 0, 0),
    createdAt: normalizeString(source.createdAt, now),
    updatedAt: normalizeString(source.updatedAt, now),
    parentTaskId: source.parentTaskId ? normalizeString(source.parentTaskId, null) : null,
    sourceTaskId: source.sourceTaskId ? normalizeString(source.sourceTaskId, null) : null,
    autoGenerated: normalizeBoolean(source.autoGenerated, false),
    pendingApprovalId: source.pendingApprovalId ? normalizeString(source.pendingApprovalId, null) : null,
    blockedReason: source.blockedReason ? normalizeString(source.blockedReason, null) : null,
    review: source.review && typeof source.review === 'object' ? deepClone(source.review) : null,
    plan: source.plan && typeof source.plan === 'object' ? deepClone(source.plan) : null,
    steps: normalizeArray(source.steps).map((step, index) => normalizeStep(step, index)),
    stepResults: normalizeArray(source.stepResults).map((step, index) => normalizeStepResult(step, index)),
    approvedSteps: normalizeArray(source.approvedSteps).map((entry) => normalizeApprovedStep(entry)),
    logs: normalizeArray(source.logs).map((entry) => normalizeLog(entry, source.id)),
  };
}

export function normalizeStep(step = {}, index = 0) {
  const source = step ?? {};
  return {
    id: normalizeString(source.id, `step-${index + 1}`),
    title: normalizeString(source.title, `Step ${index + 1}`),
    role: ['worker', 'reviewer'].includes(source.role) ? source.role : 'worker',
    kind: normalizeString(source.kind, 'execute'),
    permission: normalizeString(source.permission, 'write'),
    command: normalizeString(source.command, ''),
    note: normalizeString(source.note, ''),
  };
}

export function normalizeStepResult(step = {}, index = 0) {
  const source = step ?? {};
  return {
    id: normalizeString(source.id, `result-${index + 1}`),
    stepId: normalizeString(source.stepId, `step-${index + 1}`),
    title: normalizeString(source.title, `Step ${index + 1}`),
    role: normalizeString(source.role, 'worker'),
    permission: normalizeString(source.permission, 'write'),
    status: ['succeeded', 'failed', 'blocked', 'skipped'].includes(source.status)
      ? source.status
      : 'succeeded',
    command: normalizeString(source.command, ''),
    exitCode: normalizeNumber(source.exitCode, 0, 0),
    stdout: normalizeString(source.stdout, ''),
    stderr: normalizeString(source.stderr, ''),
    startedAt: normalizeString(source.startedAt, nowIso()),
    finishedAt: normalizeString(source.finishedAt, nowIso()),
    message: normalizeString(source.message, ''),
  };
}

export function normalizeApprovedStep(entry = {}) {
  const source = entry ?? {};
  return {
    stepIndex: normalizeNumber(source.stepIndex, 0, 0),
    action: normalizeString(source.action, 'write'),
    approvalId: normalizeString(source.approvalId, ''),
    approvedAt: normalizeString(source.approvedAt, nowIso()),
  };
}

export function normalizeApproval(approval = {}) {
  const source = approval ?? {};
  return {
    id: normalizeString(source.id, newId('approval')),
    taskId: normalizeString(source.taskId, ''),
    stepId: normalizeString(source.stepId, ''),
    stepIndex: normalizeNumber(source.stepIndex, 0, 0),
    action: normalizeString(source.action, 'write'),
    reason: normalizeString(source.reason, ''),
    decision: ['pending', 'approved', 'rejected'].includes(source.decision)
      ? source.decision
      : 'pending',
    requestedAt: normalizeString(source.requestedAt, nowIso()),
    resolvedAt: source.resolvedAt ? normalizeString(source.resolvedAt, null) : null,
  };
}

export function normalizeLog(entry = {}, fallbackTaskId = null) {
  const source = entry ?? {};
  return {
    id: normalizeString(source.id, newId('log')),
    taskId: source.taskId ? normalizeString(source.taskId, fallbackTaskId) : fallbackTaskId,
    stepId: source.stepId ? normalizeString(source.stepId, null) : null,
    source: normalizeString(source.source, 'orchestrator'),
    level: ['info', 'warn', 'error', 'success'].includes(source.level) ? source.level : 'info',
    message: normalizeString(source.message, ''),
    timestamp: normalizeString(source.timestamp, nowIso()),
  };
}

export function normalizeMemory(entry = {}) {
  const source = entry ?? {};
  return {
    id: normalizeString(source.id, newId('memory')),
    taskId: normalizeString(source.taskId, ''),
    title: normalizeString(source.title, ''),
    summary: normalizeString(source.summary, ''),
    outcome: ['completed', 'failed', 'blocked', 'approved'].includes(source.outcome)
      ? source.outcome
      : 'completed',
    createdAt: normalizeString(source.createdAt, nowIso()),
  };
}

export function normalizeWorkspace(workspace = {}) {
  const source = workspace ?? {};
  const leadAgentId = COMPANY_AGENTS.some((agent) => agent.id === source.leadAgentId)
    ? source.leadAgentId
    : DEFAULT_WORKSPACE.leadAgentId;
  return {
    id: normalizeString(source.id, DEFAULT_WORKSPACE.id),
    name: normalizeString(source.name, DEFAULT_WORKSPACE.name),
    path: normalizeString(source.path, DEFAULT_WORKSPACE.path),
    description: normalizeString(source.description, DEFAULT_WORKSPACE.description),
    leadAgentId,
    providerMode: ['scripted', 'command'].includes(source.providerMode)
      ? source.providerMode
      : DEFAULT_WORKSPACE.providerMode,
    providerCommand: normalizeString(source.providerCommand, DEFAULT_WORKSPACE.providerCommand),
    providerTimeoutMs: normalizeNumber(
      source.providerTimeoutMs,
      DEFAULT_WORKSPACE.providerTimeoutMs,
      1_000,
    ),
    runnerMode: ['simulated', 'shell'].includes(source.runnerMode)
      ? source.runnerMode
      : DEFAULT_WORKSPACE.runnerMode,
    runnerCommand: normalizeString(source.runnerCommand, DEFAULT_WORKSPACE.runnerCommand),
    runnerTimeoutMs: normalizeNumber(
      source.runnerTimeoutMs,
      DEFAULT_WORKSPACE.runnerTimeoutMs,
      1_000,
    ),
    createdAt: normalizeString(source.createdAt, nowIso()),
    updatedAt: normalizeString(source.updatedAt, nowIso()),
  };
}

export function normalizeTaskTemplate(template = {}) {
  const source = template ?? {};
  const ownerAgentId = COMPANY_AGENTS.some((agent) => agent.id === source.ownerAgentId)
    ? source.ownerAgentId
    : DEFAULT_WORKSPACE_TASK_TEMPLATE.ownerAgentId;
  const departmentId = COMPANY_DEPARTMENTS.some((department) => department.id === source.departmentId)
    ? source.departmentId
    : DEFAULT_WORKSPACE_TASK_TEMPLATE.departmentId;
  return {
    id: normalizeString(source.id, DEFAULT_WORKSPACE_TASK_TEMPLATE.id),
    workspaceId: normalizeString(source.workspaceId, DEFAULT_WORKSPACE_TASK_TEMPLATE.workspaceId),
    workspacePath: normalizeString(source.workspacePath, DEFAULT_WORKSPACE_TASK_TEMPLATE.workspacePath),
    title: normalizeString(source.title, DEFAULT_WORKSPACE_TASK_TEMPLATE.title),
    objective: normalizeString(source.objective, DEFAULT_WORKSPACE_TASK_TEMPLATE.objective),
    scope: ['workspace', 'orchestrator'].includes(source.scope)
      ? source.scope
      : DEFAULT_WORKSPACE_TASK_TEMPLATE.scope,
    kind: normalizeString(source.kind, DEFAULT_WORKSPACE_TASK_TEMPLATE.kind),
    priority: normalizeNumber(source.priority, DEFAULT_WORKSPACE_TASK_TEMPLATE.priority, 1),
    ownerAgentId,
    departmentId,
    providerMode: ['scripted', 'command'].includes(source.providerMode)
      ? source.providerMode
      : DEFAULT_WORKSPACE_TASK_TEMPLATE.providerMode,
    providerCommand: normalizeString(source.providerCommand, DEFAULT_WORKSPACE_TASK_TEMPLATE.providerCommand),
    providerTimeoutMs: normalizeNumber(
      source.providerTimeoutMs,
      DEFAULT_SETTINGS.providerTimeoutMs,
      1_000,
    ),
    runnerMode: ['simulated', 'shell'].includes(source.runnerMode)
      ? source.runnerMode
      : DEFAULT_WORKSPACE_TASK_TEMPLATE.runnerMode,
    runnerCommand: normalizeString(source.runnerCommand, DEFAULT_WORKSPACE_TASK_TEMPLATE.runnerCommand),
    runnerTimeoutMs: normalizeNumber(
      source.runnerTimeoutMs,
      DEFAULT_SETTINGS.runnerTimeoutMs,
      1_000,
    ),
    description: normalizeString(source.description, DEFAULT_WORKSPACE_TASK_TEMPLATE.description),
    createdAt: normalizeString(source.createdAt, nowIso()),
    updatedAt: normalizeString(source.updatedAt, nowIso()),
  };
}

export function normalizeState(rawState = {}) {
  const source = rawState ?? {};
  const agents = normalizeArray(source.agents).map((agent) => normalizeAgent(agent));
  const normalizedAgents = agents.length > 0 ? agents : COMPANY_AGENTS.map((agent) => normalizeAgent(agent));
  const departments = normalizeArray(source.departments).map((department) => normalizeDepartment(department));
  const normalizedDepartments = departments.length > 0 ? departments : COMPANY_DEPARTMENTS.map((department) => normalizeDepartment(department));
  const workspaces = normalizeArray(source.workspaces).map((workspace) => normalizeWorkspace(workspace));
  const normalizedWorkspaces = workspaces.length > 0 ? workspaces : [createWorkspaceRecord(DEFAULT_WORKSPACE)];
  const taskTemplates = normalizeArray(source.taskTemplates).map((template) => normalizeTaskTemplate(template));
  const templateMap = new Map(taskTemplates.map((template) => [template.workspaceId, template]));
  for (const workspace of normalizedWorkspaces) {
    const template = templateMap.get(workspace.id);
    if (!template) {
      const createdTemplate = createWorkspaceTemplateRecord(workspace);
      taskTemplates.push(createdTemplate);
      templateMap.set(workspace.id, createdTemplate);
      continue;
    }

    template.workspacePath = workspace.path;
    if (!COMPANY_AGENTS.some((agent) => agent.id === template.ownerAgentId)) {
      template.ownerAgentId = workspace.leadAgentId ?? DEFAULT_WORKSPACE.leadAgentId;
    }
    if (!COMPANY_DEPARTMENTS.some((department) => department.id === template.departmentId)) {
      template.departmentId = DEFAULT_WORKSPACE_TASK_TEMPLATE.departmentId;
    }
  }

  const normalizedSettings = normalizeSettings(source.settings);
  const activeWorkspace = normalizedWorkspaces.find((workspace) => workspace.id === normalizedSettings.activeWorkspaceId)
    ?? normalizedWorkspaces.find((workspace) => workspace.path === normalizedSettings.workspacePath)
    ?? normalizedWorkspaces[0];

  if (activeWorkspace) {
    normalizedSettings.activeWorkspaceId = activeWorkspace.id;
    normalizedSettings.workspacePath = activeWorkspace.path;
    normalizedSettings.providerMode = activeWorkspace.providerMode;
    normalizedSettings.providerCommand = activeWorkspace.providerCommand;
    normalizedSettings.providerTimeoutMs = activeWorkspace.providerTimeoutMs;
    normalizedSettings.runnerMode = activeWorkspace.runnerMode;
    normalizedSettings.runnerCommand = activeWorkspace.runnerCommand;
    normalizedSettings.runnerTimeoutMs = activeWorkspace.runnerTimeoutMs;
  }

  const tasks = normalizeArray(source.tasks).map((task) => normalizeTask(task));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    const sourceTask = task.sourceTaskId ? taskMap.get(task.sourceTaskId) ?? null : null;
    const assignment = inferCompanyAssignment(task, {
      sourceTask,
      leadAgentId: activeWorkspace?.leadAgentId ?? DEFAULT_WORKSPACE.leadAgentId,
    });
    task.ownerAgentId = COMPANY_AGENTS.some((agent) => agent.id === task.ownerAgentId)
      ? task.ownerAgentId
      : assignment.ownerAgentId;
    task.departmentId = COMPANY_DEPARTMENTS.some((department) => department.id === task.departmentId)
      ? task.departmentId
      : assignment.departmentId;
  }

  const state = {
    schemaVersion: SCHEMA_VERSION,
    system: normalizeSystem(source.system),
    settings: normalizedSettings,
    tasks,
    approvals: normalizeArray(source.approvals).map((approval) => normalizeApproval(approval)),
    logs: normalizeArray(source.logs).map((log) => normalizeLog(log)),
    memory: normalizeArray(source.memory).map((entry) => normalizeMemory(entry)),
    agents: normalizedAgents,
    departments: normalizedDepartments,
    workspaces: normalizedWorkspaces,
    taskTemplates: taskTemplates,
  };

  return state;
}

export function createTaskRecord(input = {}, settings = DEFAULT_SETTINGS, fallbackWorkspacePath = '') {
  const now = nowIso();
  const source = input ?? {};
  const workspacePath = normalizeString(
    source.workspacePath,
    normalizeString(settings.workspacePath, fallbackWorkspacePath),
  );

  return normalizeTask({
    id: source.id ?? newId('task'),
    title: source.title ?? 'Untitled task',
    objective: source.objective ?? '',
    scope: source.scope ?? 'workspace',
    workspacePath,
    ownerAgentId: source.ownerAgentId ?? null,
    departmentId: source.departmentId ?? null,
    providerMode: source.providerMode ?? settings.providerMode ?? DEFAULT_SETTINGS.providerMode,
    providerCommand: source.providerCommand ?? settings.providerCommand ?? '',
    providerTimeoutMs: source.providerTimeoutMs ?? settings.providerTimeoutMs ?? DEFAULT_SETTINGS.providerTimeoutMs,
    runnerMode: source.runnerMode ?? settings.runnerMode ?? DEFAULT_SETTINGS.runnerMode,
    runnerCommand: source.runnerCommand ?? settings.runnerCommand ?? '',
    runnerTimeoutMs: source.runnerTimeoutMs ?? settings.runnerTimeoutMs ?? DEFAULT_SETTINGS.runnerTimeoutMs,
    priority: source.priority ?? 3,
    kind: source.kind ?? 'custom',
    status: 'queued',
    resumeFromStepIndex: 0,
    retryCount: source.retryCount ?? 0,
    createdAt: now,
    updatedAt: now,
    parentTaskId: source.parentTaskId ?? null,
    sourceTaskId: source.sourceTaskId ?? null,
    autoGenerated: Boolean(source.autoGenerated),
    pendingApprovalId: null,
    blockedReason: null,
    review: null,
    plan: null,
    steps: [],
    stepResults: [],
    approvedSteps: [],
    logs: [],
  });
}

export function createLogEntry({
  taskId = null,
  stepId = null,
  source = 'orchestrator',
  level = 'info',
  message = '',
} = {}) {
  return normalizeLog(
    {
      id: newId('log'),
      taskId,
      stepId,
      source,
      level,
      message,
      timestamp: nowIso(),
    },
    taskId,
  );
}

export function createMemoryEntry({
  taskId = '',
  title = '',
  summary = '',
  outcome = 'completed',
} = {}) {
  return normalizeMemory({
    id: newId('memory'),
    taskId,
    title,
    summary,
    outcome,
    createdAt: nowIso(),
  });
}

export function createApprovalRecord({
  taskId = '',
  stepId = '',
  stepIndex = 0,
  action = 'write',
  reason = '',
} = {}) {
  return normalizeApproval({
    id: newId('approval'),
    taskId,
    stepId,
    stepIndex,
    action,
    reason,
    decision: 'pending',
    requestedAt: nowIso(),
    resolvedAt: null,
  });
}

export function normalizeAgent(agent = {}) {
  const source = agent ?? {};
  const defaultAgent = getCompanyAgent(source.id ?? DEFAULT_AGENT_ID);
  return {
    id: normalizeString(source.id, defaultAgent.id),
    name: normalizeString(source.name, defaultAgent.name),
    title: normalizeString(source.title, defaultAgent.title),
    departmentId: COMPANY_DEPARTMENTS.some((department) => department.id === source.departmentId)
      ? source.departmentId
      : defaultAgent.departmentId,
    avatar: normalizeString(source.avatar, defaultAgent.avatar),
    rank: normalizeNumber(source.rank, defaultAgent.rank, 1),
    rankLabel: normalizeString(source.rankLabel, defaultAgent.rankLabel),
    specialty: normalizeString(source.specialty, defaultAgent.specialty),
    defaultFocus: normalizeString(source.defaultFocus, defaultAgent.defaultFocus),
    accent: normalizeString(source.accent, defaultAgent.accent),
    createdAt: normalizeString(source.createdAt, nowIso()),
    updatedAt: normalizeString(source.updatedAt, nowIso()),
  };
}

export function normalizeDepartment(department = {}) {
  const source = department ?? {};
  const defaultDepartment = getCompanyDepartment(source.id ?? DEFAULT_DEPARTMENT_ID);
  return {
    id: normalizeString(source.id, defaultDepartment.id),
    name: normalizeString(source.name, defaultDepartment.name),
    description: normalizeString(source.description, defaultDepartment.description),
    accent: normalizeString(source.accent, defaultDepartment.accent),
    createdAt: normalizeString(source.createdAt, nowIso()),
    updatedAt: normalizeString(source.updatedAt, nowIso()),
  };
}
