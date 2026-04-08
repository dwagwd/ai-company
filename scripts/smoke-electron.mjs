import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import process from 'node:process';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = await mkdtemp(join(tmpdir(), 'ai-company-smoke-'));
const statePath = join(tempDir, 'state.json');
const screenshotPath = join(rootDir, 'output', 'smoke', 'company-command-center.png');

await mkdir(dirname(screenshotPath), { recursive: true });

const app = await electron.launch({
  args: [rootDir],
  cwd: rootDir,
  env: {
    ...process.env,
    AI_OPERATOR_STATE_PATH: statePath,
  },
});

try {
  const page = await app.firstWindow();

  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('heading', { name: 'Mission Pipeline' }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'Staff Roster' }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'Completed Missions' }).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'Review Desk' }).waitFor({ state: 'visible' });
  for (const label of ['Plan', 'Execute', 'Review', 'Archive']) {
    await page.locator('.pipeline-track').getByRole('button', { name: label, exact: true }).waitFor({ state: 'visible' });
  }

  const workerPromptCount = await page.getByText('Worker prompt').count();
  if (workerPromptCount > 0) {
    throw new Error('Worker prompt should not be visible in the command center UI.');
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const screenshotStats = await stat(screenshotPath);
  if (screenshotStats.size === 0) {
    throw new Error('Smoke screenshot was created but is empty.');
  }

  console.log(`Smoke screenshot saved to ${screenshotPath}`);
} finally {
  await app.close();
  await rm(tempDir, { recursive: true, force: true });
}
