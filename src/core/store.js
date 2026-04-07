import { EventEmitter } from 'node:events';
import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import {
  createDefaultState,
  createLogEntry,
  deepClone,
  normalizeState,
  nowIso,
} from './defaultState.js';

export class PersistentStore extends EventEmitter {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.state = createDefaultState();
    this.saveTimer = null;
    this.savePromise = Promise.resolve();
  }

  async init() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.state = normalizeState(JSON.parse(raw));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.state = createDefaultState();
      } else if (error instanceof SyntaxError) {
        await this.#recoverFromCorruptState(error);
      } else {
        throw error;
      }
    }

    this.emit('change', this.snapshot(), { type: 'init' });
    return this.snapshot();
  }

  async #recoverFromCorruptState(error) {
    const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await rename(this.filePath, backupPath);
    } catch {
      // If the backup move fails, continue with a clean state.
    }

    this.state = createDefaultState();
    this.state.logs.unshift(
      createLogEntry({
        source: 'store',
        level: 'warn',
        message: `Recovered a corrupt state file (${error.message}). Backed up the original to ${backupPath}.`,
      }),
    );
    this.state.logs = this.state.logs.slice(0, 500);
    this.queueSave();
  }

  snapshot() {
    return deepClone(this.state);
  }

  update(mutator, meta = {}) {
    const draft = deepClone(this.state);
    const result = mutator(draft);
    this.state = normalizeState(result ?? draft);
    this.state.system.lastActivityAt = nowIso();
    this.emit('change', this.snapshot(), meta);
    this.queueSave();
    return this.snapshot();
  }

  queueSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      void this.flush();
    }, 100);
  }

  async flush() {
    const payload = JSON.stringify(this.state, null, 2);
    this.savePromise = this.savePromise
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, payload, 'utf8');
      })
      .catch((error) => {
        this.emit('error', error);
      });

    return this.savePromise;
  }
}
