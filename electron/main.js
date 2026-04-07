import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { PersistentStore } from '../src/core/store.js';
import { OperatorOrchestrator } from '../src/core/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow = null;
let store = null;
let orchestrator = null;
let storePath = null;

function broadcastSnapshot(snapshot) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('operator:snapshot', snapshot);
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1160,
    minHeight: 760,
    backgroundColor: '#071018',
    title: 'Local AI Operator',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    const rendererIndex = join(app.getAppPath(), 'dist', 'renderer', 'index.html');
    if (!existsSync(rendererIndex)) {
      throw new Error(`Renderer build not found at ${rendererIndex}`);
    }
    await mainWindow.loadFile(rendererIndex);
  }
}

app.on('window-all-closed', async () => {
  if (orchestrator) {
    await orchestrator.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

app.whenReady().then(async () => {
  app.setName('Local AI Operator');
  const dataDir = join(app.getPath('userData'), 'local-ai-operator');
  storePath = join(dataDir, 'state.json');
  store = new PersistentStore(storePath);
  orchestrator = new OperatorOrchestrator(store);
  store.on('error', (error) => {
    console.error('[store]', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('Local AI Operator', `Failed to save state: ${error.message}`);
    }
  });

  await orchestrator.init();

  orchestrator.on('change', (snapshot) => {
    broadcastSnapshot(snapshot);
  });

  ipcMain.handle('operator:get-snapshot', () => orchestrator.snapshot());
  ipcMain.handle('operator:create-task', (_event, input) => orchestrator.createTask(input));
  ipcMain.handle('operator:update-settings', (_event, patch) => orchestrator.updateSettings(patch));
  ipcMain.handle('operator:set-locale', (_event, locale) => orchestrator.setLocale(locale));
  ipcMain.handle('operator:set-workspace', (_event, workspacePath) => orchestrator.setWorkspacePath(workspacePath));
  ipcMain.handle('operator:create-workspace', (_event, input) => orchestrator.createWorkspace(input));
  ipcMain.handle('operator:update-workspace', (_event, workspaceId, patch) => orchestrator.updateWorkspace(workspaceId, patch));
  ipcMain.handle('operator:set-active-workspace', (_event, workspaceId) => orchestrator.setActiveWorkspace(workspaceId));
  ipcMain.handle('operator:update-workspace-template', (_event, templateId, patch) => orchestrator.updateWorkspaceTemplate(templateId, patch));
  ipcMain.handle('operator:pause', () => orchestrator.pause());
  ipcMain.handle('operator:resume', () => orchestrator.resume());
  ipcMain.handle('operator:toggle-auto-loop', () => orchestrator.toggleAutoLoop());
  ipcMain.handle('operator:seed-demo', () => orchestrator.seedDemoTasks());
  ipcMain.handle('operator:seed-workspace-task', (_event, templateId) => orchestrator.seedWorkspaceTask(templateId));
  ipcMain.handle('operator:approve-task', async (_event, payload) => orchestrator.approveTask(payload.taskId, payload.approvalId));
  ipcMain.handle('operator:reject-task', (_event, payload) => orchestrator.rejectTask(payload.taskId, payload.approvalId));
  ipcMain.handle('operator:run-once', () => orchestrator.runOnce());
  ipcMain.handle('operator:select-workspace', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select workspace folder',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const [selected] = result.filePaths;
    return selected;
  });

  await createWindow();
  await orchestrator.start();
  broadcastSnapshot(orchestrator.snapshot());
});

app.on('before-quit', async () => {
  if (orchestrator) {
    await orchestrator.stop();
  }
});
