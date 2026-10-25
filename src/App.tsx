import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FolderOpen,
  Search,
  Settings2,
  TerminalSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  FilePlus2,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  FileText,
  FileCode2,
  Image as ImageIcon,
  X,
  MoreHorizontal,
  Sun,
  Moon,
  Save,
  Code2,
  PenLine,
  Check,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Command,
  AlertTriangle,
  Copy,
  ArrowRight,
  Trash2,
  Pencil,
  Folder,
  PanelBottomClose,
  PanelBottomOpen,
  ListTree,
  LoaderCircle,
} from "lucide-react";
import { MarkdownEditor } from "./editors/MarkdownEditor";
import { CodeEditor } from "./editors/CodeEditor";
import { supportsFormatting } from "./lib/formatting";
import { TerminalView } from "./components/TerminalPanel";
import {
  assetURL,
  basename,
  dirname,
  isImage,
  isMarkdown,
  resolveLink,
  visualProtection,
} from "./lib/markdown";
import type {
  Entry,
  OpenedWorkspace,
  Settings,
  Tab,
  TerminalInfo,
} from "./types";

type Choice = {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
};
type DialogSpec = {
  title: string;
  description?: string;
  input?: string;
  label?: string;
  choices: Choice[];
  extra?: React.ReactNode;
  resolve: (answer: string | null) => void;
};
const initialSettings: Settings = {
  theme: "light",
  autosave: "afterDelay",
  autosaveDelay: 1500,
  attachmentMode: "workspace",
  attachmentFolder: "assets",
  ignored: [],
  fontSize: 14,
  indentSize: 2,
  formatOnOpen: true,
  sidebarWidth: 260,
  terminalHeight: 240,
  sidebarVisible: true,
  terminalVisible: false,
  focusMode: false,
};
const isInside = (name: string, parent: string) =>
  name === parent || name.startsWith(parent + "/");
const mapped = (name: string, from: string, to: string) =>
  isInside(name, from) ? to + name.slice(from.length) : name;
const errorMessage = (error: unknown) =>
  (error as Error).message.replace(
    /^Error invoking remote method '[^']+': Error: /,
    "",
  );
function FileIcon({
  path,
  directory = false,
}: {
  path: string;
  directory?: boolean;
}) {
  return directory ? (
    <Folder size={16} />
  ) : isMarkdown(path) ? (
    <FileText size={16} className="markdown-icon" />
  ) : isImage(path) ? (
    <ImageIcon size={16} className="image-icon" />
  ) : (
    <FileCode2 size={16} className="code-icon" />
  );
}

