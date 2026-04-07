import { contextBridge, ipcRenderer } from 'electron';

function subscribe(channel, callback) {
  const handler = (_event, snapshot) => callback(snapshot);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('operator', {
  getSnapshot: () => ipcRenderer.invoke('operator:get-snapshot'),
  createTask: (payload) => ipcRenderer.invoke('operator:create-task', payload),
  updateSettings: (patch) => ipcRenderer.invoke('operator:update-settings', patch),
  setLocale: (locale) => ipcRenderer.invoke('operator:set-locale', locale),
  setWorkspacePath: (workspacePath) => ipcRenderer.invoke('operator:set-workspace', workspacePath),
  createWorkspace: (payload) => ipcRenderer.invoke('operator:create-workspace', payload),
  updateWorkspace: (workspaceId, patch) => ipcRenderer.invoke('operator:update-workspace', workspaceId, patch),
  setActiveWorkspace: (workspaceId) => ipcRenderer.invoke('operator:set-active-workspace', workspaceId),
  updateWorkspaceTemplate: (templateId, patch) => ipcRenderer.invoke('operator:update-workspace-template', templateId, patch),
  pause: () => ipcRenderer.invoke('operator:pause'),
  resume: () => ipcRenderer.invoke('operator:resume'),
  toggleAutoLoop: () => ipcRenderer.invoke('operator:toggle-auto-loop'),
  seedDemoTasks: () => ipcRenderer.invoke('operator:seed-demo'),
  seedWorkspaceTask: (templateId = null) => ipcRenderer.invoke('operator:seed-workspace-task', templateId),
  approveTask: (payload) => ipcRenderer.invoke('operator:approve-task', payload),
  rejectTask: (payload) => ipcRenderer.invoke('operator:reject-task', payload),
  runOnce: () => ipcRenderer.invoke('operator:run-once'),
  selectWorkspace: () => ipcRenderer.invoke('operator:select-workspace'),
  subscribe: (callback) => subscribe('operator:snapshot', callback),
});
