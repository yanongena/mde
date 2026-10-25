import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
  session,
  Menu,
  clipboard,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chokidar from "chokidar";
import { Workspace, DEFAULT_IGNORES } from "./workspace.mjs";
import { Transactions } from "./transactions.mjs";
import { readJSON, writeJSON } from "./storage.mjs";
import { Terminals, installedShells } from "./terminals.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
if (process.env.MARGIN_DATA_PATH)
  app.setPath("userData", path.resolve(process.env.MARGIN_DATA_PATH));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "margin-asset",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const defaults = {
  theme: "light",
  autosave: "afterDelay",
  autosaveDelay: 1500,
  attachmentMode: "workspace",
  attachmentFolder: "assets",
  ignored: DEFAULT_IGNORES,
  fontSize: 14,
  indentSize: 2,
  formatOnOpen: true,
  sidebarWidth: 260,
  terminalHeight: 240,
  sidebarVisible: true,
  terminalVisible: false,
  focusMode: false,
};
let win,
  workspace,
  watcher,
  state,
  transactions,
  terminals,
  confirmedClose = false;
let watcherTimer, startupError;
const stateFile = () => path.join(app.getPath("userData"), "state.json");
let stateQueue = Promise.resolve();
function saveState() {
  const snapshot = JSON.parse(JSON.stringify(state));
  const task = stateQueue.then(() => writeJSON(stateFile(), snapshot));
  stateQueue = task.catch((e) => console.error(e));
  return task;
}
const send = (channel, value) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, value);
};

async function openWorkspace(root) {
  const resolved = path.resolve(root);
  if (!(await fs.stat(resolved)).isDirectory())
    throw new Error("Select a folder.");
  const candidate = new Workspace(
    resolved,
    transactions,
    state.settings.ignored,
  );
  await candidate.resolve();
  const entries = await candidate.tree();
  await watcher?.close();
  clearTimeout(watcherTimer);
  await terminals.closeAll();
  workspace = candidate;
  state.workspace = resolved;
  state.recent = [
    resolved,
    ...state.recent.filter((x) => x !== resolved),
  ].slice(0, 12);
  await saveState();
  watcher = chokidar.watch(resolved, {
    ignoreInitial: true,
    ignored: (file) => {
      const rel = path.relative(resolved, file);
      return rel
        .split(path.sep)
        .some(
          (part) =>
            state.settings.ignored.includes(part) ||
            part.startsWith(".margin-"),
        );
    },
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  const changes = new Set();
  watcher.on("all", (_kind, file) => {
    changes.add(path.relative(resolved, file).replace(/\\/g, "/"));
    clearTimeout(watcherTimer);
    watcherTimer = setTimeout(() => {
      send("workspace:changed", [...changes]);
      changes.clear();
    }, 180);
  });
  watcher.on("error", (e) => send("workspace:changed", { error: e.message }));
  return { root: resolved, entries, session: state.sessions[resolved] || null };
}
function requireWorkspace() {
  if (!workspace) throw new Error("Open a workspace first.");
  return workspace;
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (
      event.sender !== win?.webContents ||
      event.senderFrame !== win.webContents.mainFrame
    )
      throw new Error("Untrusted IPC sender.");
    return fn(...args);
  });
}