export default function App() {
  const [settings, setSettings] = useState(initialSettings),
    settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [root, setRoot] = useState(""),
    rootRef = useRef(root);
  rootRef.current = root;
  const [entries, setEntries] = useState<Entry[]>([]),
    [recent, setRecent] = useState<string[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]),
    tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const [active, setActive] = useState(""),
    activeRef = useRef(active);
  activeRef.current = active;
  const [expanded, setExpanded] = useState<string[]>([]),
    expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const [selected, setSelected] = useState(""),
    [treeFilter, setTreeFilter] = useState("");
  const [palette, setPalette] = useState<"files" | "commands" | null>(null),
    [query, setQuery] = useState(""),
    [paletteIndex, setPaletteIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false),
    [showOutline, setShowOutline] = useState(false);
  const [dialog, setDialog] = useState<DialogSpec | null>(null),
    [dialogInput, setDialogInput] = useState("");
  const [context, setContext] = useState<{
    path: string;
    x: number;
    y: number;
  } | null>(null);
  const [message, setMessage] = useState<{
      text: string;
      error: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [shells, setShells] = useState<string[]>([]),
    [chosenShell, setChosenShell] = useState(""),
    [terminalTabs, setTerminalTabs] = useState<TerminalInfo[]>([]),
    [terminalActive, setTerminalActive] = useState("");
  const [recovery, setRecovery] = useState<{ file: string; message: string }[]>(
      [],
    ),
    [platform, setPlatform] = useState("win32");
  const saving = useRef(new Set<string>()),
    busyRef = useRef(false),
    appRef = useRef<HTMLDivElement>(null);
  const notify = useCallback(
    (text: string, error = false) => setMessage({ text, error }),
    [],
  );
  const fail = useCallback(
    (error: unknown) => notify(errorMessage(error), true),
    [notify],
  );
  const ask = (spec: Omit<DialogSpec, "resolve">) =>
    new Promise<string | null>((resolve) => {
      setDialogInput(spec.input || "");
      setDialog({ ...spec, resolve });
    });
  const answer = (id: string | null) => {
    const value = id === "submit" ? dialogInput.trim() : id;
    const current = dialog;
    setDialog(null);
    current?.resolve(value);
  };
  const changeTabs = (fn: (previous: Tab[]) => Tab[]) =>
    setTabs((previous) => {
      const next = fn(previous);
      tabsRef.current = next;
      return next;
    });
  const updateSettings = async (patch: Partial<Settings>) => {
    try {
      const next = await window.margin.settings(patch);
      settingsRef.current = next;
      setSettings(next);
    } catch (e) {
      fail(e);
    }
  };
  const persist = async () => {
    if (rootRef.current)
      await window.margin.persist({
        tabs: tabsRef.current,
        active: activeRef.current,
        expanded: expandedRef.current,
      });
  };
  const refreshTree = async () => {
    if (rootRef.current) setEntries(await window.margin.tree());
  };

  async function restore(opened: OpenedWorkspace) {
    rootRef.current = opened.root;
    setRoot(opened.root);
    setEntries(opened.entries);
    setTerminalTabs([]);
    setTerminalActive("");
    setSelected("");
    const restored: Tab[] = [];
    for (const saved of opened.session?.tabs || []) {
      try {
        if (isImage(saved.path)) {
          restored.push({ ...saved, dirty: false, version: 0 });
          continue;
        }
        const disk = await window.margin.read(saved.path);
        const dirty = saved.dirty && saved.text !== disk.text;
        restored.push({
          ...disk,
          baseline: disk.text,
          text: dirty ? saved.text : disk.text,
          dirty,
          revision: dirty ? saved.revision : disk.revision,
          mode:
            isMarkdown(saved.path) &&
            saved.mode !== "source" &&
            !visualProtection(dirty ? saved.text : disk.text)
              ? "visual"
              : "source",
          version: 0,
          ...(dirty && disk.revision !== saved.revision
            ? { conflict: disk }
            : {}),
        });
      } catch {
        if (saved.dirty)
          restored.push({ ...saved, conflict: "deleted", version: 0 });
      }
    }
    changeTabs(() => restored);
    const nextActive =
      restored.find((t) => t.path === opened.session?.active)?.path ||
      restored[0]?.path ||
      "";
    setActive(nextActive);
    activeRef.current = nextActive;
    setExpanded(
      opened.session?.expanded ||
        opened.entries
          .filter((e) => e.directory && !e.path.includes("/"))
          .map((e) => e.path),
    );
    setRecent((previous) =>
      [opened.root, ...previous.filter((r) => r !== opened.root)].slice(0, 12),
    );
  }
  useEffect(() => {
    void window.margin
      .bootstrap()
      .then(async (data) => {
        setSettings(data.settings);
        settingsRef.current = data.settings;
        setRecent(data.recent);
        setShells(data.shells);
        setChosenShell(data.shells[0] || "");
        setRecovery(data.recovery);
        setPlatform(data.platform);
        if (data.workspace) await restore(data.workspace);
        if (data.error) notify(data.error, true);
      })
      .catch(fail)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  useEffect(() => {
    if (message && !message.error) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  useEffect(() => {
    if (!root || loading) return;
    const timer = setTimeout(() => void persist().catch(fail), 350);
    return () => clearTimeout(timer);
  }, [tabs, active, expanded, root, loading]);

  async function saveTab(name: string, silent = false) {
    const tab = tabsRef.current.find((t) => t.path === name);
    if (!tab?.dirty) return true;
    if (tab.conflict) {
      if (!silent)
        notify("Resolve the external change before saving this file.", true);
      return false;
    }
    if (saving.current.has(name)) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return saveTab(name, silent);
    }
    saving.current.add(name);
    try {
      const result = await window.margin.save(name, tab.text, tab.revision);
      if (result.conflict) {
        changeTabs((previous) =>
          previous.map((t) =>
            t.path === name ? { ...t, conflict: result.disk } : t,
          ),
        );
        if (!silent)
          notify(
            "The file changed on disk. Your edits are preserved; review the conflict.",
            true,
          );
        return false;
      }
      changeTabs((previous) =>
        previous.map((t) =>
          t.path === name
            ? {
                ...t,
                revision: result.revision!,
                baseline: tab.text,
                dirty: t.text !== tab.text,
              }
            : t,
        ),
      );
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      saving.current.delete(name);
    }
  }
  async function saveAll() {
    for (const tab of tabsRef.current)
      if (!(await saveTab(tab.path))) return false;
    await persist();
    return true;
  }
  async function settleEdits(reason: string) {
    if (!tabsRef.current.some((t) => t.dirty || t.conflict)) return true;
    const result = await ask({
      title: "Save your work first",
      description: `${reason} updates files on disk. Save all open edits before continuing. Files with external conflicts need to be resolved first.`,
      choices: [
        { id: "save", label: "Save all & continue", primary: true },
        { id: "cancel", label: "Cancel" },
      ],
    });
    return result === "save" && (await saveAll());
  }
  useEffect(() => {
    if (settings.autosave !== "afterDelay" || busy || loading) return;
    const timer = setTimeout(() => {
      for (const tab of tabsRef.current)
        if (tab.dirty && !tab.conflict) void saveTab(tab.path, true);
    }, settings.autosaveDelay);
    return () => clearTimeout(timer);
  }, [tabs, settings.autosave, settings.autosaveDelay, busy, loading]);
  useEffect(() => {
    const blur = () => {
      if (settingsRef.current.autosave === "onBlur" && !busyRef.current)
        for (const tab of tabsRef.current)
          if (tab.dirty && !tab.conflict) void saveTab(tab.path, true);
    };
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, []);

  async function reloadTabs() {
    const current = tabsRef.current;
    const updates = await Promise.all(
      current.map(async (tab) => {
        if (isImage(tab.path)) return null;
        try {
          const disk = await window.margin.read(tab.path);
          if (disk.revision === tab.revision) return null;
          return { path: tab.path, expected: tab.revision, disk };
        } catch {
          return {
            path: tab.path,
            expected: tab.revision,
            disk: "deleted" as const,
          };
        }
      }),
    );
    changeTabs((previous) =>
      previous.map((tab) => {
        const update = updates.find((u) => u?.path === tab.path);
        if (
          !update ||
          saving.current.has(tab.path) ||
          tab.revision !== update.expected
        )
          return tab;
        if (tab.dirty || update.disk === "deleted")
          return { ...tab, conflict: update.disk };
        return {
          ...tab,
          ...update.disk,
          baseline: update.disk.text,
          dirty: false,
          conflict: undefined,
          version: tab.version + 1,
          mode: visualProtection(update.disk.text) ? "source" : tab.mode,
        };
      }),
    );
  }
  useEffect(
    () =>
      window.margin.onFiles((paths) => {
        if (!Array.isArray(paths)) {
          notify("File watcher: " + paths.error, true);
          return;
        }
        if (busyRef.current) return;
        void refreshTree().catch(fail);
        void reloadTabs().catch(fail);
      }),
    [],
  );
  async function openFile(name: string, anchor?: string) {
    if (busyRef.current) return;
    const existing = tabsRef.current.find((t) => t.path === name);
    if (existing) {
      setActive(name);
      activeRef.current = name;
    } else
      try {
        if (isImage(name)) {
          changeTabs((previous) => [
            ...previous,
            {
              path: name,
              text: "",
              baseline: "",
              revision: "",
              dirty: false,
              mode: "source",
              version: 0,
            },
          ]);
        } else {
          const doc = await window.margin.read(name);
          const protect = visualProtection(doc.text);
          changeTabs((previous) =>
            previous.some((t) => t.path === name)
              ? previous
              : [
                  ...previous,
                  {
                    ...doc,
                    baseline: doc.text,
                    dirty: false,
                    mode: isMarkdown(name) && !protect ? "visual" : "source",
                    version: 0,
                  },
                ],
          );
          if (isMarkdown(name) && protect)
            notify(`Opened in Source to preserve ${protect}.`);
        }
        setActive(name);
        activeRef.current = name;
        const parents = name
          .split("/")
          .slice(0, -1)
          .map((_, i, all) => all.slice(0, i + 1).join("/"));
        setExpanded((previous) => [...new Set([...previous, ...parents])]);
      } catch (e) {
        fail(e);
      }
    if (anchor)
      setTimeout(() => {
        const headings = appRef.current
          ?.querySelector(".editor-pane.active")
          ?.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6");
        const normalized = (s: string) =>
          s
            .toLowerCase()
            .trim()
            .replace(/[^\p{L}\p{N}\s_-]/gu, "")
            .replace(/\s/g, "-");
        Array.from(headings || [])
          .find((h) => normalized(h.textContent || "") === normalized(anchor))
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 180);
  }
  async function closeTab(name: string) {
    const tab = tabsRef.current.find((t) => t.path === name);
    if (tab?.dirty) {
      const result = await ask({
        title: `Save ${basename(name)}?`,
        description:
          "This tab has unsaved changes. Discard removes its recovery draft.",
        choices: [
          { id: "save", label: "Save", primary: true },
          { id: "discard", label: "Discard edits", danger: true },
          { id: "cancel", label: "Cancel" },
        ],
      });
      if (
        !result ||
        result === "cancel" ||
        (result === "save" && !(await saveTab(name)))
      )
        return;
    }
    const index = tabsRef.current.findIndex((t) => t.path === name);
    const remaining = tabsRef.current.filter((t) => t.path !== name);
    changeTabs(() => remaining);
    if (activeRef.current === name) {
      const next = remaining[Math.max(0, index - 1)]?.path || "";
      setActive(next);
      activeRef.current = next;
    }
    await persist();
  }
  async function chooseWorkspace(recentRoot?: string) {
    if (!(await settleEdits("Opening another workspace"))) return;
    await persist();
    try {
      const opened = recentRoot
        ? await window.margin.openWorkspace(recentRoot)
        : await window.margin.chooseWorkspace();
      if (opened) await restore(opened);
    } catch (e) {
      fail(e);
    }
  }
  function edit(name: string, text: string) {
    if (busyRef.current) return;
    changeTabs((previous) =>
      previous.map((tab) =>
        tab.path === name
          ? { ...tab, text, dirty: text !== tab.baseline }
          : tab,
      ),
    );
  }
  async function withOperation(operation: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await operation();
      await refreshTree();
      await reloadTabs();
      await persist();
    } catch (e) {
      fail(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function creationParent() {
    const entry = entries.find((e) => e.path === selected);
    return entry?.directory
      ? entry.path
      : dirname(selected || activeRef.current);
  }
  async function createEntry(directory: boolean) {
    if (!root) {
      await chooseWorkspace();
      return;
    }
    const parent = creationParent();
    const name = await ask({
      title: directory ? "New folder" : "New document",
      description: parent
        ? `Create inside ${parent}`
        : "Create in the workspace root",
      input: directory ? "Untitled folder" : "Untitled.md",
      label: "Name",
      choices: [
        { id: "submit", label: "Create", primary: true },
        { id: "cancel", label: "Cancel" },
      ],
    });
    if (!name || name === "cancel") return;
    try {
      const target = await window.margin.create(
        parent ? parent + "/" + name : name,
        directory,
      );
      await refreshTree();
      if (directory) {
        setExpanded((previous) => [...previous, target]);
        setSelected(target);
      } else await openFile(target);
    } catch (e) {
      fail(e);
    }
  }
  async function moveEntry(from: string, to?: string) {
    setContext(null);
    const target =
      to ||
      (await ask({
        title: "Rename or move",
        description:
          "Enter a path relative to the workspace. Markdown links and image references throughout the workspace will be updated.",
        input: from,
        label: "New path",
        choices: [
          { id: "submit", label: "Move & update links", primary: true },
          { id: "cancel", label: "Cancel" },
        ],
      }));
    if (
      !target ||
      target === "cancel" ||
      target === from ||
      !(await settleEdits("Reorganizing the workspace"))
    )
      return;
    await withOperation(async () => {
      const result = await window.margin.move(from, target);
      changeTabs((previous) =>
        previous.map((tab) => ({
          ...tab,
          path: mapped(tab.path, from, target),
          version: tab.version + 1,
        })),
      );
      const next = mapped(activeRef.current, from, target);
      setActive(next);
      activeRef.current = next;
      setExpanded((previous) => previous.map((p) => mapped(p, from, target)));
      setSelected(target);
      notify(
        `Moved to ${target}. Updated references in ${result.referencesUpdated} document${result.referencesUpdated === 1 ? "" : "s"}.`,
      );
    });
  }
  async function duplicateEntry(from: string) {
    setContext(null);
    const dot = from.lastIndexOf("."),
      suggested =
        dot > from.lastIndexOf("/")
          ? from.slice(0, dot) + " copy" + from.slice(dot)
          : from + " copy";
    const target = await ask({
      title: "Duplicate",
      description: "Choose a workspace-relative path for the copy.",
      input: suggested,
      label: "New path",
      choices: [
        { id: "submit", label: "Duplicate", primary: true },
        { id: "cancel", label: "Cancel" },
      ],
    });
    if (
      !target ||
      target === "cancel" ||
      !(await settleEdits("Duplicating files"))
    )
      return;
    await withOperation(async () => {
      await window.margin.duplicate(from, target);
      notify(`Created ${target}`);
    });
  }
  async function deleteEntry(name: string) {
    setContext(null);
    if (!(await settleEdits("Deleting files"))) return;
    try {
      const incoming = await window.margin.incoming(name);
      const result = await ask({
        title: `Move ${basename(name)} to Trash?`,
        description: incoming.length
          ? `${incoming.length} document(s) reference this item: ${incoming.slice(0, 8).join(", ")}. Those links will point to a missing file. Restore it from the system Trash to undo deletion.`
          : "You can restore this item from the system Trash / Recycle Bin.",
        choices: [
          { id: "delete", label: "Move to Trash", danger: true },
          { id: "cancel", label: "Cancel" },
        ],
      });
      if (result !== "delete") return;
      await withOperation(async () => {
        await window.margin.trash(name);
        const remaining = tabsRef.current.filter(
          (tab) => !isInside(tab.path, name),
        );
        changeTabs(() => remaining);
        if (isInside(activeRef.current, name)) {
          const next = remaining[0]?.path || "";
          setActive(next);
          activeRef.current = next;
        }
        setSelected("");
        notify("Moved to Trash");
      });
    } catch (e) {
      fail(e);
    }
  }
  async function reviewConflict(tab: Tab) {
    const disk = tab.conflict;
    if (!disk) return;
    const result = await ask({
      title:
        disk === "deleted"
          ? "This file is no longer on disk"
          : "The file changed outside Margin",
      description:
        "Your editor content has been preserved. Save it as a separate copy, or explicitly reload the disk version. You can compare both versions below.",
      extra: (
        <div className="conflict-comparison">
          <label>
            Your editor version
            <textarea readOnly value={tab.text} />
          </label>
          <label>
            Current disk version
            <textarea
              readOnly
              value={
                disk === "deleted" ? "[File deleted or unavailable]" : disk.text
              }
            />
          </label>
        </div>
      ),
      choices: [
        { id: "copy", label: "Save my edits as copy", primary: true },
        ...(disk !== "deleted"
          ? [{ id: "reload", label: "Reload disk version", danger: true }]
          : []),
        { id: "cancel", label: "Keep reviewing" },
      ],
    });
    if (result === "reload" && disk !== "deleted")
      changeTabs((previous) =>
        previous.map((t) =>
          t.path === tab.path
            ? {
                ...t,
                ...disk,
                baseline: disk.text,
                dirty: false,
                conflict: undefined,
                version: t.version + 1,
                mode: visualProtection(disk.text) ? "source" : t.mode,
              }
            : t,
        ),
      );
    if (result === "copy") {
      const dot = tab.path.lastIndexOf(".");
      const suggested =
        dot >= 0
          ? tab.path.slice(0, dot) + "-recovered" + tab.path.slice(dot)
          : tab.path + "-recovered";
      const name = await ask({
        title: "Save recovered copy",
        input: suggested,
        label: "Workspace-relative path",
        choices: [
          { id: "submit", label: "Save copy", primary: true },
          { id: "cancel", label: "Cancel" },
        ],
      });
      if (!name || name === "cancel") return;
      try {
        await window.margin.create(name, false);
        const created = await window.margin.read(name);
        const saved = await window.margin.save(
          name,
          tab.text,
          created.revision,
        );
        if (saved.conflict)
          throw new Error(
            "The recovery copy changed externally. Your original buffer is still open.",
          );
        await refreshTree();
        await openFile(name);
        notify(
          "Recovered edits saved separately. Original conflict remains available.",
        );
      } catch (e) {
        fail(e);
      }
    }
  }
  async function toggleMode(tab: Tab) {
    if (tab.mode === "source") {
      const reason = visualProtection(tab.text);
      if (reason) {
        notify(
          `Source mode preserves ${reason}. Visual editing is unavailable for this document.`,
          true,
        );
        return;
      }
    }
    changeTabs((previous) =>
      previous.map((t) =>
        t.path === tab.path
          ? { ...t, mode: t.mode === "visual" ? "source" : "visual" }
          : t,
      ),
    );
  }
  async function followLink(name: string, href: string) {
    try {
      const link = resolveLink(name, href);
      if (link.external) await window.margin.external(link.external);
      else if (link.path) await openFile(link.path, link.anchor);
    } catch (e) {
      fail(e);
    }
  }
  async function addTerminal() {
    if (!root) return;
    try {
      const info = await window.margin.terminalCreate(chosenShell);
      setTerminalTabs((previous) => [...previous, info]);
      setTerminalActive(info.id);
      await updateSettings({ terminalVisible: true });
    } catch (e) {
      fail(e);
    }
  }
  async function removeTerminal(id: string) {
    try {
      await window.margin.terminalClose(id);
      const remaining = terminalTabs.filter((t) => t.id !== id);
      setTerminalTabs(remaining);
      if (terminalActive === id) setTerminalActive(remaining.at(-1)?.id || "");
    } catch (e) {
      fail(e);
    }
  }
  async function requestClose() {
    if (dialog) return;
    if (busyRef.current) {
      notify(
        "Wait for the filesystem operation to finish before closing.",
        true,
      );
      return;
    }
    const dirty = tabsRef.current.filter((t) => t.dirty);
    if (dirty.length) {
      const result = await ask({
        title: "Save changes before closing?",
        description: `${dirty.length} document(s) have unsaved edits. Keep drafts stores recovery copies without overwriting files on disk.`,
        choices: [
          { id: "save", label: "Save all & close", primary: true },
          { id: "drafts", label: "Keep drafts & close" },
          { id: "cancel", label: "Cancel" },
        ],
      });
      if (
        !result ||
        result === "cancel" ||
        (result === "save" && !(await saveAll()))
      )
        return;
    }
    try {
      await persist();
      await window.margin.closeConfirmed();
    } catch (e) {
      fail(e);
    }
  }
  const actionsRef = useRef({
    requestClose,
    chooseWorkspace,
    saveTab,
    saveAll,
    createEntry,
    addTerminal,
    closeTab,
  });
  actionsRef.current = {
    requestClose,
    chooseWorkspace,
    saveTab,
    saveAll,
    createEntry,
    addTerminal,
    closeTab,
  };
  useEffect(
    () => window.margin.onClose(() => void actionsRef.current.requestClose()),
    [],
  );
  useEffect(
    () =>
      window.margin.onCommand((command) => {
        if (command === "save")
          void actionsRef.current.saveTab(activeRef.current);
        if (command === "open") void actionsRef.current.chooseWorkspace();
      }),
    [],
  );
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (dialog) answer(null);
        else {
          setContext(null);
          setPalette(null);
          setShowSettings(false);
        }
        return;
      }
      const modal = Array.from(
        document.querySelectorAll<HTMLElement>(".modal-scrim"),
      ).at(-1);
      if (modal && event.key === "Tab") {
        const controls = Array.from(
          modal.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input, select, textarea, [tabindex="0"]',
          ),
        ).filter((el) => el.offsetParent !== null);
        const first = controls[0],
          last = controls.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !modal.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !modal.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (modal) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (event.shiftKey) void actionsRef.current.saveAll();
        else void actionsRef.current.saveTab(activeRef.current);
      } else if (key === "p") {
        event.preventDefault();
        setPalette(event.shiftKey ? "commands" : "files");
        setQuery("");
        setPaletteIndex(0);
      } else if (key === "n") {
        event.preventDefault();
        void actionsRef.current.createEntry(false);
      } else if (key === "w") {
        event.preventDefault();
        if (activeRef.current)
          void actionsRef.current.closeTab(activeRef.current);
      } else if (
        key === "b" &&
        !(document.activeElement as HTMLElement)?.closest(".document-content")
      ) {
        event.preventDefault();
        void updateSettings({
          sidebarVisible: !settingsRef.current.sidebarVisible,
        });
      } else if (key === "`" || event.code === "Backquote") {
        event.preventDefault();
        void updateSettings({
          terminalVisible: !settingsRef.current.terminalVisible,
        });
      } else if (key === ",") {
        event.preventDefault();
        setShowSettings(true);
      } else if (key === "tab" && tabsRef.current.length) {
        event.preventDefault();
        const index = tabsRef.current.findIndex(
          (t) => t.path === activeRef.current,
        );
        const next =
          tabsRef.current[
            (index + (event.shiftKey ? -1 : 1) + tabsRef.current.length) %
              tabsRef.current.length
          ].path;
        setActive(next);
        activeRef.current = next;
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [dialog, dialogInput, showSettings, palette]);
  useEffect(() => {
    if (!context) return;
    const close = () => setContext(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [context]);
  function resizePanel(
    event: React.PointerEvent,
    panel: "sidebar" | "terminal",
  ) {
    event.preventDefault();
    const startX = event.clientX,
      startY = event.clientY,
      starting = { ...settingsRef.current };
    const move = (e: PointerEvent) =>
      setSettings((previous) => ({
        ...previous,
        ...(panel === "sidebar"
          ? {
              sidebarWidth: Math.min(
                500,
                Math.max(180, starting.sidebarWidth + e.clientX - startX),
              ),
            }
          : {
              terminalHeight: Math.min(
                window.innerHeight - 300,
                Math.max(120, starting.terminalHeight + startY - e.clientY),
              ),
            }),
      }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      void updateSettings(
        panel === "sidebar"
          ? { sidebarWidth: settingsRef.current.sidebarWidth }
          : { terminalHeight: settingsRef.current.terminalHeight },
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const current = tabs.find((t) => t.path === active);
  const keyboard = platform === "darwin" ? "⌘" : "Ctrl";
  const commands = [
    {
      name: "Open folder",
      shortcut: `${keyboard}+Shift+O`,
      run: () => chooseWorkspace(),
    },
    {
      name: "New Markdown document",
      shortcut: `${keyboard}+N`,
      run: () => createEntry(false),
    },
    { name: "New folder", run: () => createEntry(true) },
    ...(current && current.mode === "source" && supportsFormatting(current.path)
      ? [
          {
            name: "Format document",
            shortcut: "Shift+Alt+F",
            run: () =>
              window.dispatchEvent(
                new CustomEvent("margin:format-document", {
                  detail: { path: current.path },
                }),
              ),
          },
        ]
      : []),
    {
      name: "Save all files",
      shortcut: `${keyboard}+Shift+S`,
      run: () => saveAll(),
    },
    { name: "New terminal", run: addTerminal },
    {
      name: "Toggle terminal",
      shortcut: `${keyboard}+\u0060`,
      run: () => updateSettings({ terminalVisible: !settings.terminalVisible }),
    },
    {
      name: "Toggle explorer",
      run: () => updateSettings({ sidebarVisible: !settings.sidebarVisible }),
    },
    {
      name: "Toggle focus mode",
      run: () => updateSettings({ focusMode: !settings.focusMode }),
    },
    {
      name: "Switch light / dark theme",
      run: () =>
        updateSettings({
          theme: settings.theme === "light" ? "dark" : "light",
        }),
    },
    {
      name: "Preferences",
      shortcut: `${keyboard}+,`,
      run: () => setShowSettings(true),
    },
    ...(current && isMarkdown(current.path)
      ? [
          {
            name: "Toggle Markdown source / visual",
            run: () => toggleMode(current),
          },
        ]
      : []),
  ];
  const paletteItems =
    palette === "commands"
      ? commands
          .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
          .map((c) => ({ label: c.name, detail: c.shortcut, run: c.run }))
      : entries
          .filter(
            (e) =>
              !e.directory &&
              e.path.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 100)
          .map((e) => ({
            label: e.name,
            detail: dirname(e.path),
            run: () => openFile(e.path),
          }));
  const displayedEntries = entries.filter((e) =>
    treeFilter
      ? e.path.toLowerCase().includes(treeFilter.toLowerCase()) ||
        entries.some(
          (child) =>
            isInside(child.path, e.path) &&
            child.path.toLowerCase().includes(treeFilter.toLowerCase()),
        )
      : e.path
          .split("/")
          .slice(0, -1)
          .every((_, index, parts) =>
            expanded.includes(parts.slice(0, index + 1).join("/")),
          ),
  );
  const outline =
    current?.text
      .split("\n")
      .map((line, index) => ({
        line,
        index,
        match: line.match(/^(#{1,6})\s+(.+)/),
      }))
      .filter((item) => item.match) || [];

  if (loading)
    return (
      <div className="loading-screen">
        <BookOpen size={36} />
        <h1>Margin</h1>
        <LoaderCircle className="spinner" />
        <p>Opening your workspace…</p>
      </div>
    );
  return (
    <div
      className={"application" + (settings.focusMode ? " focus-mode" : "")}
      ref={appRef}
    >
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <BookOpen size={20} />
          </div>
          <span>
            margin<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="workspace-location">
          <span className="workspace-badge">LOCAL WORKSPACE</span>
          <ChevronRight size={14} />
          <button
            title={root || "Open a folder"}
            onClick={() => void chooseWorkspace()}
          >
            {root ? basename(root) : "Choose a folder"}
          </button>
        </div>
        <button
          className="global-search"
          onClick={() => {
            setPalette("files");
            setQuery("");
            setPaletteIndex(0);
          }}
        >
          <Search size={15} />
          <span>Go to a file or command…</span>
          <kbd>{keyboard} P</kbd>
        </button>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="Toggle focus mode"
            title="Focus mode"
            onClick={() =>
              void updateSettings({ focusMode: !settings.focusMode })
            }
          >
            {settings.focusMode ? <Minimize2 /> : <Maximize2 />}
          </button>
          <button
            className="icon-button"
            aria-label="Toggle theme"
            onClick={() =>
              void updateSettings({
                theme: settings.theme === "light" ? "dark" : "light",
              })
            }
          >
            {settings.theme === "light" ? <Moon /> : <Sun />}
          </button>
          <button
            className="icon-button"
            aria-label="Preferences"
            title={`${keyboard}+,`}
            onClick={() => setShowSettings(true)}
          >
            <Settings2 />
          </button>
        </div>
      </header>
      <div className="workspace-body">
        {!settings.focusMode && (
          <nav className="activity-bar" aria-label="Workspace tools">
            <button
              className={
                "activity-button " + (settings.sidebarVisible ? "active" : "")
              }
              title="Explorer"
              aria-label="Toggle explorer"
              onClick={() =>
                void updateSettings({
                  sidebarVisible: !settings.sidebarVisible,
                })
              }
            >
              <FolderOpen />
            </button>
            <button
              className="activity-button"
              title="Quick open"
              aria-label="Quick open"
              onClick={() => {
                setPalette("files");
                setQuery("");
                setPaletteIndex(0);
              }}
            >
              <Search />
            </button>
            <button
              className={
                "activity-button " + (settings.terminalVisible ? "active" : "")
              }
              title="Terminal"
              aria-label="Toggle terminal"
              onClick={() =>
                void updateSettings({
                  terminalVisible: !settings.terminalVisible,
                })
              }
            >
              <TerminalSquare />
            </button>
            <div className="activity-bottom">
              <button
                className="activity-button"
                aria-label="Command palette"
                title="Command palette"
                onClick={() => {
                  setPalette("commands");
                  setQuery("");
                  setPaletteIndex(0);
                }}
              >
                <Command />
              </button>
              <div
                className="local-indicator"
                title="Your files stay on this computer"
              />
            </div>
          </nav>
        )}
        {settings.sidebarVisible && !settings.focusMode && (
          <>
            <aside className="sidebar" style={{ width: settings.sidebarWidth }}>
              <div className="sidebar-heading">
                <span>EXPLORER</span>
                <button
                  className="icon-button small"
                  aria-label="Open workspace folder"
                  title="Open folder"
                  onClick={() => void chooseWorkspace()}
                >
                  <FolderOpen />
                </button>
                <button
                  className="icon-button small"
                  aria-label="Collapse explorer"
                  onClick={() => void updateSettings({ sidebarVisible: false })}
                >
                  <PanelLeftClose />
                </button>
              </div>
              <div className="folder-heading">
                <ChevronDown size={15} />
                <strong title={root}>
                  {root ? basename(root) : "No folder open"}
                </strong>
                <span className="grow" />
                <button
                  className="icon-button small"
                  aria-label="New document"
                  title="New document"
                  onClick={() => void createEntry(false)}
                >
                  <FilePlus2 />
                </button>
                <button
                  className="icon-button small"
                  aria-label="New folder"
                  title="New folder"
                  onClick={() => void createEntry(true)}
                >
                  <FolderPlus />
                </button>
              </div>
              <label className="tree-filter">
                <Search size={14} />
                <input
                  aria-label="Filter explorer"
                  placeholder="Filter files…"
                  value={treeFilter}
                  onChange={(e) => setTreeFilter(e.target.value)}
                />
                {treeFilter && (
                  <button
                    className="icon-button small"
                    aria-label="Clear filter"
                    onClick={() => setTreeFilter("")}
                  >
                    <X />
                  </button>
                )}
              </label>
              <div
                className="file-tree"
                role="tree"
                aria-label="Workspace files"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = e.dataTransfer.getData(
                    "application/x-margin-path",
                  );
                  if (from) void moveEntry(from, basename(from));
                }}
              >
                {displayedEntries.map((entry) => (
                  <div
                    key={entry.path}
                    role="treeitem"
                    aria-label={entry.path}
                    aria-selected={selected === entry.path}
                    aria-expanded={
                      entry.directory
                        ? expanded.includes(entry.path)
                        : undefined
                    }
                    tabIndex={0}
                    className={
                      "tree-row " +
                      (active === entry.path ? "current " : "") +
                      (selected === entry.path ? "selected" : "")
                    }
                    style={{
                      paddingLeft: 12 + (entry.path.split("/").length - 1) * 16,
                    }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/x-margin-path",
                        entry.path,
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (entry.directory) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                      }
                    }}
                    onDrop={(e) => {
                      if (entry.directory) {
                        e.preventDefault();
                        e.stopPropagation();
                        const from = e.dataTransfer.getData(
                          "application/x-margin-path",
                        );
                        if (from)
                          void moveEntry(
                            from,
                            entry.path + "/" + basename(from),
                          );
                      }
                    }}
                    onClick={() => {
                      setSelected(entry.path);
                      if (entry.directory)
                        setExpanded((previous) =>
                          previous.includes(entry.path)
                            ? previous.filter((p) => p !== entry.path)
                            : [...previous, entry.path],
                        );
                      else void openFile(entry.path);
                    }}
                    onDoubleClick={() => {
                      if (entry.directory) setSelected(entry.path);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelected(entry.path);
                      setContext({
                        path: entry.path,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (entry.directory)
                          setExpanded((previous) =>
                            previous.includes(entry.path)
                              ? previous.filter((p) => p !== entry.path)
                              : [...previous, entry.path],
                          );
                        else void openFile(entry.path);
                      }
                      if (e.key === "F2") {
                        e.preventDefault();
                        void moveEntry(entry.path);
                      }
                      if (e.key === "Delete") {
                        e.preventDefault();
                        void deleteEntry(entry.path);
                      }
                    }}
                  >
                    <span className="tree-chevron">
                      {entry.directory ? (
                        expanded.includes(entry.path) ? (
                          <ChevronDown size={13} />
                        ) : (
                          <ChevronRight size={13} />
                        )
                      ) : null}
                    </span>
                    <FileIcon path={entry.path} directory={entry.directory} />
                    <span className="tree-label">{entry.name}</span>
                    {tabs.some((t) => t.path === entry.path && t.dirty) && (
                      <span className="dirty-dot" />
                    )}
                    <button
                      className="row-menu icon-button small"
                      aria-label={`Actions for ${entry.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setContext({
                          path: entry.path,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                    >
                      <MoreHorizontal />
                    </button>
                  </div>
                ))}
                {root && !entries.length && (
                  <div className="tree-empty">
                    A little room to think.
                    <button onClick={() => void createEntry(false)}>
                      Create your first note <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="sidebar-footer">
                <span className="local-indicator" />
                Files on your device
                <span className="grow" />
                <span>{entries.filter((e) => !e.directory).length}</span>
              </div>
            </aside>
            <div
              className="resize-handle sidebar-resize"
              role="separator"
              aria-label="Resize explorer"
              aria-orientation="vertical"
              tabIndex={0}
              onPointerDown={(e) => resizePanel(e, "sidebar")}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  void updateSettings({
                    sidebarWidth: Math.min(
                      500,
                      Math.max(
                        180,
                        settings.sidebarWidth +
                          (e.key === "ArrowLeft" ? -20 : 20),
                      ),
                    ),
                  });
                }
              }}
            />
          </>
        )}
        <main className="main-workspace">
          <div className="tabs-bar" role="tablist" aria-label="Open files">
            {(!settings.sidebarVisible || settings.focusMode) && (
              <button
                className="icon-button"
                aria-label="Show explorer"
                onClick={() =>
                  void updateSettings({
                    sidebarVisible: true,
                    focusMode: false,
                  })
                }
              >
                <PanelLeftOpen />
              </button>
            )}
            {tabs.map((tab) => (
              <div
                key={tab.path}
                role="tab"
                aria-selected={active === tab.path}
                title={tab.path}
                className={
                  "editor-tab " + (active === tab.path ? "active" : "")
                }
                tabIndex={0}
                onClick={() => {
                  setActive(tab.path);
                  activeRef.current = tab.path;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActive(tab.path);
                    activeRef.current = tab.path;
                  }
                }}
              >
                <FileIcon path={tab.path} />
                <span>{basename(tab.path)}</span>
                {tab.conflict ? (
                  <AlertTriangle size={12} className="warning" />
                ) : tab.dirty ? (
                  <span className="dirty-dot" />
                ) : null}
                <button
                  className="tab-close"
                  aria-label={`Close ${basename(tab.path)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeTab(tab.path);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              className="icon-button tab-add"
              aria-label="New tab document"
              onClick={() => void createEntry(false)}
            >
              <Plus />
            </button>
            <span className="grow" />
            {root && (
              <button
                className="icon-button"
                aria-label="Show outline"
                title="Document outline"
                onClick={() => setShowOutline(!showOutline)}
              >
                <ListTree />
              </button>
            )}
          </div>
          {current && (
            <div className="document-header">
              <div className="breadcrumbs">
                <span>{root ? basename(root) : ""}</span>
                {current.path.split("/").map((part, i) => (
                  <span
                    className={
                      i === current.path.split("/").length - 1
                        ? "breadcrumb-current"
                        : ""
                    }
                    key={i}
                  >
                    <ChevronRight size={13} />
                    {part}
                  </span>
                ))}
              </div>
              <div className="document-actions">
                {current.dirty ? (
                  <span className="save-state">Unsaved</span>
                ) : (
                  <span className="save-state">
                    <Check size={12} /> Saved
                  </span>
                )}
                {isMarkdown(current.path) && (
                  <div className="mode-switch">
                    <button
                      aria-label="Visual mode"
                      className={current.mode === "visual" ? "active" : ""}
                      onClick={() => {
                        if (current.mode !== "visual") void toggleMode(current);
                      }}
                    >
                      <PenLine size={13} /> Visual
                    </button>
                    <button
                      aria-label="Markdown source mode"
                      className={current.mode === "source" ? "active" : ""}
                      onClick={() => {
                        if (current.mode !== "source") void toggleMode(current);
                      }}
                    >
                      <Code2 size={14} /> Source
                    </button>
                  </div>
                )}
                <button
                  className="icon-button small"
                  aria-label="Save file"
                  title={`${keyboard}+S`}
                  onClick={() => void saveTab(current.path)}
                >
                  <Save />
                </button>
              </div>
            </div>
          )}
          {recovery.length > 0 && (
            <div className="recovery-banner">
              <AlertTriangle size={16} />A previous file operation needs
              recovery. Writes are paused.
              <button onClick={() => setShowSettings(true)}>
                View details
              </button>
            </div>
          )}
          <div className="editor-area">
            {tabs.map((tab) => (
              <section
                key={tab.path + ":" + tab.version}
                className={
                  "editor-pane " + (active === tab.path ? "active" : "")
                }
                inert={active !== tab.path}
                aria-label={`Editor for ${basename(tab.path)}`}
              >
                {tab.conflict && (
                  <div className="conflict-banner">
                    <AlertTriangle size={16} />
                    <span>
                      {tab.conflict === "deleted"
                        ? "File deleted or unavailable on disk."
                        : "External changes detected."}{" "}
                      Your edits are preserved.
                    </span>
                    <button onClick={() => void reviewConflict(tab)}>
                      Review changes
                    </button>
                  </div>
                )}
                {isImage(tab.path) ? (
                  <div className="image-preview">
                    <img
                      src={assetURL(tab.path, basename(tab.path))}
                      alt={basename(tab.path)}
                    />
                    <p>{tab.path}</p>
                  </div>
                ) : isMarkdown(tab.path) && tab.mode === "visual" ? (
                  <MarkdownEditor
                    path={tab.path}
                    text={tab.text}
                    onChange={(text) => edit(tab.path, text)}
                    onError={(text) => notify(text, true)}
                    onLink={(href) => void followLink(tab.path, href)}
                  />
                ) : (
                  <>
                    <div className="source-label">
                      <Code2 size={13} />
                      {isMarkdown(tab.path)
                        ? "MARKDOWN SOURCE"
                        : (
                            tab.path.split(".").pop() || "PLAIN TEXT"
                          ).toUpperCase()}
                      {isMarkdown(tab.path) && visualProtection(tab.text) && (
                        <span>
                          Source preserves {visualProtection(tab.text)}
                        </span>
                      )}
                    </div>
                    <CodeEditor
                      path={tab.path}
                      text={tab.text}
                      settings={settings}
                      active={active === tab.path}
                      allowAutoFormat={!tab.dirty && !tab.conflict}
                      onChange={(text) => edit(tab.path, text)}
                      onError={(text) => notify(text, true)}
                    />
                  </>
                )}
              </section>
            ))}
            {!current && (
              <div className="welcome">
                <div className="welcome-mark">
                  <BookOpen size={38} />
                </div>
                <div className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</div>
                <h1>
                  Make room for
                  <br />
                  <em>your next thought.</em>
                </h1>
                <p>
                  Your notes, your code, your corner of the world.
                  <br />
                  All in one quiet workspace.
                </p>
                <div className="welcome-buttons">
                  <button
                    className="primary"
                    onClick={() => void chooseWorkspace()}
                  >
                    <FolderOpen size={17} />
                    {root ? "Open another folder" : "Open a folder"}
                    <ArrowUpRight size={15} />
                  </button>
                  {root && (
                    <button onClick={() => void createEntry(false)}>
                      <Plus size={17} />
                      New document
                    </button>
                  )}
                </div>
                {recent.length > 0 && (
                  <div className="recent-list">
                    <span className="eyebrow">RECENT WORKSPACES</span>
                    {recent.slice(0, 4).map((folder) => (
                      <button
                        key={folder}
                        onClick={() => void chooseWorkspace(folder)}
                      >
                        <Folder size={17} />
                        <strong>{basename(folder)}</strong>
                        <span>{folder}</span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
                <div className="welcome-shortcuts">
                  <span>
                    <kbd>{keyboard} P</kbd> Find a file
                  </span>
                  <span>
                    <kbd>{keyboard} ⇧ P</kbd> All commands
                  </span>
                  <span>
                    <kbd>{keyboard} `</kbd> Terminal
                  </span>
                </div>
              </div>
            )}
            {showOutline && current && isMarkdown(current.path) && (
              <aside className="outline">
                <div className="sidebar-heading">
                  ON THIS PAGE
                  <button
                    className="icon-button small"
                    aria-label="Close outline"
                    onClick={() => setShowOutline(false)}
                  >
                    <X />
                  </button>
                </div>
                {outline.length ? (
                  outline.map((item) => (
                    <button
                      key={item.index}
                      style={{
                        paddingLeft: 12 + (item.match![1].length - 1) * 10,
                      }}
                      onClick={() => {
                        if (current.mode === "source") {
                          window.dispatchEvent(
                            new CustomEvent("margin:goto-line", {
                              detail: {
                                path: current.path,
                                line: item.index + 1,
                              },
                            }),
                          );
                          return;
                        }
                        const headings = appRef.current
                          ?.querySelector(".editor-pane.active")
                          ?.querySelectorAll("h1,h2,h3,h4,h5,h6");
                        const match = Array.from(headings || []).find(
                          (h) => h.textContent === item.match![2],
                        );
                        match?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      {item.match![2]}
                    </button>
                  ))
                ) : (
                  <p>Add a heading to start an outline.</p>
                )}
              </aside>
            )}
          </div>
          {settings.terminalVisible && !settings.focusMode && (
            <div
              className="resize-handle terminal-resize"
              role="separator"
              aria-label="Resize terminal"
              aria-orientation="horizontal"
              tabIndex={0}
              onPointerDown={(e) => resizePanel(e, "terminal")}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  void updateSettings({
                    terminalHeight: Math.min(
                      window.innerHeight - 300,
                      Math.max(
                        120,
                        settings.terminalHeight +
                          (e.key === "ArrowUp" ? 20 : -20),
                      ),
                    ),
                  });
                }
              }}
            />
          )}
          <section
            className={
              "terminal-panel " +
              (settings.terminalVisible && !settings.focusMode ? "visible" : "")
            }
            style={{ height: settings.terminalHeight }}
            aria-label="Integrated terminal"
          >
            <div className="terminal-header">
              <span className="terminal-label">
                <TerminalSquare size={14} />
                TERMINAL
              </span>
              <div className="terminal-tabs">
                {terminalTabs.map((terminal, index) => (
                  <div
                    key={terminal.id}
                    className={terminalActive === terminal.id ? "active" : ""}
                  >
                    <button onClick={() => setTerminalActive(terminal.id)}>
                      {terminal.name} <span>{index + 1}</span>
                    </button>
                    <button
                      aria-label={`Close terminal ${index + 1}`}
                      onClick={() => void removeTerminal(terminal.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <span className="grow" />
              <select
                aria-label="Terminal shell"
                value={chosenShell}
                onChange={(e) => setChosenShell(e.target.value)}
              >
                {shells.map((shell) => (
                  <option key={shell}>{shell}</option>
                ))}
              </select>
              <button
                className="icon-button small"
                aria-label="New terminal"
                title="New terminal"
                disabled={!root}
                onClick={() => void addTerminal()}
              >
                <Plus />
              </button>
              <button
                className="icon-button small"
                aria-label="Hide terminal"
                onClick={() => void updateSettings({ terminalVisible: false })}
              >
                <PanelBottomClose />
              </button>
            </div>
            <div className="terminal-body">
              {terminalTabs.map((info) => (
                <TerminalView
                  key={info.id}
                  info={info}
                  active={
                    terminalActive === info.id &&
                    settings.terminalVisible &&
                    !settings.focusMode
                  }
                  theme={settings.theme}
                  onError={(text) => notify(text, true)}
                />
              ))}
              {!terminalTabs.length && (
                <div className="terminal-empty">
                  <TerminalSquare size={25} />
                  <span>A real shell, right where you work.</span>
                  <button disabled={!root} onClick={() => void addTerminal()}>
                    <Plus size={14} />
                    Open {chosenShell || "terminal"}
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
      <footer className="status-bar">
        <div className="status-left">
          <span className="local-indicator" />
          <span>
            {busy
              ? "Updating files and references…"
              : "Local · " + (root ? "Workspace ready" : "No workspace")}
          </span>
          {busy && <LoaderCircle size={12} className="spinner" />}
        </div>
        <span className="grow" />
        {current && (
          <>
            <span>
              {current.text.trim()
                ? current.text.trim().split(/\s+/).length
                : 0}{" "}
              words
            </span>
            <span>UTF-8</span>
            <span>{current.text.includes("\r\n") ? "CRLF" : "LF"}</span>
            <span>
              {isMarkdown(current.path)
                ? "Markdown"
                : current.path.split(".").pop()?.toUpperCase()}
            </span>
          </>
        )}
        <button
          title="Autosave preferences"
          onClick={() => setShowSettings(true)}
        >
          <span
            className={
              "autosave-dot " + (settings.autosave === "off" ? "off" : "")
            }
          />
          Autosave {settings.autosave === "off" ? "off" : "on"}
        </button>
        <button
          aria-label="Toggle bottom panel"
          onClick={() =>
            void updateSettings({ terminalVisible: !settings.terminalVisible })
          }
        >
          {settings.terminalVisible ? (
            <PanelBottomClose size={14} />
          ) : (
            <PanelBottomOpen size={14} />
          )}
        </button>
      </footer>
      {message && (
        <div
          className={"toast " + (message.error ? "error" : "")}
          role={message.error ? "alert" : "status"}
        >
          {message.error ? <AlertTriangle size={17} /> : <Check size={17} />}
          <span>{message.text}</span>
          <button
            className="icon-button small"
            aria-label="Dismiss notification"
            onClick={() => setMessage(null)}
          >
            <X />
          </button>
        </div>
      )}
      {busy && (
        <div
          className="operation-veil"
          aria-label="Filesystem operation in progress"
        />
      )}
      {context && (
        <div
          className="context-menu"
          style={{
            left: Math.min(context.x, window.innerWidth - 230),
            top: Math.min(context.y, window.innerHeight - 210),
          }}
          role="menu"
        >
          <button role="menuitem" onClick={() => void moveEntry(context.path)}>
            <Pencil size={14} />
            Rename / move<span>F2</span>
          </button>
          <button
            role="menuitem"
            onClick={() => void duplicateEntry(context.path)}
          >
            <Copy size={14} />
            Duplicate
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setSelected(context.path);
              setContext(null);
              void createEntry(false);
            }}
          >
            <FilePlus2 size={14} />
            New document here
          </button>
          <hr />
          <button
            role="menuitem"
            className="danger-text"
            onClick={() => void deleteEntry(context.path)}
          >
            <Trash2 size={14} />
            Move to Trash<span>Del</span>
          </button>
        </div>
      )}
      {palette && (
        <div
          className="modal-scrim palette-scrim"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPalette(null);
          }}
        >
          <div
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label={palette === "files" ? "Quick open" : "Command palette"}
          >
            <div className="palette-input">
              {palette === "files" ? (
                <Search size={19} />
              ) : (
                <Command size={19} />
              )}
              <input
                autoFocus
                aria-label={
                  palette === "files" ? "Search files" : "Search commands"
                }
                placeholder={
                  palette === "files"
                    ? "Search your workspace…"
                    : "What would you like to do?"
                }
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPaletteIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPaletteIndex((i) =>
                      Math.min(i + 1, paletteItems.length - 1),
                    );
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPaletteIndex((i) => Math.max(0, i - 1));
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const item = paletteItems[paletteIndex];
                    if (item) {
                      setPalette(null);
                      void item.run();
                    }
                  }
                }}
              />
              <kbd>esc</kbd>
            </div>
            <div className="palette-caption">
              {palette === "files"
                ? "FILES IN YOUR WORKSPACE"
                : "WORKSPACE COMMANDS"}
            </div>
            <div className="palette-results">
              {paletteItems.map((item, index) => (
                <button
                  key={item.label + item.detail + index}
                  className={paletteIndex === index ? "active" : ""}
                  onMouseEnter={() => setPaletteIndex(index)}
                  onClick={() => {
                    setPalette(null);
                    void item.run();
                  }}
                >
                  {palette === "files" ? (
                    <FileIcon path={item.label} />
                  ) : (
                    <Command size={15} />
                  )}
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </button>
              ))}
              {!paletteItems.length && (
                <p>No matches. Try a different search.</p>
              )}
            </div>
            <div className="palette-footer">
              <span>↑ ↓ to navigate</span>
              <span>↵ to open</span>
              <button
                onClick={() => {
                  setPalette(palette === "files" ? "commands" : "files");
                  setQuery("");
                  setPaletteIndex(0);
                }}
              >
                {palette === "files" ? "Switch to commands" : "Switch to files"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSettings && (
        <div
          className="modal-scrim"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <div
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Preferences"
          >
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                <h2>Preferences</h2>
              </div>
              <button
                className="icon-button"
                autoFocus
                aria-label="Close preferences"
                onClick={() => setShowSettings(false)}
              >
                <X />
              </button>
            </div>
            <div className="settings-content">
              <div className="settings-section">
                <h3>Appearance & editing</h3>
                <label>
                  Automatically format code on open
                  <input
                    type="checkbox"
                    aria-label="Automatically format code on open"
                    checked={settings.formatOnOpen}
                    onChange={(event) => {
                      const formatOnOpen = event.target.checked;
                      setSettings((previous) => ({
                        ...previous,
                        formatOnOpen,
                      }));
                      void updateSettings({ formatOnOpen });
                    }}
                  />
                </label>
                <p>
                  Format supported code with your indentation setting when
                  opening it. Formatting is undoable and follows your autosave
                  policy. Unsupported or invalid code is kept unchanged.
                </p>
                <label>
                  Color theme
                  <select
                    value={settings.theme}
                    onChange={(e) =>
                      void updateSettings({
                        theme: e.target.value as Settings["theme"],
                      })
                    }
                  >
                    <option value="light">Daylight · light</option>
                    <option value="dark">Nightfall · dark</option>
                  </select>
                </label>
                <label>
                  Code font size
                  <select
                    value={settings.fontSize}
                    onChange={(e) =>
                      void updateSettings({ fontSize: Number(e.target.value) })
                    }
                  >
                    {[12, 13, 14, 15, 16, 18, 20, 24].map((n) => (
                      <option key={n} value={n}>
                        {n} px
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Indentation
                  <select
                    aria-label="Indentation"
                    value={settings.indentSize}
                    onChange={(e) =>
                      void updateSettings({
                        indentSize: Number(e.target.value),
                      })
                    }
                  >
                    {[2, 4, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} spaces
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="settings-section">
                <h3>Saving & recovery</h3>
                <label>
                  Autosave policy
                  <select
                    aria-label="Autosave policy"
                    value={settings.autosave}
                    onChange={(e) =>
                      void updateSettings({
                        autosave: e.target.value as Settings["autosave"],
                      })
                    }
                  >
                    <option value="afterDelay">After a pause</option>
                    <option value="onBlur">When window loses focus</option>
                    <option value="off">Manual save</option>
                  </select>
                </label>
                <label>
                  Autosave delay
                  <select
                    value={settings.autosaveDelay}
                    onChange={(e) =>
                      void updateSettings({
                        autosaveDelay: Number(e.target.value),
                      })
                    }
                  >
                    {[500, 1000, 1500, 3000, 5000, 10000].map((n) => (
                      <option key={n} value={n}>
                        {n / 1000} seconds
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  Recovery drafts are saved separately from your files. External
                  modifications are never silently overwritten.
                </p>
                <button
                  className="text-button"
                  onClick={() => void window.margin.openRecovery()}
                >
                  Open file-operation recovery folder <ArrowUpRight size={14} />
                </button>
                {recovery.map((r) => (
                  <p className="danger-text" key={r.file}>
                    {r.file}
                    <br />
                    {r.message}
                  </p>
                ))}
              </div>
              <div className="settings-section">
                <h3>Images & attachments</h3>
                <label>
                  Storage location
                  <select
                    aria-label="Attachment location"
                    value={settings.attachmentMode}
                    onChange={(e) =>
                      void updateSettings({
                        attachmentMode: e.target
                          .value as Settings["attachmentMode"],
                      })
                    }
                  >
                    <option value="workspace">
                      Relative to workspace root
                    </option>
                    <option value="nearby">
                      Relative to the Markdown file
                    </option>
                  </select>
                </label>
                <label>
                  Folder path
                  <input
                    aria-label="Attachment folder"
                    defaultValue={settings.attachmentFolder}
                    placeholder="assets"
                    onBlur={(e) => {
                      if (e.target.value !== settings.attachmentFolder)
                        void updateSettings({
                          attachmentFolder: e.target.value,
                        });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </label>
                <p>
                  Paste screenshots with {keyboard}+V, use the image button, or
                  drop images into a visual document. PNG, JPEG, GIF and WebP
                  images are saved as ordinary files with portable relative
                  paths.
                </p>
              </div>
              <div className="settings-section">
                <h3>Workspace filtering</h3>
                <label className="stacked">
                  Ignored folder and file names
                  <input
                    aria-label="Ignored directories"
                    defaultValue={settings.ignored.join(", ")}
                    onBlur={(e) => {
                      const ignored = e.target.value
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean);
                      if (
                        JSON.stringify(ignored) !==
                        JSON.stringify(settings.ignored)
                      )
                        void (async () => {
                          if (
                            !(await settleEdits(
                              "Changing workspace exclusions",
                            ))
                          )
                            return;
                          await updateSettings({ ignored });
                          setTerminalTabs([]);
                          await refreshTree();
                        })();
                    }}
                  />
                </label>
                <p>
                  Comma-separated exact names. These directories are excluded
                  from the explorer, watcher, and reference updates. Links
                  inside excluded notes are not managed. The .git directory is
                  always excluded.
                </p>
              </div>
              <div className="settings-about">
                <BookOpen size={24} />
                <div>
                  <strong>Margin 1.1</strong>
                  <span>A workspace for words and work.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {dialog && (
        <div className="modal-scrim dialog-scrim">
          <form
            className={"action-dialog " + (dialog.extra ? "wide" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={dialog.title}
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog.input !== undefined && dialogInput.trim())
                answer("submit");
            }}
          >
            <h2>{dialog.title}</h2>
            {dialog.description && <p>{dialog.description}</p>}
            {dialog.input !== undefined && (
              <label>
                {dialog.label || "Name"}
                <input
                  autoFocus
                  aria-label={dialog.label || "Name"}
                  value={dialogInput}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setDialogInput(e.target.value)}
                />
              </label>
            )}
            {dialog.extra}
            <div className="dialog-actions">
              {dialog.choices.map((choice, index) => (
                <button
                  key={choice.id}
                  autoFocus={dialog.input === undefined && index === 0}
                  className={
                    choice.primary ? "primary" : choice.danger ? "danger" : ""
                  }
                  type={choice.id === "submit" ? "submit" : "button"}
                  disabled={choice.id === "submit" && !dialogInput.trim()}
                  onClick={() => {
                    if (choice.id !== "submit") answer(choice.id);
                  }}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
