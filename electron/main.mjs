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
  ClipboardItem,
  nativeImage,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chokidar from "chokidar";
import { Workspace, DEFAULT_IGNORES } from "./workspace.mjs";
import { Transactions } from "./transactions.mjs";
import { readJSON, writeJSON } from "./storage.mjs";
import { Terminals, installedShells } from "./terminals.mjs";
import { searchWorkspace } from "./search.mjs";
import { FileHistory } from "./history.mjs";
import { selectionRoots } from "./selection.mjs";
import { savedPosition } from "./session.mjs";
import { createSpellcheck } from "./spellcheck.mjs";

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
  readingFontSize: 17,
  readingLineHeight: 1.85,
  readingWidth: 820,
  historyEnabled: true,
  historyLimitMB: 100,
  historyVersions: 20,
  indentSize: 2,
  formatOnOpen: true,
  spellcheckEnabled: true,
  spellcheckLanguage: "system",
  sidebarWidth: 260,
  terminalHeight: 240,
  sidebarVisible: true,
  terminalVisible: false,
  focusMode: false,
};
let history;
let win,
  workspace,
  watcher,
  state,
  transactions,
  terminals,
  confirmedClose = false;
let watcherTimer, startupError;
let searchJob;
const stateFile = () => path.join(app.getPath("userData"), "state.json");
let preferenceQueue = Promise.resolve();
function queuePreferences(action) {
  const operation = preferenceQueue.then(action);
  preferenceQueue = operation.catch(() => {});
  return operation;
}
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
  searchJob?.controller.abort();
  const resolved = path.resolve(root);
  if (!(await fs.stat(resolved)).isDirectory())
    throw new Error("Select a folder.");
  const candidate = new Workspace(
    resolved,
    transactions,
    state.settings.ignored,
  );
  await candidate.resolve();
  candidate.history = history;
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
  history = new FileHistory(
    path.join(app.getPath("userData"), "history"),
    () => state.settings,
  );
  await history.prune().catch((error) => {
    startupError = `Local history needs attention: ${error.message}`;
  });
  terminals = new Terminals(send);

  protocol.handle("margin-asset", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "workspace" || !workspace)
        return new Response("", { status: 403 });
      const name = decodeURIComponent(url.pathname.slice(1));
      if (
        !/\.(png|jpe?g|gif|webp|bmp|ico|avif|svg|css|woff2?|ttf|otf)$/i.test(
          name,
        )
      )
        return new Response("", { status: 415 });
      const target = await workspace.resolve(name);
      const response = await net.fetch(pathToFileURL(target).href);
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response("", { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  const spellcheck = createSpellcheck(app.getLocale(), (info) =>
    send("app:spellcheck-changed", info),
  );
  try {
    spellcheck.validate(state.settings.spellcheckLanguage);
  } catch {
    state.settings.spellcheckLanguage = "system";
  }
  void spellcheck.configure(state.settings);
  app.on("will-quit", () => spellcheck.dispose());
  handle("app:check-spelling", (words, revision) =>
    spellcheck.check(words, revision),
  );

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
      spellcheck: spellcheck.info(),
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
  handle("workspace:search", async (request) => {
    const current = requireWorkspace();
    searchJob?.controller.abort();
    const job = { id: request?.id, controller: new AbortController() };
    searchJob = job;
    try {
      return await searchWorkspace(current, request, job.controller.signal);
    } finally {
      if (searchJob === job) searchJob = undefined;
    }
  });
  handle("workspace:cancel-search", (id) => {
    if (searchJob?.id === id) searchJob.controller.abort();
  });
  handle("app:edit", (command) => {
    if (
      ![
        "undo",
        "redo",
        "cut",
        "copy",
        "paste",
        "pasteAndMatchStyle",
        "selectAll",
      ].includes(command)
    )
      throw new Error("Unknown edit command.");
    win.webContents[command]();
  });
  handle("app:copy-text", (text, html) => {
    if (typeof text !== "string" || text.length > 12 * 1024 * 1024)
      throw new Error("Invalid clipboard text.");
    if (html === undefined) return clipboard.writeText(text);
    if (typeof html !== "string" || html.length > 12 * 1024 * 1024)
      throw new Error("Invalid clipboard HTML.");
    return clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
  });
  handle("app:clipboard-text", () => clipboard.readText());
  handle("file:copy-path", async (name) =>
    clipboard.writeText(await requireWorkspace().resolve(name)),
  );
  handle("file:reveal", async (name) =>
    shell.showItemInFolder(await requireWorkspace().resolve(name)),
  );
  handle("image:bytes", async (source) => {
    if (typeof source !== "string") throw new Error("Invalid image address.");
    const url = new URL(source);
    const limit = 30 * 1024 * 1024;
    let bytes;
    if (url.protocol === "margin-asset:" && url.hostname === "workspace") {
      const name = decodeURIComponent(url.pathname.slice(1));
      if (!/\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i.test(name))
        throw new Error("Unsupported image format.");
      const file = await requireWorkspace().resolve(name);
      if ((await fs.stat(file)).size > limit)
        throw new Error("Images must be smaller than 30 MB.");
      bytes = await fs.readFile(file);
    } else if (url.protocol === "https:") {
      const response = await net.fetch(url.href, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok || !response.body)
        throw new Error("The image could not be loaded.");
      const reader = response.body.getReader(),
        chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit)
            throw new Error("Images must be smaller than 30 MB.");
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel();
      }
      bytes = Buffer.concat(chunks);
    } else
      throw new Error("Only workspace images and HTTPS images can be copied.");
    return Array.from(bytes);
  });
  handle("image:copy", async (pixels) => {
    if (
      !Array.isArray(pixels) ||
      pixels.length > 30 * 1024 * 1024 ||
      pixels.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
    )
      throw new Error("Invalid image pixels.");
    const bytes = Buffer.from(pixels);
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error("Expected PNG image pixels.");
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) throw new Error("The image could not be copied.");
    await clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([image.toPNG()], { type: "image/png" }),
      }),
    ]);
  });
  handle("file:read", (name) => requireWorkspace().read(name));
  handle("file:save-copy", (from, name, text) =>
    requireWorkspace().saveCopy(from, name, text),
  );
  handle("file:save", (name, text, revision) => {
    if (typeof text !== "string" || text.length > 12 * 1024 * 1024)
      throw new Error("Invalid file content.");
    return requireWorkspace().save(name, text, revision);
  });
  handle("file:create", (name, directory) =>
    requireWorkspace().create(name, directory === true),
  );
  handle("file:move", async (from, to) => {
    const w = requireWorkspace();
    const result = await w.move(from, to);
    const historyWarning = await history.remap(w.root, [{ from, to }]).then(
      () => undefined,
      (error) => error.message,
    );
    return { ...result, historyWarning };
  });
  handle("file:move-selection", async (paths, directory) => {
    const w = requireWorkspace();
    const result = await w.moveSelection(paths, directory);
    const historyWarning = await history.remap(w.root, result.moves).then(
      () => undefined,
      (error) => error.message,
    );
    return { ...result, historyWarning };
  });
  handle("file:trash-selection", async (paths) => {
    const w = requireWorkspace();
    return w.mutate(async () => {
      const names = selectionRoots(paths);
      for (const name of names) await w.resolve(name);
      const trashed = [],
        failed = [];
      for (const name of names) {
        try {
          await shell.trashItem(await w.resolve(name));
          trashed.push(name);
        } catch (error) {
          failed.push({ path: name, message: error.message });
        }
      }
      return { trashed, failed };
    });
  });
  handle("history:list", async (name) => {
    const w = requireWorkspace();
    await w.resolve(name, true);
    return history.list(w.root, name);
  });
  handle("history:read", async (name, id) => {
    const w = requireWorkspace();
    await w.resolve(name, true);
    return history.read(w.root, name, id);
  });
  handle("history:checkpoint", async (name, text) => {
    const w = requireWorkspace();
    await w.resolve(name, true);
    if (typeof text !== "string" || text.length > 12 * 1024 * 1024)
      throw new Error("Invalid snapshot.");
    await history.capture(
      w.root,
      name,
      text,
      "Before restoring (editor contents)",
    );
  });
  handle("file:duplicate", (from, to) => {
    if (!from) throw new Error("Cannot duplicate the workspace root.");
    return requireWorkspace().duplicate(from, to);
  });
  handle("file:incoming-selection", (paths) =>
    requireWorkspace().incomingSelection(paths),
  );
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
  handle("app:settings", (update) =>
    queuePreferences(async () => {
      if (!update || typeof update !== "object")
        throw new Error("Invalid settings.");
      const next = { ...state.settings };
      for (const key of [
        "theme",
        "autosave",
        "attachmentMode",
        "attachmentFolder",
        "spellcheckLanguage",
      ])
        if (typeof update[key] === "string") next[key] = update[key];
      for (const key of [
        "fontSize",
        "indentSize",
        "sidebarWidth",
        "terminalHeight",
        "autosaveDelay",
        "readingFontSize",
        "readingLineHeight",
        "readingWidth",
        "historyLimitMB",
        "historyVersions",
      ])
        if (Number.isFinite(update[key])) next[key] = update[key];
      for (const key of [
        "sidebarVisible",
        "terminalVisible",
        "focusMode",
        "formatOnOpen",
        "historyEnabled",
        "spellcheckEnabled",
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
      if (
        next.readingFontSize < 12 ||
        next.readingFontSize > 32 ||
        next.readingLineHeight < 1.2 ||
        next.readingLineHeight > 2.5 ||
        next.readingWidth < 480 ||
        next.readingWidth > 1200 ||
        next.historyLimitMB < 10 ||
        next.historyLimitMB > 1000 ||
        !Number.isInteger(next.historyVersions) ||
        next.historyVersions < 1 ||
        next.historyVersions > 100
      )
        throw new Error("Invalid reading or history limit.");
      const historyChanged =
        next.historyLimitMB !== state.settings.historyLimitMB ||
        next.historyVersions !== state.settings.historyVersions;
      spellcheck.validate(next.spellcheckLanguage);
      const ignoresChanged =
        JSON.stringify(next.ignored) !== JSON.stringify(state.settings.ignored);
      if (historyChanged) {
        const previous = state.settings;
        state.settings = next;
        try {
          await history.prune();
        } catch (error) {
          state.settings = previous;
          throw error;
        }
      }
      state.settings = next;
      await saveState();
      void spellcheck.configure(next);
      if (workspace) {
        workspace.ignored = next.ignored;
        if (ignoresChanged) await openWorkspace(workspace.root);
      }
      return next;
    }),
  );
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
        position: savedPosition(t.position),
        suppressAutoFormat: !!t.suppressAutoFormat,
        pinned: !!t.pinned,
      });
    }
    const closedTabs = [];
    for (const tab of (Array.isArray(saved.closedTabs)
      ? saved.closedTabs
      : []
    ).slice(-20)) {
      await w.resolve(tab.path, true);
      if (!["visual", "source"].includes(tab.mode)) continue;
      closedTabs.push({
        path: tab.path,
        mode: tab.mode,
        pinned: !!tab.pinned,
        position: savedPosition(tab.position),
        index: Number.isInteger(tab.index)
          ? Math.max(0, Math.min(100, tab.index))
          : 0,
      });
    }
    const recentFiles = [];
    for (const name of [
      ...new Set(Array.isArray(saved.recentFiles) ? saved.recentFiles : []),
    ].slice(0, 100)) {
      try {
        await w.resolve(name, true);
        recentFiles.push(name);
      } catch {
        /* Drop stale or invalid paths. */
      }
    }
    state.sessions[w.root] = {
      tabs,
      active: saved.active,
      expanded: saved.expanded || [],
      closedTabs,
      recentFiles,
      split:
        saved.split &&
        typeof saved.split.left === "string" &&
        typeof saved.split.right === "string" &&
        saved.split.left !== saved.split.right &&
        tabs.some((tab) => tab.path === saved.split.left) &&
        tabs.some((tab) => tab.path === saved.split.right)
          ? { left: saved.split.left, right: saved.split.right }
          : null,
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
  handle("terminal:create", async (name, directory = "") => {
    const w = requireWorkspace();
    const cwd = await w.resolve(directory);
    if (!(await fs.stat(cwd)).isDirectory())
      throw new Error("Choose a directory for the terminal.");
    if (w !== requireWorkspace())
      throw new Error("The workspace changed. Open the terminal again.");
    return { ...terminals.create(cwd, name), cwd: directory };
  });
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
        spellcheck: false,
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
        {
          label: "Reopen Closed Tab",
          accelerator: "CmdOrCtrl+Shift+T",
          click: () => send("app:command", "reopen-tab"),
        },
        { label: "Save As…", click: () => send("app:command", "save-as") },
        {
          label: "Save a Copy…",
          click: () => send("app:command", "save-copy"),
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
        {
          label: "Find in Document",
          accelerator: "CmdOrCtrl+F",
          click: () => send("app:command", "find"),
        },
        {
          label: "Search Workspace",
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => send("app:command", "search-workspace"),
        },
        { type: "separator" },
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
