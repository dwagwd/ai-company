import {
  COMPANY_AGENTS,
  COMPANY_DEPARTMENTS,
  getCompanyAgent,
  getCompanyDepartment,
} from '../shared/companyCatalog.js';

const ACTIVE_STATUSES = new Set(['queued', 'planning', 'executing', 'testing', 'reviewing', 'waiting-approval']);
const CLOSED_STATUSES = new Set(['completed', 'failed', 'blocked']);

const PIPELINE_STAGES = [
  {
    id: 'plan',
    label: 'Plan',
    subtitle: 'Briefing and planning',
    accent: 'cyan',
    statuses: ['queued', 'planning'],
  },
  {
    id: 'execute',
    label: 'Execute',
    subtitle: 'Production and verification',
    accent: 'green',
    statuses: ['executing', 'testing'],
  },
  {
    id: 'review',
    label: 'Review',
    subtitle: 'Acceptance and recovery',
    accent: 'amber',
    statuses: ['reviewing', 'waiting-approval', 'blocked', 'failed'],
  },
  {
    id: 'archive',
    label: 'Archive',
    subtitle: 'Completed missions',
    accent: 'violet',
    statuses: ['completed'],
  },
];

const STAGE_META = {
  queued: { key: 'briefing', label: 'Briefing', progress: 12 },
  planning: { key: 'planning', label: 'Planning', progress: 28 },
  executing: { key: 'production', label: 'Production', progress: 56 },
  testing: { key: 'verification', label: 'Verification', progress: 74 },
  reviewing: { key: 'review', label: 'Review', progress: 88 },
  'waiting-approval': { key: 'acceptance-gate', label: 'Acceptance Gate', progress: 80 },
  blocked: { key: 'blocked', label: 'Blocked', progress: 18 },
  failed: { key: 'failed', label: 'Failed', progress: 40 },
  completed: { key: 'accepted', label: 'Accepted', progress: 100 },
};

function sortTasks(tasks = []) {
  return [...tasks].sort((a, b) => {
    const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  });
}

function isTaskActive(task) {
  return ACTIVE_STATUSES.has(task.status);
}

function completedStepCount(task) {
  return Array.isArray(task.stepResults)
    ? task.stepResults.filter((result) => result.status === 'succeeded').length
    : 0;
}

function deriveProgress(task) {
  if (!task) return 0;
  const stageProgress = STAGE_META[task.status]?.progress ?? 0;
  const totalSteps = Math.max(Array.isArray(task.steps) ? task.steps.length : 0, 1);
  const completed = completedStepCount(task);
  const stepProgress = Math.min(20, Math.round((completed / totalSteps) * 20));

  if (task.status === 'completed') return 100;
  if (task.status === 'failed') return Math.min(92, stageProgress + stepProgress);

  return Math.min(95, stageProgress + stepProgress);
}

function deriveConfidence(task) {
  switch (task?.status) {
    case 'completed':
      return { score: 96, label: 'High' };
    case 'reviewing':
      return { score: 84, label: 'Strong' };
    case 'testing':
      return { score: 72, label: 'Steady' };
    case 'executing':
      return { score: 64, label: 'Growing' };
    case 'planning':
      return { score: 54, label: 'Early' };
    case 'waiting-approval':
      return { score: 58, label: 'On hold' };
    case 'blocked':
      return { score: 28, label: 'Risky' };
    case 'failed':
      return { score: 24, label: 'Recovering' };
    default:
      return { score: 48, label: 'Neutral' };
  }
}

function deriveNextAction(task) {
  if (!task) return 'Await the next brief.';

  if (task.status === 'waiting-approval') {
    return 'Await acceptance gate approval.';
  }

  if (task.status === 'blocked') {
    return task.blockedReason ? `Clear blocker: ${task.blockedReason}` : 'Clear the current blocker.';
  }

  if (task.status === 'failed') {
    return 'Open a follow-up mission and recover the workflow.';
  }

  if (task.status === 'completed') {
    return 'Archive the mission and launch the next brief.';
  }

  const nextStep = Array.isArray(task.steps)
    ? task.steps[Math.min(task.resumeFromStepIndex ?? 0, Math.max(task.steps.length - 1, 0))]
    : null;

  if (nextStep?.title) {
    return `Focus on ${nextStep.title}.`;
  }

  return 'Continue the mission lane.';
}

