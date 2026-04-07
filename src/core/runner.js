import { runShellCommand } from './process.js';

function formatSimulatedOutput(step, context = {}) {
  const lines = [
    `[${context.task?.id ?? 'task'}] ${step.role ?? 'worker'} / ${step.kind ?? 'execute'} :: ${stepTitle(step)}`,
  ];

  if (step.note) {
    lines.push(step.note);
  }

  if (step.command) {
    lines.push(`command: ${step.command}`);
  }

  return lines.join('\n');
}

function stepTitle(step) {
  return step.title || step.kind || 'Step';
}

export class SimulatedRunner {
  async run(step, context = {}) {
    const stdout = formatSimulatedOutput(step, context);
    const isFailing = /fail|throw|error/i.test(`${step.command ?? ''} ${step.note ?? ''} ${step.title ?? ''}`);

    return {
      code: isFailing ? 1 : 0,
      signal: null,
      stdout,
      stderr: isFailing ? `Simulated failure for ${stepTitle(step)}` : '',
      timedOut: false,
    };
  }
}

export class ShellRunner {
  constructor(command = '', options = {}) {
    this.command = command;
    this.options = options;
  }

  async run(step, context = {}) {
    const command = String(step.command ?? '').trim() || String(this.command ?? '').trim();

    if (!command) {
      throw new Error('Runner command is required in shell mode');
    }

    return runShellCommand(command, {
      cwd: this.options.cwd,
      env: {
        ...(this.options.env ?? {}),
        AI_OPERATOR_TASK_ID: context.task?.id ?? '',
        AI_OPERATOR_STEP_ID: step.id ?? '',
      },
      timeoutMs: this.options.timeoutMs,
      onStdout: context.onStdout,
      onStderr: context.onStderr,
    });
  }
}

export function createRunner(settings = {}) {
  if (settings.runnerMode === 'shell') {
    const cwd = String(settings.workspacePath ?? '').trim();
    if (!cwd) {
      throw new Error('Workspace path is required for shell mode');
    }

    return new ShellRunner(settings.runnerCommand, {
      cwd,
      timeoutMs: settings.runnerTimeoutMs,
      env: settings.runnerEnv ?? {},
    });
  }

  return new SimulatedRunner();
}