async function startApplication() {
  await app.whenReady();
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  try {
    state = await readJSON(stateFile(), {
      settings: defaults,
      workspace: null,
      recent: [],
      sessions: {},
    });
  } catch (error) {
    const backup = stateFile() + ".unreadable-" + Date.now();
    await fs.copyFile(stateFile(), backup);
    state = { settings: defaults, workspace: null, recent: [], sessions: {} };
    startupError = `Settings could not be read. Their original contents and recovery drafts were preserved at ${backup}.`;
  }
  state.settings = { ...defaults, ...state.settings };
  transactions = new Transactions(
    path.join(app.getPath("userData"), "recovery"),
  );
  await transactions.recover();
  terminals = new Terminals(send);

  protocol.handle("margin-asset", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "workspace" || !workspace)
        return new Response("", { status: 403 });
      const name = decodeURIComponent(url.pathname.slice(1));
      if (!/\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i.test(name))
        return new Response("", { status: 415 });
      const target = await workspace.resolve(name);
      return net.fetch(pathToFileURL(target).href);
    } catch {
      return new Response("", { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  handle("app:bootstrap", async () => {
    let opened = null,
      error = startupError || null;
    const root = process.env.MARGIN_WORKSPACE || state.workspace;
    if (root)
      try {
        opened = await openWorkspace(root);
      } catch (e) {
        error = e.message;
      }
    return {
      settings: state.settings,
      recent: state.recent,
      workspace: opened,
      error,
      recovery: transactions.blocked,
      shells: installedShells().map((s) => s.name),
      platform: process.platform,
    };
  });
  handle("workspace:choose", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Open a folder in Margin",
    });
    return result.canceled ? null : openWorkspace(result.filePaths[0]);
  });
  handle("workspace:open", (root) => {
    if (typeof root !== "string" || !state.recent.includes(root))
      throw new Error("Choose the folder using the system dialog.");
    return openWorkspace(root);
  });
  handle("workspace:tree", () => requireWorkspace().tree());
  handle("file:read", (name) => requireWorkspace().read(name));
  handle("file:save", (name, text, revision) => {
    if (typeof text !== "string" || text.length > 12 * 1024 * 1024)
      throw new Error("Invalid file content.");
    return requireWorkspace().save(name, text, revision);
  });
  handle("file:create", (name, directory) =>
    requireWorkspace().create(name, directory === true),
  );
  handle("file:move", (from, to) => requireWorkspace().move(from, to));
  handle("file:duplicate", (from, to) => {
    if (!from) throw new Error("Cannot duplicate the workspace root.");
    return requireWorkspace().duplicate(from, to);
  });
  handle("file:incoming", (name) => requireWorkspace().incoming(name));
  handle("file:trash", (name) =>
    requireWorkspace().mutate(async () => {
      if (!name) throw new Error("Cannot delete the workspace root.");
      await shell.trashItem(await workspace.resolve(name));
    }),
  );
  handle("image:save", (doc, bytes, filename) =>
    requireWorkspace().attachment(doc, bytes, filename, state.settings),
  );
  handle("image:clipboard", async (doc) => {
    const items = await clipboard.read();
    for (const item of items) {
      const type = item.types.find((type) =>
        /^image\/(png|jpeg|gif|webp)$/.test(type),
      );
      if (type) {
        const blob = await item.getType(type);
        return requireWorkspace().attachment(
          doc,
          Buffer.from(await blob.arrayBuffer()),
          "screenshot",
          state.settings,
        );
      }
    }
    return null;
  });
  handle("image:choose", async (doc) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
      ],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    return requireWorkspace().attachment(
      doc,
      await fs.readFile(file),
      path.basename(file),
      state.settings,
    );
  });
  handle("app:settings", async (update) => {
    if (!update || typeof update !== "object")
      throw new Error("Invalid settings.");
    const next = { ...state.settings };
    for (const key of [
      "theme",
      "autosave",
      "attachmentMode",
      "attachmentFolder",
    ])
      if (typeof update[key] === "string") next[key] = update[key];
    for (const key of [
      "fontSize",
      "indentSize",
      "sidebarWidth",
      "terminalHeight",
      "autosaveDelay",
    ])
      if (Number.isFinite(update[key])) next[key] = update[key];
    for (const key of [
      "sidebarVisible",
      "terminalVisible",
      "focusMode",
      "formatOnOpen",
    ])
      if (typeof update[key] === "boolean") next[key] = update[key];
    if (
      Array.isArray(update.ignored) &&
      update.ignored.every(
        (s) => typeof s === "string" && s.length < 200 && !/[\\/]/.test(s),
      )
    )
      next.ignored = [...new Set([".git", ...update.ignored])];
    if (
      !["light", "dark"].includes(next.theme) ||
      !["off", "afterDelay", "onBlur"].includes(next.autosave) ||
      !["workspace", "nearby"].includes(next.attachmentMode)
    )
      throw new Error("Invalid preference.");
    if (
      next.fontSize < 10 ||
      next.fontSize > 28 ||
      ![2, 4, 8].includes(next.indentSize)
    )
      throw new Error("Invalid editor size.");
    if (
      path.isAbsolute(next.attachmentFolder) ||
      next.attachmentFolder
        .split(/[\\/]/)
        .some((s) => s === ".." || s === ".git") ||
      /[<>:"|?*]/.test(next.attachmentFolder)
    )
      throw new Error("Attachment folder must be inside the workspace.");
    next.autosaveDelay = Math.max(500, Math.min(60000, next.autosaveDelay));
    const ignoresChanged =
      JSON.stringify(next.ignored) !== JSON.stringify(state.settings.ignored);
    state.settings = next;
    await saveState();
    if (workspace) {
      workspace.ignored = next.ignored;
      if (ignoresChanged) await openWorkspace(workspace.root);
    }
    return next;
  });
  handle("app:persist", async (saved) => {
    const w = requireWorkspace();
    if (!saved || !Array.isArray(saved.tabs) || saved.tabs.length > 100)
      throw new Error("Invalid session.");
    const tabs = [];
    for (const t of saved.tabs) {
      await w.resolve(t.path, true);
      if (typeof t.text !== "string" || t.text.length > 12 * 1024 * 1024)
        throw new Error("Invalid draft.");
      tabs.push({
        path: t.path,
        text: t.text,
        baseline: t.baseline,
        revision: t.revision,
        mode: t.mode,
        dirty: !!t.dirty,
      });
    }
    state.sessions[w.root] = {
      tabs,
      active: saved.active,
      expanded: saved.expanded || [],
      savedAt: new Date().toISOString(),
    };
    await saveState();
  });
  handle("app:recovery", () =>
    shell.openPath(path.join(app.getPath("userData"), "recovery")),
  );
  handle("app:close-confirmed", async () => {
    state.window = {
      bounds: win.getNormalBounds(),
      maximized: win.isMaximized(),
    };
    await saveState();
    await stateQueue;
    await terminals.closeAll();
    confirmedClose = true;
    win.close();
  });
  handle("app:external", (url) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url))
      throw new Error("Only http and https links may open externally.");
    return shell.openExternal(url);
  });
  handle("terminal:create", (name) =>
    terminals.create(requireWorkspace().root, name),
  );
  handle("terminal:write", (id, data) => terminals.write(id, data));
  handle("terminal:resize", (id, cols, rows) =>
    terminals.resize(id, cols, rows),
  );
  handle("terminal:close", (id) => terminals.close(id));
  handle("terminal:buffer", (id) => terminals.sessions.get(id)?.buffer || "");

  function createWindow() {
    confirmedClose = false;
    win = new BrowserWindow({
      width: 1440,
      height: 950,
      ...(state.window?.bounds || {}),
      minWidth: 820,
      minHeight: 560,
      title: "Margin",
      backgroundColor: state.settings.theme === "dark" ? "#191d20" : "#f7f8f5",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(here, "preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    if (state.window?.maximized) win.maximize();
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.on("will-attach-webview", (e) => e.preventDefault());
    win.on("close", (event) => {
      if (!confirmedClose) {
        event.preventDefault();
        send("app:close-requested");
      }
    });
    win.on("closed", () => {
      win = null;
      terminals.closeAll();
    });
    if (process.env.MARGIN_DEV_URL) win.loadURL(process.env.MARGIN_DEV_URL);
    else win.loadFile(path.join(here, "../dist/index.html"));
  }
  const menu = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "Margin",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { role: "hide" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Folder…",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => send("app:command", "open"),
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => send("app:command", "save"),
        },
        { type: "separator" },
        {
          role: "close",
          accelerator: process.platform === "darwin" ? "Cmd+Shift+W" : "Alt+F4",
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "togglefullscreen" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        {
          label: "Developer Tools",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => win?.webContents.toggleDevTools(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  createWindow();
  app.on("activate", () => {
    if (!win) createWindow();
  });
  app.on("window-all-closed", () => {
    terminals.closeAll();
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => {
    if (confirmedClose) terminals.closeAll();
  });
  app.on("will-quit", () => {
    watcher?.close();
    terminals.closeAll();
  });
}
// The ESM entry must finish evaluating before Electron emits ready.
void startApplication().catch((error) => {
  console.error(error);
  dialog.showErrorBox("Margin could not start", error.message);
  app.exit(1);
});
