import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('recorderApi', {
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  setDisplaySourceId: (sourceId) => ipcRenderer.invoke('set-display-source-id', sourceId),
  saveRecording: (buffer, suggestedName) =>
    ipcRenderer.invoke('save-recording', buffer, suggestedName)
})
