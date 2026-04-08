import { runShellCommand, tryParseJson } from './process.js';
import { createMemoryEntry } from './defaultState.js';
import { normalizeStep } from './defaultState.js';

function stepTitle(step) {
  return step.title || step.kind || 'Step';
}

function taskSummary(task) {
  return [task.title, task.objective].filter(Boolean).join(' — ');
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function unwrapProviderPayload(parsed, kind) {
  if (!isObject(parsed)) {
    return null;
  }

  if (hasOwn(parsed, 'fallback') && parsed.fallback === true) {
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
      ? `: ${parsed.reason.trim()}`
      : '';
    throw new Error(`Command provider returned a fallback response for ${kind}${reason}`);
  }

  if (hasOwn(parsed, 'ok') && parsed.ok === false) {
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
      ? `: ${parsed.reason.trim()}`
      : '';
    throw new Error(`Command provider reported a failed execution for ${kind}${reason}`);
  }

  if (isObject(parsed.result)) {
    return parsed.result;
  }

  if (kind === 'plan') {
    if (isObject(parsed.plan)) return parsed.plan;
    if (isObject(parsed.payload)) return parsed.payload;
  }

  if (kind === 'review') {
    if (isObject(parsed.review)) return parsed.review;
    if (isObject(parsed.payload)) return parsed.payload;
  }

  return parsed;
}

function extractKeywords(text) {
  return String(text ?? '')
    .split(/[\s,.;:!?()/\\[\]{}"'\-]+/g)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => word.length > 3)
    .slice(0, 6);
}

function buildScriptedPlan(task, memory = []) {
  const keywords = extractKeywords(task.objective || task.title);
  const focus = keywords[0] || 'workspace';
  const memoryHint = memory[0]?.summary ? ` Recent memory: ${memory[0].summary}` : '';
  const selfEditPermission = task.scope === 'orchestrator' ? 'selfEdit' : 'write';

  return {
    summary: `Review ${focus}, execute the requested change, verify the result, and record the outcome.${memoryHint}`,
    workerPrompt: `You are the worker agent. Focus on: ${taskSummary(task)}. Keep the output concise and concrete.`,
    reviewPrompt: `You are the reviewer agent. Assess whether the task completed safely and whether a follow-up is needed.`,
    steps: [
      {
        title: 'Review context',
        role: 'worker',
        kind: 'analysis',
        permission: 'read',
        note: 'Inspect the workspace, task objective, and recent memory.',
      },
      {
        title: 'Execute change',
        role: 'worker',
        kind: 'execute',
        permission: selfEditPermission,
        note: 'Make the requested change with the current permissions.',
      },
      {
        title: 'Run verification',
        role: 'worker',
        kind: 'test',
        permission: 'test',
        note: 'Run the smallest meaningful validation for this task.',
      },
      {
        title: 'Reviewer pass',
        role: 'reviewer',
        kind: 'review',
        permission: 'read',
        note: 'Check whether the result satisfies the objective and policy.',
      },
    ],
  };
}

function normalizePlan(rawPlan, task, memory) {
  if (!rawPlan || typeof rawPlan !== 'object') {
    return buildScriptedPlan(task, memory);
  }

  const steps = Array.isArray(rawPlan.steps) && rawPlan.steps.length > 0
    ? rawPlan.steps.map((step, index) => normalizeStep(step, index))
    : buildScriptedPlan(task, memory).steps;

  return {
    summary: typeof rawPlan.summary === 'string' && rawPlan.summary.trim()
      ? rawPlan.summary.trim()
      : buildScriptedPlan(task, memory).summary,
    workerPrompt: typeof rawPlan.workerPrompt === 'string' ? rawPlan.workerPrompt : '',
    reviewPrompt: typeof rawPlan.reviewPrompt === 'string' ? rawPlan.reviewPrompt : '',
    steps,
  };
}

function normalizeReview(rawReview, task, results, memory) {
  if (!rawReview || typeof rawReview !== 'object') {
    return buildScriptedReview(task, results, memory);
  }

  const approved = typeof rawReview.approved === 'boolean'
    ? rawReview.approved
    : buildScriptedReview(task, results, memory).approved;
  const needsFollowUp = typeof rawReview.needsFollowUp === 'boolean'
    ? rawReview.needsFollowUp
    : buildScriptedReview(task, results, memory).needsFollowUp;

  return {
    approved,
    needsFollowUp,
    notes: typeof rawReview.notes === 'string' && rawReview.notes.trim()
      ? rawReview.notes.trim()
      : buildScriptedReview(task, results, memory).notes,
    followUpTitle: typeof rawReview.followUpTitle === 'string' ? rawReview.followUpTitle : '',
    followUpObjective: typeof rawReview.followUpObjective === 'string' ? rawReview.followUpObjective : '',
  };
}

function buildScriptedReview(task, results, memory) {
  const failures = results.filter((result) => result.exitCode !== 0 || result.status === 'failed');
  const recentIssues = memory.filter((entry) => entry.outcome !== 'completed').slice(0, 3);
  const needsFollowUp = task.kind === 'maintenance' && recentIssues.length > 0;

  return {
    approved: failures.length === 0,
    needsFollowUp,
    notes: failures.length > 0
      ? `Review found ${failures.length} failing step(s).`
      : needsFollowUp
        ? `Review found recent issues that deserve a follow-up improvement.`
        : `The task completed cleanly and matches the current policy.`,
    followUpTitle: needsFollowUp ? `Follow-up: ${task.title}` : '',
    followUpObjective: needsFollowUp
      ? `Stabilize recent failures and reduce the risk of regressions.`
      : '',
  };
}

export class ScriptedProvider {
  async plan({ task, memory = [] } = {}) {
    return buildScriptedPlan(task, memory);
  }

  async review({ task, results = [], memory = [] } = {}) {
    return buildScriptedReview(task, results, memory);
  }
}

export class CommandProvider {
  constructor(command, options = {}) {
    this.command = command;
    this.options = options;
  }

  async #invoke(kind, payload) {
    const command = String(this.command ?? '').trim();
    if (!command) {
      throw new Error('Provider command is required in command mode');
    }

    const response = await runShellCommand(command, {
      cwd: this.options.cwd,
      env: {
        AI_OPERATOR_KIND: kind,
        AI_OPERATOR_INPUT: JSON.stringify(payload),
        ...(this.options.env ?? {}),
      },
      timeoutMs: this.options.timeoutMs,
      input: JSON.stringify({
        kind,
        payload,
      }),
    });

    const parsed = tryParseJson(response.stdout);
    return {
      raw: response,
      parsed,
    };
  }

  async plan({ task, memory = [] } = {}) {
    const { parsed, raw } = await this.#invoke('plan', { task, memory });
    const payload = unwrapProviderPayload(parsed, 'plan');
    if (payload) {
      return normalizePlan(payload, task, memory);
    }

    const fallback = buildScriptedPlan(task, memory);
    return {
      ...fallback,
      summary: raw.stdout.trim() || fallback.summary,
    };
  }

  async review({ task, results = [], memory = [] } = {}) {
    const { parsed, raw } = await this.#invoke('review', { task, results, memory });
    const payload = unwrapProviderPayload(parsed, 'review');
    if (payload) {
      return normalizeReview(payload, task, results, memory);
    }

    return {
      ...buildScriptedReview(task, results, memory),
      notes: raw.stdout.trim() || buildScriptedReview(task, results, memory).notes,
    };
  }
}

export function createProvider(settings = {}) {
  if (settings.providerMode === 'command') {
    const cwd = String(settings.workspacePath ?? '').trim();
    if (!cwd) {
      throw new Error('Workspace path is required for command mode');
    }

    return new CommandProvider(settings.providerCommand, {
      cwd,
      timeoutMs: settings.providerTimeoutMs,
      env: settings.providerEnv ?? {},
    });
  }

  return new ScriptedProvider();
}

export { buildScriptedPlan, buildScriptedReview, normalizePlan, normalizeReview, createMemoryEntry };
