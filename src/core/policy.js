import { DEFAULT_PERMISSIONS } from './defaultState.js';

export const HIGH_RISK_ACTIONS = new Set(['merge', 'deploy', 'selfEdit']);

export function normalizePermissions(input = {}) {
  return {
    ...DEFAULT_PERMISSIONS,
    ...(input ?? {}),
  };
}

export function inferRequiredAction(step = {}) {
  if (step.permission) return step.permission;

  const kind = String(step.kind ?? '').toLowerCase();
  const title = String(step.title ?? '').toLowerCase();
  const text = `${kind} ${title}`;

  if (text.includes('review') || text.includes('audit') || text.includes('inspect')) {
    return 'read';
  }
  if (text.includes('test') || text.includes('verify') || text.includes('check')) {
    return 'test';
  }
  if (text.includes('merge')) return 'merge';
  if (text.includes('deploy')) return 'deploy';
  if (text.includes('self')) return 'selfEdit';
  if (text.includes('pr') || text.includes('pull request')) return 'pr';

  return 'write';
}

export function evaluatePermission({
  permissions = DEFAULT_PERMISSIONS,
  action = 'write',
  requireHighRiskApproval = true,
  scope = 'workspace',
} = {}) {
  const normalized = normalizePermissions(permissions);

  if (!(action in normalized)) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Unknown action: ${action}`,
    };
  }

  if (!normalized[action]) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Permission "${action}" is disabled`,
    };
  }

  if (scope === 'orchestrator' && action !== 'read' && action !== 'test' && !normalized.selfEdit) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: 'Self-editing the orchestration core is disabled',
    };
  }

  if (requireHighRiskApproval && HIGH_RISK_ACTIONS.has(action)) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: `High-risk action "${action}" requires approval`,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    reason: 'Allowed',
  };
}