function deriveBlocker(task) {
  if (!task) return '';
  if (task.blockedReason) return task.blockedReason;
  if (task.status === 'waiting-approval') return 'Waiting for a review gate.';
  if (task.status === 'failed') return task.review?.notes || 'The mission needs recovery.';
  return '';
}

function deriveRationale(task) {
  if (!task) return '';
  return task.plan?.summary || task.objective || task.title || '';
}

function deriveAcceptanceCriteria(task) {
  if (!task) return [];

  const stepCount = Array.isArray(task.steps) ? task.steps.length : 0;
  const completed = completedStepCount(task);
  const reviewLabel = task.review?.approved ? 'Reviewer approved' : 'Reviewer sign-off pending';
  const stepLabel = stepCount > 0
    ? `${completed}/${stepCount} work orders complete`
    : 'Mission brief prepared';
  const blockerLabel = task.blockedReason ? `Resolve blocker: ${task.blockedReason}` : 'No open blocker';

  return [reviewLabel, stepLabel, blockerLabel];
}

function deriveSubgoals(task) {
  if (!Array.isArray(task?.steps)) return [];
  return task.steps
    .filter((step) => step.kind !== 'review')
    .map((step, index) => ({
      id: step.id ?? `${task.id}-subgoal-${index}`,
      title: step.title,
      role: step.role,
      kind: step.kind,
      status: task.stepResults?.find((result) => result.stepId === step.id)?.status ?? 'pending',
    }));
}

function derivePipelineStage(task) {
  if (!task) return PIPELINE_STAGES[0];
  return PIPELINE_STAGES.find((stage) => stage.statuses.includes(task.status)) ?? PIPELINE_STAGES[0];
}

function buildMission(task, context = {}) {
  const owner = getCompanyAgent(task.ownerAgentId) ?? context.leadAgent ?? COMPANY_AGENTS[0];
  const department = getCompanyDepartment(task.departmentId) ?? context.departmentsById?.get(owner.departmentId) ?? COMPANY_DEPARTMENTS[0];
  const stage = STAGE_META[task.status] ?? STAGE_META.queued;
  const pipelineStage = derivePipelineStage(task);
  const confidence = deriveConfidence(task);
  const rationale = deriveRationale(task);
  const blocker = deriveBlocker(task);
  const nextAction = deriveNextAction(task);
  const currentStep = Array.isArray(task.steps)
    ? task.steps[Math.min(task.resumeFromStepIndex ?? 0, Math.max(task.steps.length - 1, 0))] ?? null
    : null;

  return {
    ...task,
    owner,
    department,
    stage,
    pipelineStage,
    progress: deriveProgress(task),
    confidence,
    currentStep,
    acceptanceCriteria: deriveAcceptanceCriteria(task),
    subgoals: deriveSubgoals(task),
    thinking: {
      goal: task.objective || task.title || '',
      rationale,
      blocker,
      nextAction,
      confidence,
    },
    isActive: isTaskActive(task),
    isClosed: CLOSED_STATUSES.has(task.status),
    completedStepCount: completedStepCount(task),
  };
}

