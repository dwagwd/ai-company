import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PersistentStore } from '../src/core/store.js';

describe('persistent store', () => {
  it('backs up a corrupt state file and starts from a clean default', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ai-operator-store-'));
    const filePath = path.join(dir, 'state.json');

    await writeFile(filePath, '{ not valid json', 'utf8');

    const store = new PersistentStore(filePath);
    const snapshot = await store.init();
    const files = await readdir(dir);

    expect(snapshot.workspaces[0].name).toBe('Workspace 1');
    expect(snapshot.workspaces[0].path).toBe('');
    expect(snapshot.settings.activeWorkspaceId).toBe(snapshot.workspaces[0].id);
    expect(snapshot.logs[0].level).toBe('warn');
    expect(snapshot.logs[0].message).toContain('Recovered a corrupt state file');
    expect(files.some((name) => name.startsWith('state.json.corrupt-'))).toBe(true);
  });
});
