const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('achievements', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  showAchievement: (payload) => ipcRenderer.invoke('achievement:show', payload),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  splitWithDeepSeek: (input) => ipcRenderer.invoke('deepseek:split', input),
})