function buildAgent(agent, context = {}) {
  const tasks = context.ownedTasksByAgent?.get(agent.id) ?? [];
  const liveTask = tasks.find((task) => isTaskActive(task)) ?? tasks[0] ?? context.activeMission ?? null;
  const department = context.departmentsById?.get(agent.departmentId) ?? getCompanyDepartment(agent.departmentId);
  const mission = liveTask ? buildMission(liveTask, context) : null;
  const focusMission = mission ?? context.activeMission ?? null;
  const completedCount = tasks.filter((task) => task.status === 'completed').length;
  const activeCount = tasks.filter((task) => isTaskActive(task)).length;
  const blockedCount = tasks.filter((task) => ['waiting-approval', 'blocked', 'failed'].includes(task.status)).length;
  const status = blockedCount > 0
    ? 'Blocked'
    : activeCount > 0
      ? 'On duty'
      : completedCount > 0
        ? 'Reviewing'
        : 'Idle';

  const roleFocus = (() => {
    switch (agent.id) {
      case 'astra':
        return context.currentGoal || agent.defaultFocus;
      case 'mira':
        return focusMission?.thinking?.rationale || agent.defaultFocus;
      case 'forge':
        return focusMission?.currentStep?.title || focusMission?.thinking?.nextAction || agent.defaultFocus;
      case 'quill':
        return focusMission?.acceptanceCriteria?.[0] || focusMission?.thinking?.blocker || agent.defaultFocus;
      case 'pulse':
        return context.topBlocker || context.pendingApprovalLabel || agent.defaultFocus;
      default:
        return agent.defaultFocus;
    }
  })();

  const rationale = (() => {
    switch (agent.id) {
      case 'astra':
        return `Lead the mission toward ${context.currentGoal || 'the next objective'}.`;
      case 'mira':
        return 'Convert the brief into a workable sequence.';
      case 'forge':
        return 'Turn the next work order into progress.';
      case 'quill':
        return 'Check the result against the acceptance gate.';
      case 'pulse':
        return 'Keep the loop healthy and recover stalls.';
      default:
        return agent.specialty;
    }
  })();

  const blocker = (() => {
    if (agent.id === 'pulse') return context.topBlocker || '';
    if (agent.id === 'quill') return focusMission?.status === 'waiting-approval' ? 'Approval gate waiting.' : focusMission?.thinking?.blocker || '';
    return focusMission?.thinking?.blocker || '';
  })();

  const nextAction = (() => {
    if (agent.id === 'astra') return focusMission ? `Direct ${focusMission.title}.` : 'Set the next mission.';
    if (agent.id === 'mira') return focusMission ? 'Refine the plan and hand it off.' : 'Shape the next brief.';
    if (agent.id === 'forge') return focusMission?.currentStep?.title ? `Execute ${focusMission.currentStep.title}.` : 'Move the build lane.';
    if (agent.id === 'quill') return focusMission?.status === 'waiting-approval' ? 'Decide the gate.' : 'Review the latest result.';
    if (agent.id === 'pulse') return context.pendingApprovalLabel ? 'Resolve the blocker queue.' : 'Monitor the system.';
    return agent.defaultFocus;
  })();

  const confidence = focusMission?.confidence ?? { score: 48, label: 'Neutral' };
  const currentMissionTitle = focusMission?.title || agent.defaultFocus;

  return {
    ...agent,
    department,
    status,
    currentMissionTitle,
    currentGoal: roleFocus,
    currentTask: focusMission?.currentStep?.title || focusMission?.title || '',
    completedCount,
    activeCount,
    blockedCount,
    thought: {
      goal: context.currentGoal || currentMissionTitle,
      rationale,
      blocker,
      nextAction,
      confidence,
    },
  };
}

function buildDepartment(department, context = {}) {
  const ownedTasks = context.tasksByDepartment?.get(department.id) ?? [];
  const activeCount = ownedTasks.filter((task) => isTaskActive(task)).length;
  const completedCount = ownedTasks.filter((task) => task.status === 'completed').length;
  const blockedCount = ownedTasks.filter((task) => ['waiting-approval', 'blocked', 'failed'].includes(task.status)).length;
  const lead = context.agentsByDepartment?.get(department.id) ?? null;

  return {
    ...department,
    activeCount,
    completedCount,
    blockedCount,
    lead,
  };
}

