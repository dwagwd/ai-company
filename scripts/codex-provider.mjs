#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildScriptedPlan, buildScriptedReview } from '../src/core/provider.js';
import { tryParseJson } from '../src/core/process.js';

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', reject);
  });
}

function terminateChild(child, signal) {
  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function resolveCodexBinary() {
  const candidates = [
    process.env.AI_OPERATOR_CODEX_BINARY,
    'codex',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'codex') {
      return candidate;
    }

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function buildPlanPrompt(payload) {
  const task = payload.task ?? {};
  const memory = Array.isArray(payload.memory) ? payload.memory : [];
  return [
    'You are the planning agent for a local AI operator.',
    'Return only a JSON object that matches the output schema.',
    'Do not use markdown, code fences, or extra commentary.',
    'Do not run shell commands or read files. Use only the JSON provided below.',
    '',
    'Task JSON:',
    JSON.stringify(task, null, 2),
    '',
    'Recent memory JSON:',
    JSON.stringify(memory, null, 2),
    '',
    'Requirements:',
    '- summary: one sentence.',
    '- workerPrompt: direct instructions for the worker agent.',
    '- reviewPrompt: direct instructions for the reviewer agent.',
    '- steps: 3 to 5 steps.',
    '- Include at least one reviewer step.',
    '- Prefer read -> execute -> test -> review.',
    '- Keep the task scoped to the provided workspace.',
    '- If the task scope is orchestrator, avoid self-edit unless explicitly required.',
  ].join('\n');
}

function buildReviewPrompt(payload) {
  const task = payload.task ?? {};
  const results = Array.isArray(payload.results) ? payload.results : [];
  const memory = Array.isArray(payload.memory) ? payload.memory : [];
  return [
    'You are the reviewer agent for a local AI operator.',
    'Return only a JSON object that matches the output schema.',
    'Do not use markdown, code fences, or extra commentary.',
    'Do not run shell commands or read files. Use only the JSON provided below.',
    '',
    'Task JSON:',
    JSON.stringify(task, null, 2),
    '',
    'Step results JSON:',
    JSON.stringify(results, null, 2),
    '',
    'Recent memory JSON:',
    JSON.stringify(memory, null, 2),
    '',
    'Requirements:',
    '- approved: true only if the task is complete and safe.',
    '- needsFollowUp: true when another maintenance task should be created.',
    '- notes: concise but specific.',
    '- followUpTitle and followUpObjective: fill these only when follow-up is needed.',
  ].join('\n');
}

function buildPlanSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'workerPrompt', 'reviewPrompt', 'steps'],
    properties: {
      summary: { type: 'string' },
      workerPrompt: { type: 'string' },
      reviewPrompt: { type: 'string' },
      steps: {
        type: 'array',
        minItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'role', 'kind', 'permission', 'note'],
          properties: {
            title: { type: 'string' },
            role: { type: 'string', enum: ['worker', 'reviewer'] },
            kind: { type: 'string' },
            permission: { type: 'string', enum: ['read', 'write', 'test', 'pr', 'merge', 'deploy', 'selfEdit'] },
            command: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
    },
  };
}

function buildReviewSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['approved', 'needsFollowUp', 'notes', 'followUpTitle', 'followUpObjective'],
    properties: {
      approved: { type: 'boolean' },
      needsFollowUp: { type: 'boolean' },
      notes: { type: 'string' },
      followUpTitle: { type: 'string' },
      followUpObjective: { type: 'string' },
    },
  };
}

