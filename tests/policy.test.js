import { describe, expect, it } from 'vitest';
import { DEFAULT_PERMISSIONS } from '../src/core/defaultState.js';
import { evaluatePermission } from '../src/core/policy.js';

describe('policy', () => {
  it('blocks self-edit by default', () => {
    const gate = evaluatePermission({
      permissions: DEFAULT_PERMISSIONS,
      action: 'selfEdit',
      scope: 'orchestrator',
      requireHighRiskApproval: true,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.requiresApproval).toBe(false);
  });

  it('requires approval for merge even when the permission is enabled', () => {
    const gate = evaluatePermission({
      permissions: {
        ...DEFAULT_PERMISSIONS,
        merge: true,
      },
      action: 'merge',
      requireHighRiskApproval: true,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.requiresApproval).toBe(true);
  });

  it('allows write when enabled and the action is not high risk', () => {
    const gate = evaluatePermission({
      permissions: DEFAULT_PERMISSIONS,
      action: 'write',
      requireHighRiskApproval: true,
    });

    expect(gate.allowed).toBe(true);
    expect(gate.requiresApproval).toBe(false);
  });
});