export function buildCompanyBoard(snapshot = {}) {
  const agents = Array.isArray(snapshot.agents) && snapshot.agents.length > 0
    ? snapshot.agents.map((agent) => {
      const defaultAgent = getCompanyAgent(agent.id);
      return {
        ...defaultAgent,
        ...agent,
        avatar: agent.avatar ?? defaultAgent.avatar,
        rank: agent.rank ?? defaultAgent.rank,
        rankLabel: agent.rankLabel ?? defaultAgent.rankLabel,
      };
    })
    : COMPANY_AGENTS;
  const departments = Array.isArray(snapshot.departments) && snapshot.departments.length > 0
    ? snapshot.departments.map((department) => {
      const defaultDepartment = getCompanyDepartment(department.id);
      return {
        ...defaultDepartment,
        ...department,
      };
    })
    : COMPANY_DEPARTMENTS;
  const tasks = sortTasks(snapshot.tasks ?? []);
  const approvals = Array.isArray(snapshot.approvals) ? snapshot.approvals : [];
  const logs = Array.isArray(snapshot.logs) ? snapshot.logs : [];
  const workspaces = Array.isArray(snapshot.workspaces) ? snapshot.workspaces : [];
  const taskTemplates = Array.isArray(snapshot.taskTemplates) ? snapshot.taskTemplates : [];
  const activeWorkspaceId = snapshot.settings?.activeWorkspaceId ?? workspaces[0]?.id ?? null;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? null;
  const leadAgent = agents.find((agent) => agent.id === activeWorkspace?.leadAgentId) ?? agents[0] ?? COMPANY_AGENTS[0];
  const activeTemplate = taskTemplates.find((template) => template.workspaceId === activeWorkspace?.id) ?? taskTemplates[0] ?? null;
  const activeMission = tasks.find((task) => task.isActive || isTaskActive(task)) ?? tasks[0] ?? null;
  const currentGoal = activeTemplate?.objective || activeMission?.objective || leadAgent.defaultFocus || '';

  const departmentsById = new Map(departments.map((department) => [department.id, department]));
  const tasksByOwner = new Map();
  const tasksByDepartment = new Map();
  for (const task of tasks) {
    const ownerKey = task.ownerAgentId || leadAgent.id;
    const departmentKey = task.departmentId || leadAgent.departmentId;
    tasksByOwner.set(ownerKey, [...(tasksByOwner.get(ownerKey) ?? []), task]);
    tasksByDepartment.set(departmentKey, [...(tasksByDepartment.get(departmentKey) ?? []), task]);
  }

  const agentsByDepartment = new Map();
  for (const agent of agents) {
    if (!agentsByDepartment.has(agent.departmentId)) {
      agentsByDepartment.set(agent.departmentId, agent);
    }
  }

  const missionContext = {
    leadAgent,
    departmentsById,
    currentGoal,
    topBlocker: tasks.find((task) => ['blocked', 'waiting-approval', 'failed'].includes(task.status))?.blockedReason || '',
    pendingApprovalLabel: approvals.find((approval) => approval.decision === 'pending')?.reason || '',
  };

  const missions = tasks.map((task) => buildMission(task, {
    ...missionContext,
    departmentsById,
  }));
  const pipelineStages = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    missions: missions.filter((mission) => mission.pipelineStage.id === stage.id),
    count: missions.filter((mission) => mission.pipelineStage.id === stage.id).length,
    activeCount: missions.filter((mission) => mission.pipelineStage.id === stage.id && mission.isActive).length,
  }));

  const enrichedAgents = agents.map((agent) => buildAgent(agent, {
    ...missionContext,
    departmentsById,
    ownedTasksByAgent: tasksByOwner,
    activeMission: missions.find((mission) => mission.id === activeMission?.id) ?? null,
  }));

  const tasksById = new Map(missions.map((mission) => [mission.id, mission]));
  const enrichedDepartments = departments.map((department) => buildDepartment(department, {
    tasksByDepartment,
    agentsByDepartment,
  }));

  const queueDepth = tasks.filter((task) => task.status === 'queued').length;
  const activeCount = missions.filter((mission) => mission.isActive).length;
  const completedCount = missions.filter((mission) => mission.status === 'completed').length;
  const blockedCount = missions.filter((mission) => ['blocked', 'failed', 'waiting-approval'].includes(mission.status)).length;
  const pendingApprovals = approvals.filter((approval) => approval.decision === 'pending');

  const archive = missions.filter((mission) => mission.status === 'completed').slice(0, 8);
  const activeMissions = missions.filter((mission) => mission.isActive);
  const blockers = missions.filter((mission) => ['waiting-approval', 'blocked', 'failed'].includes(mission.status)).slice(0, 6);

  return {
    activeWorkspace,
    activeTemplate,
    leadAgent,
    currentGoal,
    pipelineStages,
    metrics: {
      queueDepth,
      activeCount,
      completedCount,
      blockedCount,
      pendingApprovals: pendingApprovals.length,
      staffCount: enrichedAgents.length,
    },
    agents: enrichedAgents,
    departments: enrichedDepartments,
    missions,
    missionIndex: tasksById,
    activeMission: missions.find((mission) => mission.id === activeMission?.id) ?? activeMissions[0] ?? missions[0] ?? null,
    activeMissions,
    archive,
    blockers,
    approvals: pendingApprovals,
    logs,
    tasks,
  };
}