function spawnCodex(binary, args, prompt, cwd, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env: {
        ...process.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let closed = false;
    let timeoutTimer = null;
    let hardKillTimer = null;
    const hardKillDelayMs = Number(process.env.AI_OPERATOR_HARD_KILL_DELAY_MS ?? 2_000);

    const clearTimers = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (hardKillTimer) {
        clearTimeout(hardKillTimer);
        hardKillTimer = null;
      }
    };

    timeoutTimer = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          terminateChild(child, 'SIGTERM');
          hardKillTimer = setTimeout(() => {
            if (!closed) {
              terminateChild(child, 'SIGKILL');
            }
          }, hardKillDelayMs);
        }, timeoutMs)
      : null;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      clearTimers();
      reject(error);
    });

    child.on('close', (code, signal) => {
      closed = true;
      clearTimers();
      resolve({
        code: timedOut
          ? 124
          : typeof code === 'number'
            ? code
            : signal
              ? 1
              : 0,
        signal,
        stdout,
        stderr,
        timedOut,
      });
    });

    if (prompt) {
      child.stdin.write(prompt);
    }
    child.stdin.end();
  });
}

function buildFallbackEnvelope(kind, task, results, memory, reason) {
  const result = kind === 'review'
    ? buildScriptedReview(task, results, memory)
    : buildScriptedPlan(task, memory);

  return {
    provider: 'codex',
    kind,
    ok: false,
    fallback: true,
    reason,
    result,
  };
}

async function runCodex(kind, payload) {
  const task = isObject(payload.task) ? payload.task : {};
  const memory = Array.isArray(payload.memory) ? payload.memory : [];
  const results = Array.isArray(payload.results) ? payload.results : [];
  const workspacePath = String(task.workspacePath ?? payload.workspacePath ?? '').trim();
  const binary = resolveCodexBinary();

  if (!workspacePath) {
    return buildFallbackEnvelope(kind, task, results, memory, 'Workspace path is required');
  }

  if (!binary) {
    return buildFallbackEnvelope(kind, task, results, memory, 'Codex binary not found');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'ai-operator-codex-'));
  const schemaPath = join(tempDir, `${kind}.schema.json`);
  const outputPath = join(tempDir, `${kind}.last-message.txt`);

  try {
    const schema = kind === 'review' ? buildReviewSchema() : buildPlanSchema();
    await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');

    const args = [
      'exec',
      '--cd',
      workspacePath,
      '--skip-git-repo-check',
      '--ephemeral',
      '--full-auto',
      '--color',
      'never',
      '--output-schema',
      schemaPath,
      '--output-last-message',
      outputPath,
      '-',
    ];

    const prompt = kind === 'review'
      ? buildReviewPrompt(payload)
      : buildPlanPrompt(payload);

    const execution = await spawnCodex(binary, args, prompt, workspacePath);
    const lastMessage = await readFile(outputPath, 'utf8').catch(() => execution.stdout);
    const parsed = tryParseJson(lastMessage) ?? tryParseJson(execution.stdout);
    const result = isObject(parsed)
      ? (isObject(parsed.result) ? parsed.result : parsed)
      : null;

    if (!result) {
      if (execution.stderr.trim()) {
        console.error(`[codex-provider] ${execution.stderr.trim()}`);
      }
      return buildFallbackEnvelope(kind, task, results, memory, 'Codex returned no structured result');
    }

    return {
      provider: 'codex',
      kind,
      ok: execution.code === 0 && !execution.timedOut,
      fallback: false,
      result,
      diagnostics: {
        binary,
        code: execution.code,
        signal: execution.signal,
        timedOut: execution.timedOut,
      },
    };
  } catch (error) {
    console.error(`[codex-provider] ${error.message}`);
    return buildFallbackEnvelope(kind, task, results, memory, error.message);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const rawInput = String(process.env.AI_OPERATOR_INPUT ?? '').trim() || await readStdin();
  const parsed = tryParseJson(rawInput);
  const envelope = isObject(parsed) && isObject(parsed.payload) && typeof parsed.kind === 'string'
    ? parsed
    : { kind: process.env.AI_OPERATOR_KIND || 'plan', payload: isObject(parsed) ? parsed : {} };

  const kind = envelope.kind === 'review' ? 'review' : 'plan';
  const payload = isObject(envelope.payload) ? envelope.payload : {};
  const result = await runCodex(kind, payload);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(`[codex-provider] ${error.message}`);
  process.exitCode = 1;
});
