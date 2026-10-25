const { contextBridge, ipcRenderer } = require("electron");
const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);
const on = (channel) => (callback) => {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("margin", {
  bootstrap: invoke("app:bootstrap"),
  chooseWorkspace: invoke("workspace:choose"),
  openWorkspace: invoke("workspace:open"),
  tree: invoke("workspace:tree"),
  read: invoke("file:read"),
  save: invoke("file:save"),
  create: invoke("file:create"),
  move: invoke("file:move"),
  duplicate: invoke("file:duplicate"),
  incoming: invoke("file:incoming"),
  trash: invoke("file:trash"),
  attachment: invoke("image:save"),
  selectImage: invoke("image:choose"),
  clipboardImage: invoke("image:clipboard"),
  settings: invoke("app:settings"),
  persist: invoke("app:persist"),
  openRecovery: invoke("app:recovery"),
  closeConfirmed: invoke("app:close-confirmed"),
  external: invoke("app:external"),
  terminalCreate: invoke("terminal:create"),
  terminalWrite: invoke("terminal:write"),
  terminalResize: invoke("terminal:resize"),
  terminalClose: invoke("terminal:close"),
  terminalBuffer: invoke("terminal:buffer"),
  onFiles: on("workspace:changed"),
  onTerminalData: on("terminal:data"),
  onTerminalExit: on("terminal:exit"),
  onClose: on("app:close-requested"),
  onCommand: on("app:command"),
});
