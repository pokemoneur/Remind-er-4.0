const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("remiDesktop", {
  load: () => ipcRenderer.invoke("remi:load"), save: data => ipcRenderer.invoke("remi:save", data),
  pickScreen: () => ipcRenderer.invoke("remi:pick-screen"), chooseScreen: id => ipcRenderer.invoke("remi:screen-choice", id),
  clearScreen: () => ipcRenderer.send("remi:screen-clear"), resize: height => ipcRenderer.send("remi:resize", height),
  openUrl: value => ipcRenderer.send("remi:open-url", value), quit: () => ipcRenderer.send("remi:quit"),
  actuate: action => ipcRenderer.invoke("remi:actuate", action), navigate: action => ipcRenderer.invoke("remi:navigate", action), focusSelected: () => ipcRenderer.invoke("remi:focus-selected"),
  onScreenEnded: callback => ipcRenderer.on("remi:screen-ended", () => callback())
});

