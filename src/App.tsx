import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Code2,
  PenLine,
  Eye,
  Check,
  ArrowUpRight,
  Command,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  SearchCode,
  Pin,
  Folder,
  PanelBottomClose,
  PanelBottomOpen,
  ListChecks,
  LoaderCircle,
  Presentation,
} from "lucide-react";
import { MarkdownEditor } from "./editors/MarkdownEditor";
import { CodeEditor } from "./editors/CodeEditor";
import { supportsFormatting } from "./lib/formatting";
import { PreferencesDialog } from "./components/PreferencesDialog";
import { preferenceCategories } from "./lib/preferences";
import { Tooltip } from "./components/Tooltip";
import { useContextMenu } from "./components/ContextMenu";
import { revealLabel } from "./lib/edit-menu";
import { markdownSections, sectionSlug } from "./lib/sections";
import { editorHandle } from "./lib/editor-position";
import { NavigationHistory, type NavigationEntry } from "./lib/navigation";
import { WorkspaceSearch, emptySearch } from "./components/WorkspaceSearch";
import { DocumentOutline } from "./components/DocumentOutline";
import { selectionRoots } from "../electron/selection.mjs";
import { isBrowserFile } from "../electron/browser-files.mjs";
import { HistoryDialog } from "./components/HistoryDialog";
import { PdfExportDialog } from "./components/PdfExportDialog";
import { ConflictDiff } from "./components/ConflictDiff";
import { CompareFilesDialog } from "./components/CompareFilesDialog";
import { MoveDestinationPicker } from "./components/MoveDestinationPicker";
import { useExplorerDrag } from "./components/useExplorerDrag";
import { movePath, moveProblem } from "./lib/explorer-move";
import { quickFiles, parseFileQuery, lineOffset } from "./lib/quick-open";
import { ImagePreview } from "./components/ImagePreview";
import { HtmlPreview } from "./components/HtmlPreview";
import { LivePreview, supportsLivePreview } from "./components/LivePreview";
import { PreviewDivider } from "./components/PreviewDivider";
import { MarkdownPreview } from "./components/MarkdownPreview";
import {
  documentMode,
  previewType,
  supportsVisualMode,
  isPDF,
  isReadOnlyPreview,
} from "./lib/document-mode";
import { TerminalView } from "./components/TerminalPanel";
import {
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
  EditorPosition,
  ClosedTab,
  SearchMatch,
  SpellcheckInfo,
  EditorSplit,
} from "./types";

const PdfPreview = lazy(() => import("./components/PdfPreview"));

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
  movePaths?: string[];
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
  presentationMode: false,
  presentationFontSize: 24,
  presentationTheme: "inherit",
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
  ) : isPDF(path) ? (
    <FileText size={16} className="pdf-icon" />
  ) : (
    <FileCode2 size={16} className="code-icon" />
  );
}

export default function App() {
  const { openMenu, closeMenu } = useContextMenu();
  const [split, setSplitState] = useState<EditorSplit | null>(null);
  const splitRef = useRef(split);
  splitRef.current = split;
  const setSplit = (next: EditorSplit | null) => {
    splitRef.current = next;
    setSplitState(next);
  };
  const [livePreview, setLivePreview] = useState(false);
  const livePreviewRef = useRef(livePreview);
  livePreviewRef.current = livePreview;
  const [previewTarget, setPreviewTarget] = useState("");
  const previewTargetRef = useRef(previewTarget);
  previewTargetRef.current = previewTarget;
  const [previewRatio, setPreviewRatio] = useState(50);
  const previewRatioRef = useRef(previewRatio);
  previewRatioRef.current = previewRatio;
  const [previewRevision, setPreviewRevision] = useState(0);
  const [historyPath, setHistoryPath] = useState("");
  const [comparison, setComparison] = useState<{
    left: string;
    right: string;
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const selectionAnchor = useRef("");
  const positions = useRef(new Map<string, EditorPosition>());
  const recentFiles = useRef<string[]>([]);
  const paletteBeside = useRef(false);
  const draggedTab = useRef<string | null>(null);
  const explorerTyping = useRef({ value: "", time: 0 });
  const closedTabs = useRef<ClosedTab[]>([]);
  const [reopeningClosed, setReopeningClosed] = useState(false);
  const navigation = useRef(new NavigationHistory());
  const editorInteraction = useRef(0);
  const navigationToken = useRef(0),
    transitioning = useRef(false);
  const [navigationRevision, redrawNavigation] = useState(0);
  const [sidebarMode, setSidebarMode] = useState<"files" | "search">("files");
  const [searchOptions, setSearchOptions] = useState(emptySearch);
  const [settings, setSettings] = useState(initialSettings),
    settingsRef = useRef(settings);
  settingsRef.current = settings;
  const displayTheme =
    settings.presentationMode && settings.presentationTheme !== "inherit"
      ? settings.presentationTheme
      : settings.theme;
  const [defaultSettings, setDefaultSettings] = useState(initialSettings);
  const [spellcheck, setSpellcheck] = useState<SpellcheckInfo | null>(null);
  const [root, setRoot] = useState(""),
    rootRef = useRef(root);
  rootRef.current = root;
  const [entries, setEntries] = useState<Entry[]>([]),
    [recent, setRecent] = useState<string[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]),
    tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const previewOverlays = useMemo(
    () =>
      tabs
        .filter((tab) => tab.dirty && !isReadOnlyPreview(tab.path))
        .map(({ path, text }) => ({ path, text })),
    [tabs],
  );
  const [active, setActive] = useState(""),
    activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (supportsLivePreview(active)) setPreviewTarget(active);
  }, [active]);
  const [expanded, setExpanded] = useState<string[]>([]),
    expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const [selected, setSelected] = useState(""),
    [treeFilter, setTreeFilter] = useState("");
  const explorerDrag = useExplorerDrag({
    entries,
    expand: (directory) =>
      setExpanded((previous) =>
        previous.includes(directory) ? previous : [...previous, directory],
      ),
    move: (paths, directory) => void moveSelected(paths, directory),
  });
  useEffect(() => {
    const existing = new Set(entries.map((entry) => entry.path));
    const next = selectionRef.current.filter((name) => existing.has(name));
    if (next.length !== selectionRef.current.length) {
      selectionRef.current = next;
      setSelection(next);
    }
  }, [entries]);
  const [palette, setPalette] = useState<"files" | "commands" | null>(null),
    [query, setQuery] = useState(""),
    [paletteIndex, setPaletteIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false),
    [showOutline, setShowOutline] = useState(false);
  const [formatState, setFormatState] = useState({
    path: "",
    text: "",
    busy: false,
  });
  const formatStatusChanged = useCallback(
    (path: string, text: string, busy: boolean) => {
      setFormatState({ path, text, busy });
    },
    [],
  );
  const [dialog, setDialog] = useState<DialogSpec | null>(null),
    [dialogInput, setDialogInput] = useState("");
  const [pdfSource, setPdfSource] = useState<{
    path: string;
    directory: boolean;
    label: string;
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
    const value =
      id === "submit"
        ? dialogInput.trim()
        : id === "cancel" && dialog?.movePaths
          ? null
          : id;
    const current = dialog;
    setDialog(null);
    current?.resolve(value);
  };
  const changeTabs = (fn: (previous: Tab[]) => Tab[]) => {
    const next = fn(tabsRef.current);
    tabsRef.current = next;
    setTabs(next);
  };
  function capturePosition(
    name = activeRef.current,
  ): EditorPosition | undefined {
    const tab = tabsRef.current.find((tab) => tab.path === name);
    if (
      tab &&
      (name === activeRef.current ||
        splitRef.current?.left === name ||
        splitRef.current?.right === name) &&
      !isImage(name)
    ) {
      const saved = editorHandle(name, tab.mode)?.capture();
      if (saved) positions.current.set(name, saved);
    }
    return positions.current.get(name) || tab?.position;
  }
  function currentLocation(): NavigationEntry | undefined {
    return activeRef.current
      ? { path: activeRef.current, position: capturePosition() }
      : undefined;
  }
  useEffect(() => {
    document
      .querySelector(".editor-tab.active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, tabs.map((tab) => tab.path).join("\0")]);
  useEffect(() => {
    if (!palette) paletteBeside.current = false;
  }, [palette]);
  useEffect(() => {
    document
      .querySelector('[data-palette-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [paletteIndex, palette, query]);
  function pinTab(path: string) {
    changeTabs((previous) => {
      const updated = previous.map((tab) =>
        tab.path === path ? { ...tab, pinned: !tab.pinned } : tab,
      );
      return [
        ...updated.filter((tab) => tab.pinned),
        ...updated.filter((tab) => !tab.pinned),
      ];
    });
  }
  function reorderTab(path: string, target?: string) {
    if (!target || path === target) return;
    changeTabs((previous) => {
      const tab = previous.find((tab) => tab.path === path),
        other = previous.find((tab) => tab.path === target);
      if (!tab || !other || !!tab.pinned !== !!other.pinned) return previous;
      const index = previous.indexOf(other),
        remaining = previous.filter((entry) => entry !== tab);
      remaining.splice(index, 0, tab);
      return remaining;
    });
  }
  async function saveAs(path: string, copy: boolean) {
    const tab = tabsRef.current.find((tab) => tab.path === path);
    if (!tab || isReadOnlyPreview(path)) return;
    const savedPosition = capturePosition(path);
    const dot = path.lastIndexOf("."),
      suggested =
        dot > path.lastIndexOf("/")
          ? path.slice(0, dot) + " copy" + path.slice(dot)
          : path + " copy";
    const name = await ask({
      title: copy ? "Save a copy" : "Save as",
      description: copy
        ? "Save the current editor contents to a new file. Your original tab and edits stay open."
        : "Save the current editor contents under a new path. The original file on disk stays in place. Relative Markdown links keep their targets.",
      input: suggested,
      label: "Workspace-relative path",
      choices: [
        { id: "submit", label: copy ? "Save copy" : "Save as", primary: true },
        { id: "cancel", label: "Cancel" },
      ],
    });
    if (!name || name === "cancel") return;
    if (tabsRef.current.some((entry) => entry.path === name)) {
      notify("This destination is already open. Choose a new path.", true);
      return;
    }
    try {
      const doc = await window.margin.saveCopy(path, name, tab.text);
      const latest = tabsRef.current.find((entry) => entry.path === path);
      const replace = !copy && latest?.text === tab.text;
      const created: Tab = {
        ...doc,
        baseline: doc.text,
        dirty: false,
        mode: documentMode(doc.path, doc.text, tab.mode),
        version: 0,
        suppressAutoFormat: true,
        pinned: replace ? tab.pinned : false,
        position: savedPosition,
      };
      if (savedPosition) positions.current.set(doc.path, savedPosition);
      if (replace && splitRef.current) {
        const pair = splitRef.current;
        setSplit({
          ...pair,
          left: pair.left === path ? doc.path : pair.left,
          right: pair.right === path ? doc.path : pair.right,
        });
      }
      changeTabs((previous) =>
        replace
          ? previous.map((entry) => (entry.path === path ? created : entry))
          : [...previous, created],
      );
      await refreshTree();
      if (!copy)
        await openFile(doc.path, undefined, {
          position: savedPosition,
          preserveText: true,
        });
      await persist();
      notify(
        copy
          ? "Saved a copy of your editor contents."
          : "Saved under the new path.",
      );
    } catch (error) {
      fail(error);
    }
  }
  const updateSettings = async (
    patch: Partial<Settings>,
    optimistic = false,
  ) => {
    const previous = settingsRef.current;
    if (optimistic) {
      settingsRef.current = { ...previous, ...patch };
      setSettings(settingsRef.current);
    }
    try {
      const next = await window.margin.settings(patch);
      settingsRef.current = next;
      setSettings(next);
      return true;
    } catch (e) {
      if (optimistic) {
        settingsRef.current = previous;
        setSettings(previous);
      }
      fail(e);
      return false;
    }
  };
  async function resetPreferences(categories: string[]) {
    const groups = preferenceCategories.filter((item) =>
      categories.includes(item.id),
    );
    const title = groups.map((group) => group.title).join(", ");
    const choice = await ask({
      title: "Restore default preferences?",
      description: `Restore ${title} to the application defaults. Changes apply immediately, including autosave and history retention when selected.`,
      choices: [
        { id: "restore", label: "Restore defaults", primary: true },
        { id: "cancel", label: "Cancel" },
      ],
    });
    if (choice !== "restore") return;
    const patch: Partial<Settings> = Object.fromEntries(
      groups.flatMap((group) =>
        group.keys.map((key) => [key, defaultSettings[key]]),
      ),
    );
    const changesIgnored =
      patch.ignored &&
      JSON.stringify(patch.ignored) !==
        JSON.stringify(settingsRef.current.ignored);
    if (
      changesIgnored &&
      !(await settleEdits("Restoring workspace exclusions"))
    )
      return;
    if (await updateSettings(patch)) {
      if (changesIgnored) {
        setTerminalTabs([]);
        await refreshTree();
      }
      notify("Default preferences restored.");
    }
  }
  const persist = async () => {
    if (rootRef.current && !transitioning.current) {
      capturePosition();
      if (splitRef.current) {
        capturePosition(splitRef.current.left);
        capturePosition(splitRef.current.right);
      }
      await window.margin.persist({
        tabs: tabsRef.current.map((tab) => ({
          ...tab,
          position: positions.current.get(tab.path) || tab.position,
        })),
        active: activeRef.current,
        expanded: expandedRef.current,
        closedTabs: closedTabs.current,
        recentFiles: recentFiles.current,
        split: splitRef.current,
        livePreview: livePreviewRef.current,
        previewTarget: previewTargetRef.current,
        previewRatio: previewRatioRef.current,
      });
    }
  };
  const refreshTree = async () => {
    if (rootRef.current) setEntries(await window.margin.tree());
  };

  async function restore(opened: OpenedWorkspace) {
    setPdfSource(null);
    navigationToken.current++;
    setSplit(null);
    setLivePreview(opened.session?.livePreview === true);
    setPreviewTarget(opened.session?.previewTarget || "");
    setPreviewRatio(
      Math.max(20, Math.min(80, opened.session?.previewRatio ?? 50)),
    );
    setHistoryPath("");
    setSelectionMode(false);
    setSelection([]);
    positions.current = new Map(
      (opened.session?.tabs || []).flatMap((tab) =>
        tab.position ? [[tab.path, tab.position] as const] : [],
      ),
    );
    closedTabs.current = opened.session?.closedTabs || [];
    recentFiles.current = opened.session?.recentFiles || [];
    setSidebarMode("files");
    rootRef.current = opened.root;
    setRoot(opened.root);
    setEntries(opened.entries);
    setTerminalTabs([]);
    setTerminalActive("");
    setSelected("");
    const restored: Tab[] = [];
    for (const saved of opened.session?.tabs || []) {
      try {
        if (isReadOnlyPreview(saved.path)) {
          restored.push({
            ...saved,
            text: "",
            baseline: "",
            dirty: false,
            conflict: undefined,
            mode: "source",
            version: 0,
          });
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
          mode: documentMode(
            saved.path,
            dirty ? saved.text : disk.text,
            saved.mode,
          ),
          version: 0,
          position: saved.position,
          suppressAutoFormat: saved.suppressAutoFormat,
          pinned: saved.pinned,
          ...(dirty && disk.revision !== saved.revision
            ? { conflict: disk }
            : {}),
        });
      } catch {
        if (saved.dirty)
          restored.push({ ...saved, conflict: "deleted", version: 0 });
      }
    }
    changeTabs(() => [
      ...restored.filter((tab) => tab.pinned),
      ...restored.filter((tab) => !tab.pinned),
    ]);
    const nextActive =
      restored.find((t) => t.path === opened.session?.active)?.path ||
      restored[0]?.path ||
      "";
    setActive(nextActive);
    activeRef.current = nextActive;
    const savedSplit = opened.session?.split;
    if (
      savedSplit &&
      savedSplit.left !== savedSplit.right &&
      (nextActive === savedSplit.left || nextActive === savedSplit.right) &&
      restored.some((tab) => tab.path === savedSplit.left) &&
      (restored.some((tab) => tab.path === savedSplit.right) ||
        (savedSplit.assignment && !savedSplit.right))
    )
      setSplit(savedSplit);
    navigation.current.reset(
      nextActive
        ? { path: nextActive, position: positions.current.get(nextActive) }
        : undefined,
    );
    redrawNavigation((value) => value + 1);
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
    const updateSpelling = (info: SpellcheckInfo) =>
      setSpellcheck((previous) =>
        !previous || info.revision >= previous.revision ? info : previous,
      );
    const unsubscribe = window.margin.onSpellcheckChanged(updateSpelling);
    void window.margin
      .bootstrap()
      .then(async (data) => {
        setDefaultSettings(data.defaults);
        setSettings(data.settings);
        settingsRef.current = data.settings;
        setRecent(data.recent);
        setShells(data.shells);
        setChosenShell(data.shells[0] || "");
        setRecovery(data.recovery);
        setPlatform(data.platform);
        updateSpelling(data.spellcheck);
        if (data.workspace) await restore(data.workspace);
        if (data.error) notify(data.error, true);
      })
      .catch(fail)
      .finally(() => setLoading(false));
    return unsubscribe;
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = displayTheme;
  }, [displayTheme]);
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
  }, [
    tabs,
    active,
    expanded,
    root,
    loading,
    split,
    livePreview,
    previewTarget,
    previewRatio,
    navigationRevision,
  ]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const changed = (event: Event) => {
      const name = (event as CustomEvent<{ path: string }>).detail.path;
      if (
        name !== activeRef.current &&
        name !== splitRef.current?.left &&
        name !== splitRef.current?.right
      )
        return;
      capturePosition(name);
      clearTimeout(timer);
      timer = setTimeout(() => {
        void persist().catch(fail);
      }, 400);
    };
    window.addEventListener("margin:position-changed", changed);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("margin:position-changed", changed);
    };
  }, []);

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
        if (isReadOnlyPreview(tab.path)) return null;
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
          mode: documentMode(tab.path, update.disk.text, tab.mode),
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
        setPreviewRevision((value) => value + 1);
        if (busyRef.current) return;
        const pdfPositions = new Map(
          tabsRef.current
            .filter((tab) => isPDF(tab.path) && paths.includes(tab.path))
            .map((tab) => [tab.path, capturePosition(tab.path)]),
        );
        if (pdfPositions.size)
          changeTabs((previous) =>
            previous.map((tab) =>
              pdfPositions.has(tab.path)
                ? {
                    ...tab,
                    position: pdfPositions.get(tab.path),
                    version: tab.version + 1,
                  }
                : tab,
            ),
          );
        void refreshTree().catch(fail);
        void reloadTabs().catch(fail);
      }),
    [],
  );
  async function openFile(
    name: string,
    anchor?: string,
    target?: {
      position?: EditorPosition;
      range?: { from: number; to: number; value?: string };
      mode?: Tab["mode"];
      preserveText?: boolean;
      line?: number;
      column?: number;
    },
    record = true,
  ): Promise<boolean> {
    if (busyRef.current || transitioning.current) return false;
    const before = currentLocation();
    const interactionBefore = editorInteraction.current;
    const token = ++navigationToken.current;
    try {
      let tab = tabsRef.current.find((tab) => tab.path === name);
      if (!tab) {
        if (isReadOnlyPreview(name))
          tab = {
            path: name,
            text: "",
            baseline: "",
            revision: "",
            dirty: false,
            mode: "source",
            version: 0,
          };
        else {
          const doc = await window.margin.read(name);
          if (token !== navigationToken.current) return false;
          const protection = isMarkdown(name)
            ? visualProtection(doc.text)
            : null;
          tab = {
            ...doc,
            baseline: doc.text,
            dirty: false,
            mode: documentMode(name, doc.text),
            version: 0,
            suppressAutoFormat: target?.preserveText,
          };
          if (isMarkdown(name) && protection)
            notify(`Opened in Source to preserve ${protection}.`);
        }
        changeTabs((previous) =>
          previous.some((entry) => entry.path === name)
            ? previous
            : [...previous, tab!],
        );
      }
      const mode = documentMode(
        name,
        tab.text,
        target?.mode ??
          (livePreviewRef.current && supportsLivePreview(name)
            ? "source"
            : tab.mode),
      );
      if (target?.position) positions.current.set(name, target.position);
      const mounted =
        activeRef.current === name &&
        tab.mode === mode &&
        editorHandle(name, mode);
      if (tab.mode !== mode || target?.position || target?.preserveText)
        changeTabs((previous) =>
          previous.map((entry) =>
            entry.path === name
              ? {
                  ...entry,
                  mode,
                  position: positions.current.get(name),
                  suppressAutoFormat:
                    entry.suppressAutoFormat || target?.preserveText,
                }
              : entry,
          ),
        );
      const pair = splitRef.current;
      if (pair && pair.left !== name && pair.right !== name)
        setSplit(
          pair.assignment || activeRef.current === pair.right
            ? { ...pair, right: name }
            : { ...pair, left: name },
        );
      setActive(name);
      activeRef.current = name;
      const parents = name
        .split("/")
        .slice(0, -1)
        .map((_, index, parts) => parts.slice(0, index + 1).join("/"));
      setExpanded((previous) => [...new Set([...previous, ...parents])]);
      // Mount/activate the editor and let its initial view restoration settle.
      if (!mounted)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      if (token !== navigationToken.current || activeRef.current !== name)
        return false;
      const handle = editorHandle(name, mode);
      tab = tabsRef.current.find((entry) => entry.path === name) || tab;
      let range = target?.range;
      if (target?.line) {
        const offset = lineOffset(tab.text, target.line, target.column);
        range = { from: offset, to: offset };
      }
      if (
        range?.value &&
        tab.text.slice(range.from, range.to) !== range.value
      ) {
        const ahead = tab.text.indexOf(range.value, range.from),
          behind = tab.text.lastIndexOf(range.value, range.from);
        const nearest =
          ahead < 0
            ? behind
            : behind < 0
              ? ahead
              : ahead - range.from < range.from - behind
                ? ahead
                : behind;
        if (nearest >= 0)
          range = { ...range, from: nearest, to: nearest + range.value.length };
        else {
          notify("This search result has changed. Search again.", true);
          range = undefined;
        }
      }
      if (anchor && isMarkdown(name)) {
        const sections = markdownSections(tab.text);
        const section =
          sections.find((item) => item.anchor === anchor.normalize("NFC")) ||
          sections.find((item) => item.anchor === sectionSlug(anchor));
        if (section) range = { from: section.from, to: section.from };
      }
      // A click or typing during activation takes precedence over a delayed restore.
      if (editorInteraction.current === interactionBefore) {
        if (range) handle?.reveal(range.from, range.to);
        else {
          const saved =
            target?.position || positions.current.get(name) || tab.position;
          if (saved) handle?.restore(saved);
          else handle?.focus?.();
        }
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (token !== navigationToken.current) return false;
      if (record)
        navigation.current.record(before, {
          path: name,
          position: capturePosition(name),
        });
      recentFiles.current = [
        name,
        ...recentFiles.current.filter((path) => path !== name),
      ].slice(0, 100);
      redrawNavigation((value) => value + 1);
      return true;
    } catch (error) {
      if (token === navigationToken.current) fail(error);
      return false;
    }
  }
  function focusPane(name: string) {
    if (activeRef.current === name) return;
    capturePosition();
    editorInteraction.current++;
    setActive(name);
    activeRef.current = name;
  }
  function toggleAssignment() {
    const pair = splitRef.current;
    if (pair?.assignment) {
      setSplit(null);
      return;
    }
    const name = activeRef.current;
    if (!isMarkdown(name) && !isPDF(name)) return;
    capturePosition();
    const right = pair
      ? pair.left === name
        ? pair.right
        : pair.left
      : tabsRef.current.find((tab) => tab.path !== name)?.path || "";
    setSplit({ left: name, right, assignment: true });
    if (right) {
      setActive(right);
      activeRef.current = right;
    }
  }
  async function toggleLivePreview() {
    if (livePreviewRef.current) {
      setLivePreview(false);
      return;
    }
    const name = activeRef.current;
    if (!supportsLivePreview(name)) return;
    if (
      await openFile(name, undefined, { mode: "source", preserveText: true })
    ) {
      setPreviewTarget(name);
      setLivePreview(true);
    }
  }
  async function openBeside(name?: string) {
    const left = activeRef.current;
    if (!left) return;
    const right =
      name && name !== left
        ? name
        : tabsRef.current.find((tab) => tab.path !== left)?.path;
    if (!right) {
      paletteBeside.current = true;
      setPalette("files");
      setQuery("");
      return;
    }
    if (!(await openFile(right))) return;
    setSplit({ left, right });
  }
  async function showHistory(name: string) {
    if (isReadOnlyPreview(name)) return;
    if (await openFile(name)) setHistoryPath(name);
  }
  function compareFiles(right?: string, left?: string) {
    const pair = splitRef.current;
    const current = activeRef.current;
    const textPath = (path: string) => (isReadOnlyPreview(path) ? "" : path);
    setComparison({
      left: left ?? textPath(pair && !right ? pair.left : current),
      right: right ?? textPath(pair?.right || ""),
    });
  }
  async function goHistory(direction: -1 | 1) {
    const previousIndex = navigation.current.index;
    const target = navigation.current.move(direction, currentLocation());
    if (!target) return;
    const operation = openFile(
      target.path,
      undefined,
      { position: target.position, mode: target.position?.mode },
      false,
    );
    const token = navigationToken.current;
    if (!(await operation) && token === navigationToken.current)
      navigation.current.index = previousIndex;
    redrawNavigation((value) => value + 1);
  }
  async function reopenClosed(path?: string) {
    if (reopeningClosed) return;
    const index = path
      ? closedTabs.current.map((tab) => tab.path).lastIndexOf(path)
      : closedTabs.current.length - 1;
    if (index < 0) return;
    const saved = closedTabs.current[index];
    setReopeningClosed(true);
    try {
      if (
        !(await openFile(saved.path, undefined, {
          position: saved.position,
          mode: saved.mode,
        }))
      )
        return;
      closedTabs.current.splice(index, 1);
      changeTabs((previous) => {
        const tab = previous.find((tab) => tab.path === saved.path)!;
        const remaining = previous.filter((entry) => entry !== tab);
        const pinnedCount = remaining.filter((tab) => tab.pinned).length;
        const reopened = { ...tab, pinned: saved.pinned };
        remaining.splice(
          saved.pinned
            ? Math.min(saved.index, pinnedCount)
            : Math.max(pinnedCount, Math.min(saved.index, remaining.length)),
          0,
          reopened,
        );
        return remaining;
      });
      redrawNavigation((value) => value + 1);
      await persist();
    } finally {
      setReopeningClosed(false);
    }
  }
  async function findInDocument(replace = false) {
    const tab = tabsRef.current.find((tab) => tab.path === activeRef.current);
    if (
      tab &&
      (previewType(tab.path) ||
        (isMarkdown(tab.path) && visualProtection(tab.text))) &&
      tab.mode === "visual" &&
      !(await openFile(tab.path, undefined, {
        mode: "source",
        preserveText: true,
      }))
    )
      return;
    if (activeRef.current && !isImage(activeRef.current))
      window.dispatchEvent(
        new CustomEvent("margin:find", {
          detail: { path: activeRef.current, replace },
        }),
      );
  }
  function showWorkspaceSearch() {
    setSidebarMode("search");
    void updateSettings({ sidebarVisible: true, focusMode: false });
    requestAnimationFrame(() =>
      window.dispatchEvent(new Event("margin:focus-workspace-search")),
    );
  }
  function openSearchResult(match: SearchMatch) {
    void openFile(match.path, undefined, {
      mode: "source",
      preserveText: true,
      range: { from: match.from, to: match.to, value: match.value },
    });
  }
  async function closeTab(name: string) {
    const savedPosition = capturePosition(name);
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
        return false;
    }
    const pair = splitRef.current;
    let other =
      pair?.left === name
        ? pair.right
        : pair?.right === name
          ? pair.left
          : undefined;
    if (pair?.assignment && pair.right === name) {
      const right =
        tabsRef.current.find(
          (entry) => entry.path !== name && entry.path !== pair.left,
        )?.path || "";
      setSplit({ ...pair, right });
      other = right || pair.left;
    } else if ((pair && pair.left === name) || (pair && pair.right === name))
      setSplit(null);
    const index = tabsRef.current.findIndex((t) => t.path === name);
    if (tab) {
      closedTabs.current = [
        ...closedTabs.current.filter((entry) => entry.path !== name),
        {
          path: name,
          mode: tab.mode,
          position: savedPosition,
          index,
          pinned: tab.pinned,
        },
      ].slice(-20);
      redrawNavigation((value) => value + 1);
    }
    const remaining = tabsRef.current.filter((t) => t.path !== name);
    tabsRef.current = remaining;
    changeTabs(() => remaining);
    if (activeRef.current === name) {
      const next = other || remaining[Math.max(0, index - 1)]?.path || "";
      if (next) await openFile(next);
      else {
        setActive("");
        activeRef.current = "";
      }
    }
    await persist();
    return true;
  }
  async function closeTabs(names: string[]) {
    for (const name of names) {
      if (
        tabsRef.current.some((tab) => tab.path === name && !tab.pinned) &&
        !(await closeTab(name))
      )
        break;
    }
  }
  function chooseSelection(
    path: string,
    kind: "single" | "toggle" | "range" = "single",
  ) {
    setSelected(path);
    setSelectionMode(kind !== "single");
    if (kind === "single") {
      selectionAnchor.current = path;
      selectionRef.current = [path];
      setSelection([path]);
      return;
    }
    if (kind === "toggle") {
      const next = selectionRef.current.includes(path)
        ? selectionRef.current.filter((name) => name !== path)
        : [...selectionRef.current, path];
      if (next.length > 100) {
        notify("Select at most 100 items at once.", true);
        return;
      }
      selectionAnchor.current = path;
      selectionRef.current = next;
      setSelection(next);
      return;
    }
    const first = displayedEntries.findIndex(
        (entry) => entry.path === (selectionAnchor.current || selected),
      ),
      last = displayedEntries.findIndex((entry) => entry.path === path);
    const next = displayedEntries
      .slice(Math.max(0, Math.min(first, last)), Math.max(first, last) + 1)
      .map((entry) => entry.path);
    if (next.length > 100) {
      notify("Select at most 100 items at once.", true);
      return;
    }
    selectionRef.current = next;
    setSelection(next);
  }
  function remapWorkspacePaths(moves: { from: string; to: string }[]) {
    const map = (path: string) => {
      const move = moves.find((move) => isInside(path, move.from));
      return move ? move.to + path.slice(move.from.length) : path;
    };
    positions.current = new Map(
      [...positions.current].map(([path, position]) => [map(path), position]),
    );
    recentFiles.current = recentFiles.current.map(map);
    setPreviewTarget((name) => map(name));
    closedTabs.current = closedTabs.current.map((tab) => ({
      ...tab,
      path: map(tab.path),
    }));
    navigation.current.mapPaths(map);
    changeTabs((previous) =>
      previous.map((tab) => ({
        ...tab,
        path: map(tab.path),
        version: tab.version + 1,
      })),
    );
    if (splitRef.current)
      setSplit({
        ...splitRef.current,
        left: map(splitRef.current.left),
        right: map(splitRef.current.right),
      });
    const next = map(activeRef.current);
    setActive(next);
    activeRef.current = next;
    setExpanded((previous) => previous.map(map));
  }
  async function moveSelected(
    paths = selectionRef.current,
    directory?: string,
  ) {
    closeMenu();
    const roots = selectionRoots(paths);
    const destination =
      directory ??
      (await ask({
        title:
          roots.length === 1
            ? `Move ${basename(roots[0])}`
            : `Move ${roots.length} selected items`,
        description:
          "Choose a destination folder. Markdown links and image references throughout the workspace are updated together.",
        input: "",
        label: "Destination folder (empty = workspace root)",
        movePaths: roots,
        choices: [
          { id: "submit", label: "Move & update links", primary: true },
          { id: "cancel", label: "Cancel" },
        ],
      }));
    if (destination === null || !(await settleEdits("Moving selected items")))
      return;
    await withOperation(async () => {
      const result = await window.margin.moveSelection(roots, destination);
      remapWorkspacePaths(result.moves);
      if (destination)
        setExpanded((previous) => [
          ...new Set([
            ...previous,
            ...destination
              .split("/")
              .map((_, index, parts) => parts.slice(0, index + 1).join("/")),
          ]),
        ]);
      setSelection(result.moves.map((move) => move.to));
      selectionRef.current = result.moves.map((move) => move.to);
      setSelected(result.moves[0]?.to || "");
      notify(
        `Moved ${result.moves.length} items. Updated references in ${result.referencesUpdated} documents.${result.historyWarning ? " Local history could not follow the move: " + result.historyWarning : ""}`,
        !!result.historyWarning,
      );
    });
  }
  async function trashSelected(paths = selectionRef.current) {
    closeMenu();
    const roots = selectionRoots(paths);
    if (!(await settleEdits("Deleting selected items"))) return;
    try {
      const incoming = await window.margin.incomingSelection(roots);
      const result = await ask({
        title: `Move ${roots.length} selected items to Trash?`,
        description: `${roots.join(", ")}. ${incoming.length ? `${incoming.length} outside documents reference these items: ${incoming.slice(0, 8).join(", ")}. Those links will point to missing files.` : "No incoming references from outside the selection were found."} You can restore items from the system Trash.`,
        choices: [
          { id: "trash", label: "Move selection to Trash", danger: true },
          { id: "cancel", label: "Cancel" },
        ],
      });
      if (result !== "trash") return;
      await withOperation(async () => {
        const result = await window.margin.trashSelection(roots),
          removed = (path: string) =>
            result.trashed.some((root) => isInside(path, root));
        if (
          splitRef.current &&
          (removed(splitRef.current.left) || removed(splitRef.current.right))
        )
          setSplit(
            splitRef.current.assignment && !removed(splitRef.current.left)
              ? { ...splitRef.current, right: "" }
              : null,
          );
        positions.current = new Map(
          [...positions.current].filter(([path]) => !removed(path)),
        );
        recentFiles.current = recentFiles.current.filter(
          (path) => !removed(path),
        );
        closedTabs.current = closedTabs.current.filter(
          (tab) => !removed(tab.path),
        );
        navigation.current.removePaths(removed);
        const remaining = tabsRef.current.filter((tab) => !removed(tab.path));
        changeTabs(() => remaining);
        if (removed(activeRef.current)) {
          const next = remaining[0]?.path || "";
          setActive(next);
          activeRef.current = next;
        }
        setSelection(result.failed.map((item) => item.path));
        selectionRef.current = result.failed.map((item) => item.path);
        setSelected(result.failed[0]?.path || "");
        notify(
          result.failed.length
            ? `Moved ${result.trashed.length} items to Trash; ${result.failed.map((item) => item.path + ": " + item.message).join("; ")}`
            : `Moved ${result.trashed.length} items to Trash.`,
          !!result.failed.length,
        );
      });
    } catch (error) {
      fail(error);
    }
  }
  function showPdfExport(path: string, directory = false) {
    if (pdfSource) return;
    if (!rootRef.current) return;
    if (!directory && !isMarkdown(path)) {
      notify(
        "Choose a Markdown file to export, or use Export Folder to PDF.",
        true,
      );
      return;
    }
    setPdfSource({ path, directory, label: path || rootRef.current });
  }
  function explorerMenu(
    path: string,
    x: number,
    y: number,
    target: HTMLElement,
  ) {
    const entry = entries.find((entry) => entry.path === path);
    const parent = entry?.directory ? path : dirname(path);
    const selectedPaths = selectionRef.current.includes(path)
      ? selectionRef.current
      : [path];
    openMenu({
      x,
      y,
      restoreFocus: () => target.isConnected && target.focus(),
      items: [
        ...(!path || entry?.directory || isMarkdown(path)
          ? [
              {
                label: "Export to PDF…",
                run: () => showPdfExport(path, !path || !!entry?.directory),
              },
            ]
          : []),
        ...(entry && !entry.directory && isBrowserFile(path)
          ? [
              {
                label: "Open in browser",
                run: () => window.margin.openInBrowser(path),
              },
            ]
          : []),
        ...(path &&
        !entries.find((entry) => entry.path === path)?.directory &&
        activeRef.current &&
        path !== activeRef.current
          ? [{ label: "Open beside current", run: () => openBeside(path) }]
          : []),
        ...(path &&
        !entry?.directory &&
        !isReadOnlyPreview(path) &&
        activeRef.current &&
        path !== activeRef.current &&
        !isReadOnlyPreview(activeRef.current)
          ? [
              {
                label: "Compare with current file",
                run: () => compareFiles(path),
              },
            ]
          : []),
        ...(selectedPaths.length === 2 &&
        selectedPaths.every(
          (name) =>
            entries.some((entry) => entry.path === name && !entry.directory) &&
            !isReadOnlyPreview(name),
        )
          ? [
              {
                label: "Compare selected files",
                run: () => compareFiles(selectedPaths[1], selectedPaths[0]),
              },
            ]
          : []),
        ...(selectedPaths.length > 1
          ? [
              {
                label: `Move ${selectedPaths.length} selected items…`,
                run: () => moveSelected(selectedPaths),
              },
              {
                label: `Move ${selectedPaths.length} selected items to Trash…`,
                danger: true,
                run: () => trashSelected(selectedPaths),
              },
              null,
            ]
          : []),
        ...(path && selectedPaths.length === 1
          ? [
              { label: "Move to folder…", run: () => moveSelected([path]) },
              {
                label: "Rename / move",
                shortcut: "F2",
                run: () => moveEntry(path),
              },
              { label: "Duplicate", run: () => duplicateEntry(path) },
            ]
          : []),
        {
          label: "New document here",
          run: () => {
            return createEntry(false, parent);
          },
        },
        { label: "New folder here", run: () => createEntry(true, parent) },
        null,
        { label: "Open terminal here", run: () => addTerminal(parent) },
        { label: "Copy file path", run: () => window.margin.copyPath(path) },
        { label: revealLabel, run: () => window.margin.reveal(path) },
        ...(path
          ? [
              null,
              {
                label: "Move to Trash",
                shortcut: "Del",
                danger: true,
                run: () => deleteEntry(path),
              },
            ]
          : []),
      ],
    });
  }
  function tabMenu(path: string, x: number, y: number, target: HTMLElement) {
    const opened = tabsRef.current;
    const tab = opened.find((entry) => entry.path === path);
    const index = opened.findIndex((entry) => entry.path === path);
    openMenu({
      x,
      y,
      restoreFocus: () => target.isConnected && target.focus(),
      items: [
        { label: "Open beside current", run: () => openBeside(path) },
        {
          label: "Compare with current file",
          disabled:
            path === activeRef.current ||
            isReadOnlyPreview(path) ||
            isReadOnlyPreview(activeRef.current),
          run: () => compareFiles(path),
        },
        {
          label: "Local version history",
          disabled: isReadOnlyPreview(path),
          run: () => showHistory(path),
        },
        {
          label: "Save",
          shortcut: `${keyboard}+S`,
          disabled: !tab?.dirty || isReadOnlyPreview(path),
          run: () => saveTab(path),
        },
        {
          label: "Save as…",
          disabled: isReadOnlyPreview(path),
          run: () => saveAs(path, false),
        },
        {
          label: "Save a copy…",
          disabled: isReadOnlyPreview(path),
          run: () => saveAs(path, true),
        },
        ...(isMarkdown(path)
          ? [{ label: "Export to PDF…", run: () => showPdfExport(path) }]
          : []),
        {
          label: tab?.pinned ? "Unpin tab" : "Pin tab",
          run: () => pinTab(path),
        },
        {
          label: "Move tab left",
          disabled: index <= 0 || !!opened[index - 1]?.pinned !== !!tab?.pinned,
          run: () => reorderTab(path, opened[index - 1]?.path),
        },
        {
          label: "Move tab right",
          disabled:
            index >= opened.length - 1 ||
            !!opened[index + 1]?.pinned !== !!tab?.pinned,
          run: () => reorderTab(path, opened[index + 1]?.path),
        },
        {
          label: "Reopen closed tab",
          shortcut: `${keyboard}+Shift+T`,
          disabled: !closedTabs.current.length,
          run: () => reopenClosed(),
        },
        ...(closedTabs.current.length
          ? [
              {
                label: "Recently closed",
                children: [...closedTabs.current].reverse().map((entry) => ({
                  label: entry.path,
                  run: () => reopenClosed(entry.path),
                })),
              },
            ]
          : []),
        null,
        {
          label: "Close",
          shortcut: `${keyboard}+W`,
          run: () => closeTab(path),
        },
        {
          label: "Close other tabs",
          disabled: !opened.some(
            (entry) => entry.path !== path && !entry.pinned,
          ),
          run: () =>
            closeTabs(
              opened
                .filter((entry) => entry.path !== path)
                .map((entry) => entry.path),
            ),
        },
        {
          label: "Close tabs to the right",
          disabled: !opened.slice(index + 1).some((entry) => !entry.pinned),
          run: () =>
            closeTabs(opened.slice(index + 1).map((entry) => entry.path)),
        },
        {
          label: "Close all tabs",
          disabled: !opened.some((entry) => !entry.pinned),
          run: () => closeTabs(opened.map((entry) => entry.path)),
        },
        null,
        {
          label: "Reveal in explorer",
          run: async () => {
            setSidebarMode("files");
            chooseSelection(path);
            setTreeFilter("");
            const parts = path.split("/").slice(0, -1);
            setExpanded((previous) => [
              ...new Set([
                ...previous,
                ...parts.map((_, i) => parts.slice(0, i + 1).join("/")),
              ]),
            ]);
            await updateSettings({ sidebarVisible: true, focusMode: false });
            requestAnimationFrame(() => {
              const row = Array.from(
                document.querySelectorAll<HTMLElement>('[role="treeitem"]'),
              ).find((element) => element.getAttribute("aria-label") === path);
              row?.scrollIntoView({ block: "nearest" });
              row?.focus();
            });
          },
        },
        {
          label: "Copy file path",
          run: () => window.margin.copyPath(path),
        },
      ],
    });
  }
  async function chooseWorkspace(recentRoot?: string) {
    if (!(await settleEdits("Opening another workspace"))) return;
    await persist();
    transitioning.current = true;
    try {
      const opened = recentRoot
        ? await window.margin.openWorkspace(recentRoot)
        : await window.margin.chooseWorkspace();
      if (opened) await restore(opened);
    } catch (e) {
      fail(e);
    } finally {
      transitioning.current = false;
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
  async function createEntry(directory: boolean, destination?: string) {
    if (!root) {
      await chooseWorkspace();
      return;
    }
    const parent = destination ?? creationParent();
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
        chooseSelection(target);
      } else await openFile(target);
    } catch (e) {
      fail(e);
    }
  }
  async function moveEntry(from: string, to?: string) {
    closeMenu();
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
      positions.current = new Map(
        [...positions.current].map(([path, position]) => [
          mapped(path, from, target),
          position,
        ]),
      );
      setPreviewTarget((name) => mapped(name, from, target));
      recentFiles.current = recentFiles.current.map((path) =>
        mapped(path, from, target),
      );
      closedTabs.current = closedTabs.current.map((tab) => ({
        ...tab,
        path: mapped(tab.path, from, target),
      }));
      navigation.current.mapPaths((path) => mapped(path, from, target));
      changeTabs((previous) =>
        previous.map((tab) => ({
          ...tab,
          path: mapped(tab.path, from, target),
          version: tab.version + 1,
        })),
      );
      if (splitRef.current)
        setSplit({
          ...splitRef.current,
          left: mapped(splitRef.current.left, from, target),
          right: mapped(splitRef.current.right, from, target),
        });
      const next = mapped(activeRef.current, from, target);
      setActive(next);
      activeRef.current = next;
      setExpanded((previous) => previous.map((p) => mapped(p, from, target)));
      chooseSelection(target);
      notify(
        `Moved to ${target}. Updated references in ${result.referencesUpdated} document${result.referencesUpdated === 1 ? "" : "s"}.${result.historyWarning ? " Local history could not follow the move: " + result.historyWarning : ""}`,
        !!result.historyWarning,
      );
    });
  }
  async function duplicateEntry(from: string) {
    closeMenu();
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
    closeMenu();
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
        if (
          splitRef.current &&
          (isInside(splitRef.current.left, name) ||
            isInside(splitRef.current.right, name))
        )
          setSplit(
            splitRef.current.assignment &&
              !isInside(splitRef.current.left, name)
              ? { ...splitRef.current, right: "" }
              : null,
          );
        setSelection([]);
        recentFiles.current = recentFiles.current.filter(
          (path) => !isInside(path, name),
        );
        closedTabs.current = closedTabs.current.filter(
          (tab) => !isInside(tab.path, name),
        );
        navigation.current.removePaths((path) => isInside(path, name));
        for (const path of positions.current.keys())
          if (isInside(path, name)) positions.current.delete(path);
        redrawNavigation((value) => value + 1);
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
        <ConflictDiff
          mine={tab.text}
          disk={disk === "deleted" ? null : disk.text}
        />
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
                mode: documentMode(t.path, disk.text, t.mode),
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
    if (
      livePreviewRef.current &&
      supportsLivePreview(tab.path) &&
      tab.mode === "source"
    )
      setLivePreview(false);
    const savedPosition = capturePosition(tab.path);
    changeTabs((previous) =>
      previous.map((t) =>
        t.path === tab.path
          ? {
              ...t,
              mode: t.mode === "visual" ? "source" : "visual",
              position: savedPosition,
            }
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
  async function addTerminal(directory = "") {
    if (!root) return;
    try {
      const info = await window.margin.terminalCreate(chosenShell, directory);
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
    openFile,
    reopenClosed,
    goHistory,
    findInDocument,
    showWorkspaceSearch,
    saveAs,
    showPdfExport,
  });
  actionsRef.current = {
    requestClose,
    chooseWorkspace,
    saveTab,
    saveAll,
    createEntry,
    addTerminal,
    closeTab,
    openFile,
    reopenClosed,
    goHistory,
    findInDocument,
    showWorkspaceSearch,
    saveAs,
    showPdfExport,
  };
  useEffect(
    () => window.margin.onClose(() => void actionsRef.current.requestClose()),
    [],
  );
  useEffect(
    () =>
      window.margin.onCommand((command) => {
        if (command === "export-pdf")
          actionsRef.current.showPdfExport(activeRef.current);
        if (command === "export-folder-pdf")
          actionsRef.current.showPdfExport("", true);
        if (command === "save-as")
          void actionsRef.current.saveAs(activeRef.current, false);
        if (command === "save-copy")
          void actionsRef.current.saveAs(activeRef.current, true);
        if (command === "save")
          void actionsRef.current.saveTab(activeRef.current);
        if (command === "open") void actionsRef.current.chooseWorkspace();
        if (command === "reopen-tab") void actionsRef.current.reopenClosed();
        if (command === "find") actionsRef.current.findInDocument();
        if (command === "search-workspace")
          actionsRef.current.showWorkspaceSearch();
      }),
    [],
  );
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "F8" && !document.querySelector(".modal-scrim")) {
        event.preventDefault();
        void updateSettings({
          presentationMode: !settingsRef.current.presentationMode,
        });
        return;
      }
      if (event.key === "Escape") {
        if (
          settingsRef.current.presentationMode &&
          !dialog &&
          !showSettings &&
          !palette &&
          !document.querySelector(
            '.modal-scrim, [role="menu"], .cm-panel, .cm-tooltip',
          )
        ) {
          void updateSettings({ presentationMode: false });
          return;
        }
        if (dialog) answer(null);
        else {
          closeMenu();
          setPalette(null);
          paletteBeside.current = false;
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
      if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        void actionsRef.current.goHistory(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        if (event.shiftKey) actionsRef.current.showWorkspaceSearch();
        else actionsRef.current.findInDocument(event.altKey);
      } else if (key === "h" && !event.metaKey) {
        event.preventDefault();
        actionsRef.current.findInDocument(true);
      } else if (key === "t" && event.shiftKey) {
        event.preventDefault();
        void actionsRef.current.reopenClosed();
      } else if (key === "s") {
        event.preventDefault();
        if (event.shiftKey) void actionsRef.current.saveAll();
        else void actionsRef.current.saveTab(activeRef.current);
      } else if (key === "p") {
        event.preventDefault();
        paletteBeside.current = false;
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
        void actionsRef.current.openFile(next);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [dialog, dialogInput, showSettings, palette]);
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
  const previewTab = tabs.find(
    (tab) => tab.path === previewTarget && supportsLivePreview(tab.path),
  );
  const previewVisible = livePreview && !!previewTab;
  const presentation = settings.presentationMode;
  const editorSettings = presentation
    ? {
        ...settings,
        fontSize: settings.presentationFontSize,
        theme: displayTheme,
      }
    : settings;
  const keyboard = platform === "darwin" ? "⌘" : "Ctrl";
  const commands = [
    {
      name: presentation
        ? "Leave presentation mode"
        : "Enter presentation mode",
      shortcut: "F8",
      run: () => updateSettings({ presentationMode: !presentation }),
    },
    ...(split?.assignment ||
    (current && (isMarkdown(current.path) || isPDF(current.path)))
      ? [
          {
            name: split?.assignment ? "Unpin assignment" : "Pin assignment",
            run: () => toggleAssignment(),
          },
        ]
      : []),
    ...(livePreview || (current && supportsLivePreview(current.path))
      ? [
          {
            name: livePreview
              ? "Close live preview"
              : "Show live preview beside code",
            run: () => toggleLivePreview(),
          },
        ]
      : []),
    ...(current && isMarkdown(current.path)
      ? [{ name: "Export to PDF…", run: () => showPdfExport(current.path) }]
      : []),
    ...(root
      ? [{ name: "Export folder to PDF…", run: () => showPdfExport("", true) }]
      : []),
    {
      name: "Search workspace contents",
      shortcut: `${keyboard}+Shift+F`,
      run: showWorkspaceSearch,
    },
    ...(current && !isReadOnlyPreview(current.path)
      ? [
          { name: "Save as…", run: () => saveAs(current.path, false) },
          { name: "Save a copy…", run: () => saveAs(current.path, true) },
          {
            name: "Find in document",
            shortcut: `${keyboard}+F`,
            run: () => findInDocument(),
          },
          { name: "Replace in document", run: () => findInDocument(true) },
        ]
      : []),
    ...(current && isPDF(current.path)
      ? [
          {
            name: "Find in PDF",
            shortcut: `${keyboard}+F`,
            run: () => findInDocument(),
          },
        ]
      : []),
    ...(closedTabs.current.length
      ? [
          {
            name: "Reopen closed tab",
            shortcut: `${keyboard}+Shift+T`,
            run: () => reopenClosed(),
          },
        ]
      : []),
    ...(navigation.current.index > 0
      ? [
          {
            name: "Navigate back",
            shortcut: "Alt+Left",
            run: () => goHistory(-1),
          },
        ]
      : []),
    ...(navigation.current.index >= 0 &&
    navigation.current.index < navigation.current.entries.length - 1
      ? [
          {
            name: "Navigate forward",
            shortcut: "Alt+Right",
            run: () => goHistory(1),
          },
        ]
      : []),
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
    ...(current
      ? [
          {
            name: split ? "Close split view" : "Split editor",
            run: () => (split ? setSplit(null) : openBeside()),
          },
          {
            name: "Compare files",
            run: () => compareFiles(),
          },
          ...(!isReadOnlyPreview(current.path)
            ? [
                {
                  name: "Local version history",
                  run: () => showHistory(current.path),
                },
              ]
            : []),
        ]
      : []),
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
    { name: "New terminal", run: () => addTerminal() },
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
    ...(current && supportsVisualMode(current.path)
      ? [
          {
            name: `Toggle ${previewType(current.path) ?? "Markdown"} source / visual`,
            run: () => toggleMode(current),
          },
        ]
      : []),
  ];
  const rankedFiles = useMemo(
    () =>
      palette === "files"
        ? quickFiles(entries, parseFileQuery(query).query, recentFiles.current)
        : [],
    [palette, query, entries, recentFiles.current],
  );
  const paletteItems = !palette
    ? []
    : palette === "commands"
      ? commands
          .filter((command) =>
            query
              .toLowerCase()
              .trim()
              .split(/\s+/)
              .every((term) => command.name.toLowerCase().includes(term)),
          )
          .map((c) => ({ label: c.name, detail: c.shortcut, run: c.run }))
      : rankedFiles.map((entry) => ({
          label: entry.name,
          detail:
            entry.path +
            (parseFileQuery(query).line
              ? ` · Line ${parseFileQuery(query).line}:${parseFileQuery(query).column}`
              : recentFiles.current.includes(entry.path)
                ? " · Recent"
                : ""),
          run: () => {
            const { line, column } = parseFileQuery(query);
            if (paletteBeside.current) {
              paletteBeside.current = false;
              return openBeside(entry.path);
            }
            return openFile(
              entry.path,
              undefined,
              line
                ? { mode: "source", line, column, preserveText: true }
                : undefined,
            );
          },
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
  function focusExplorer(path: string, extend = false) {
    if (!path) return;
    if (selectionMode && !extend) setSelected(path);
    else chooseSelection(path, extend ? "range" : "single");
    requestAnimationFrame(() => {
      const row = Array.from(
        document.querySelectorAll<HTMLElement>('[role="treeitem"]'),
      ).find((row) => row.getAttribute("aria-label") === path);
      row?.focus();
      row?.scrollIntoView({ block: "nearest" });
    });
  }
  function explorerKey(event: React.KeyboardEvent, entry?: Entry) {
    if ((event.target as HTMLElement).closest("button")) return;
    // Continuing in the tree takes precedence over a file's delayed editor focus.
    editorInteraction.current++;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      event.stopPropagation();
      const paths = displayedEntries.slice(0, 100).map((entry) => entry.path);
      setSelectionMode(true);
      selectionRef.current = paths;
      setSelection(paths);
      if (displayedEntries.length > 100)
        notify("Selected the first 100 visible items.");
      return;
    }
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key === "Escape" && selectionMode) {
      event.preventDefault();
      event.stopPropagation();
      chooseSelection(selected);
      return;
    }
    const index = entry
      ? displayedEntries.findIndex((item) => item.path === entry.path)
      : -1;
    const focus = (index: number) =>
      focusExplorer(
        displayedEntries[
          Math.max(0, Math.min(displayedEntries.length - 1, index))
        ]?.path,
        event.shiftKey,
      );
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      focus(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? displayedEntries.length - 1
            : index + (event.key === "ArrowUp" ? -1 : 1),
      );
      return;
    }
    if (entry && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "ArrowRight") {
        if (entry.directory && !expanded.includes(entry.path))
          setExpanded((previous) => [...previous, entry.path]);
        else if (
          entry.directory &&
          displayedEntries[index + 1]?.path.startsWith(entry.path + "/")
        )
          focus(index + 1);
      } else if (entry.directory && expanded.includes(entry.path))
        setExpanded((previous) =>
          previous.filter((path) => path !== entry.path),
        );
      else focusExplorer(dirname(entry.path));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (!entry) {
        focus(0);
        return;
      }
      if (event.key === " " && selectionMode) {
        chooseSelection(entry.path, "toggle");
        return;
      }
      if (entry.directory)
        setExpanded((previous) =>
          previous.includes(entry.path)
            ? previous.filter((path) => path !== entry.path)
            : [...previous, entry.path],
        );
      else void openFile(entry.path);
      return;
    }
    if (entry && event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      void moveEntry(entry.path);
      return;
    }
    if (entry && event.key === "Delete") {
      event.preventDefault();
      event.stopPropagation();
      if (
        selectionRef.current.length > 1 &&
        selectionRef.current.includes(entry.path)
      )
        void trashSelected();
      else void deleteEntry(entry.path);
      return;
    }
    if (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now(),
        previous = explorerTyping.current;
      const value =
        now - previous.time < 800
          ? previous.value + event.key.toLowerCase()
          : event.key.toLowerCase();
      explorerTyping.current = { value, time: now };
      const prefix = [...value].every((char) => char === value[0])
        ? value[0]
        : value;
      const ordered = [
        ...displayedEntries.slice(index + 1),
        ...displayedEntries.slice(0, index + 1),
      ];
      const found = ordered.find((item) =>
        item.name.toLowerCase().startsWith(prefix),
      );
      if (found) focusExplorer(found.path);
    }
  }
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
      className={
        "application" +
        (settings.focusMode || presentation ? " focus-mode" : "") +
        (presentation ? " presentation-mode" : "")
      }
      ref={appRef}
      onFocusCapture={(event) => {
        // Toolbar, dialog and explorer focus takes precedence over a pending
        // document activation, including navigation initiated by the keyboard.
        if (!(event.target as HTMLElement).closest(".editor-pane"))
          editorInteraction.current++;
      }}
      style={
        {
          "--reading-font-size":
            (presentation
              ? settings.presentationFontSize
              : settings.readingFontSize) + "px",
          "--reading-line-height": settings.readingLineHeight,
          "--reading-width":
            (presentation ? 1200 : settings.readingWidth) + "px",
        } as React.CSSProperties
      }
    >
      <Tooltip />
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
            data-tooltip={root || "Open a folder"}
            onClick={() => void chooseWorkspace()}
          >
            {root ? basename(root) : "Choose a folder"}
          </button>
        </div>
        <button
          className="global-search"
          aria-label="Search files, contents or commands"
          data-tooltip="Search files, contents or commands"
          onClick={() => {
            setPalette("files");
            setQuery("");
            setPaletteIndex(0);
          }}
        >
          <Search size={15} />
          <span>Search…</span>
          <kbd>{keyboard} P</kbd>
        </button>
        <div className="header-actions">
          <button
            className="presentation-button"
            aria-label={
              presentation
                ? "Leave presentation mode"
                : "Enter presentation mode"
            }
            aria-pressed={presentation}
            data-tooltip="Presentation mode (F8)"
            onClick={() =>
              void updateSettings({ presentationMode: !presentation })
            }
          >
            <Presentation size={17} />
            <span>{presentation ? "Leave presentation" : "Present"}</span>
          </button>
          <button
            className="icon-button"
            aria-label="Preferences"
            data-tooltip={`${keyboard}+,`}
            onClick={() => setShowSettings(true)}
          >
            <Settings2 />
          </button>
        </div>
      </header>
      <div className="workspace-body">
        {!settings.focusMode && !presentation && (
          <nav className="activity-bar" aria-label="Workspace tools">
            <button
              className={
                "activity-button " +
                (settings.sidebarVisible && sidebarMode === "files"
                  ? "active"
                  : "")
              }
              data-tooltip="Explorer"
              aria-label="Toggle explorer"
              onClick={() => {
                setSidebarMode("files");
                void updateSettings({
                  sidebarVisible:
                    sidebarMode === "search" || !settings.sidebarVisible,
                });
              }}
            >
              <FolderOpen />
            </button>
            <button
              className="activity-button"
              data-tooltip="Quick open"
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
                "activity-button " +
                (sidebarMode === "search" && settings.sidebarVisible
                  ? "active"
                  : "")
              }
              aria-label="Search workspace"
              data-tooltip={`Search workspace (${keyboard}+Shift+F)`}
              onClick={showWorkspaceSearch}
            >
              <SearchCode />
            </button>
            <button
              className={
                "activity-button " + (settings.terminalVisible ? "active" : "")
              }
              data-tooltip="Terminal"
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
                data-tooltip="Command palette"
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
                data-tooltip="Your files stay on this computer"
              />
            </div>
          </nav>
        )}
        {settings.sidebarVisible && !settings.focusMode && !presentation && (
          <>
            <aside className="sidebar" style={{ width: settings.sidebarWidth }}>
              {sidebarMode === "search" ? (
                <WorkspaceSearch
                  root={root}
                  options={searchOptions}
                  onChange={setSearchOptions}
                  tabs={tabs}
                  onOpen={openSearchResult}
                  onClose={() => setSidebarMode("files")}
                />
              ) : (
                <>
                  <div className="sidebar-heading">
                    <span>EXPLORER</span>
                    <button
                      className="icon-button small"
                      aria-label="Open workspace folder"
                      data-tooltip="Open folder"
                      onClick={() => void chooseWorkspace()}
                    >
                      <FolderOpen />
                    </button>
                    <button
                      className="icon-button small"
                      aria-label="Collapse explorer"
                      onClick={() =>
                        void updateSettings({ sidebarVisible: false })
                      }
                    >
                      <PanelLeftClose />
                    </button>
                  </div>
                  <div
                    className={
                      "folder-heading " +
                      (explorerDrag.destination?.directory === ""
                        ? explorerDrag.destination.problem
                          ? "drop-invalid"
                          : "drop-target"
                        : "")
                    }
                    data-explorer-drop="root"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      explorerMenu(
                        "",
                        event.clientX,
                        event.clientY,
                        event.currentTarget,
                      );
                    }}
                    onDragOver={explorerDrag.over}
                    onDrop={explorerDrag.drop}
                    onDragLeave={explorerDrag.leave}
                  >
                    <ChevronDown size={15} />
                    <strong data-tooltip={root}>
                      {root ? basename(root) : "No folder open"}
                    </strong>
                    <span className="grow" />
                    <button
                      className="icon-button small"
                      aria-label="New document"
                      data-tooltip="New document"
                      onClick={() => void createEntry(false)}
                    >
                      <FilePlus2 />
                    </button>
                    <button
                      className="icon-button small"
                      aria-label="Select files"
                      aria-pressed={selectionMode}
                      disabled={!root}
                      data-tooltip="Select files for batch actions"
                      onClick={() => {
                        setSelectionMode(!selectionMode);
                        setSelection([]);
                        selectionRef.current = [];
                      }}
                    >
                      <ListChecks />
                    </button>
                    <button
                      className="icon-button small"
                      aria-label="New folder"
                      data-tooltip="New folder"
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
                  {selectionMode && (
                    <div
                      className="selection-actions"
                      role="group"
                      aria-label="Batch file actions"
                    >
                      <span role="status">{selection.length} selected</span>
                      <button
                        aria-label="Move selected items"
                        disabled={!selection.length}
                        onClick={() => void moveSelected()}
                      >
                        Move…
                      </button>
                      <button
                        aria-label="Trash selected items"
                        disabled={!selection.length}
                        onClick={() => void trashSelected()}
                      >
                        Trash…
                      </button>
                      <button
                        aria-label="Done selecting files"
                        onClick={() => {
                          setSelection([]);
                          selectionRef.current = [];
                          setSelectionMode(false);
                        }}
                      >
                        Done
                      </button>
                    </div>
                  )}
                  {explorerDrag.paths.length > 0 &&
                    explorerDrag.destination && (
                      <div
                        className={
                          "explorer-drop-status " +
                          (explorerDrag.destination?.problem ? "invalid" : "")
                        }
                        role="status"
                        aria-live="polite"
                      >
                        <strong>
                          {explorerDrag.destination
                            ? explorerDrag.destination.problem ||
                              (explorerDrag.paths.length === 1
                                ? `Move to ${movePath(explorerDrag.paths[0], explorerDrag.destination.directory)}`
                                : `Move ${explorerDrag.paths.length} items into ${explorerDrag.destination.directory || "workspace root"}`)
                            : "Drag to a folder or the workspace heading"}
                        </strong>
                        <span>
                          Hold near an edge to scroll · Hover over a folder to
                          open
                        </span>
                      </div>
                    )}
                  <div
                    ref={explorerDrag.tree}
                    className={
                      "file-tree" +
                      (explorerDrag.paths.length ? " is-dragging" : "")
                    }
                    data-explorer-drop="tree"
                    data-scroll-direction={explorerDrag.scrolling || undefined}
                    role="tree"
                    aria-label="Workspace files"
                    aria-multiselectable="true"
                    tabIndex={displayedEntries.length ? -1 : 0}
                    onKeyDown={(event) => explorerKey(event)}
                    onContextMenu={(event) => {
                      if (
                        event.defaultPrevented ||
                        (event.target as HTMLElement).closest(
                          '[role="treeitem"]',
                        )
                      )
                        return;
                      event.preventDefault();
                      setSelected("");
                      explorerMenu(
                        "",
                        event.clientX,
                        event.clientY,
                        event.currentTarget,
                      );
                    }}
                    onDragOver={explorerDrag.over}
                    onDrop={explorerDrag.drop}
                    onDragLeave={explorerDrag.leave}
                  >
                    {displayedEntries.map((entry) => (
                      <div
                        key={entry.path}
                        data-explorer-path={entry.path}
                        role="treeitem"
                        aria-label={entry.path}
                        aria-selected={selection.includes(entry.path)}
                        aria-expanded={
                          entry.directory
                            ? expanded.includes(entry.path)
                            : undefined
                        }
                        tabIndex={
                          entry.path ===
                          (displayedEntries.some(
                            (item) => item.path === selected,
                          )
                            ? selected
                            : displayedEntries[0]?.path)
                            ? 0
                            : -1
                        }
                        aria-level={entry.path.split("/").length}
                        onFocus={() => setSelected(entry.path)}
                        className={
                          "tree-row " +
                          (active === entry.path ? "current " : "") +
                          (selection.includes(entry.path) ? "selected " : "") +
                          (explorerDrag.paths.includes(entry.path)
                            ? "drag-source "
                            : "") +
                          (explorerDrag.destination?.directory === entry.path
                            ? explorerDrag.destination.problem
                              ? "drop-invalid "
                              : "drop-target "
                            : "") +
                          (explorerDrag.destination &&
                          !explorerDrag.destination.problem &&
                          explorerDrag.destination.directory &&
                          isInside(
                            entry.path,
                            explorerDrag.destination.directory,
                          )
                            ? "drop-descendant"
                            : "")
                        }
                        style={{
                          paddingLeft:
                            12 + (entry.path.split("/").length - 1) * 16,
                        }}
                        draggable
                        onDragStart={(e) => {
                          editorInteraction.current++;
                          const paths = selectionRef.current.includes(
                            entry.path,
                          )
                            ? selectionRef.current
                            : [entry.path];
                          explorerDrag.begin(e, paths);
                        }}
                        onDragEnd={explorerDrag.end}
                        onClick={(event) => {
                          chooseSelection(
                            entry.path,
                            event.shiftKey
                              ? "range"
                              : event.metaKey || event.ctrlKey || selectionMode
                                ? "toggle"
                                : "single",
                          );
                          if (
                            event.shiftKey ||
                            event.metaKey ||
                            event.ctrlKey ||
                            selectionMode
                          )
                            return;
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
                          if (!selectionRef.current.includes(entry.path))
                            chooseSelection(entry.path);
                          explorerMenu(
                            entry.path,
                            e.clientX,
                            e.clientY,
                            e.currentTarget,
                          );
                        }}
                        onKeyDown={(event) => explorerKey(event, entry)}
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
                        <FileIcon
                          path={entry.path}
                          directory={entry.directory}
                        />
                        <span className="tree-label">{entry.name}</span>
                        {tabs.some((t) => t.path === entry.path && t.dirty) && (
                          <span className="dirty-dot" />
                        )}
                        <button
                          className="row-menu icon-button small"
                          aria-label={`Actions for ${entry.name}`}
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!selectionRef.current.includes(entry.path))
                              chooseSelection(entry.path);
                            explorerMenu(
                              entry.path,
                              e.clientX,
                              e.clientY,
                              e.currentTarget,
                            );
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
                </>
              )}
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
        <main
          className="main-workspace"
          onPointerDownCapture={(event) => {
            if (
              (event.target as HTMLElement).closest(
                ".editor-pane.active .document-content,.editor-pane.active .cm-editor",
              )
            )
              editorInteraction.current++;
          }}
          onKeyDownCapture={(event) => {
            if (
              (event.target as HTMLElement).closest(
                ".editor-pane.active .document-content,.editor-pane.active .cm-editor",
              )
            )
              editorInteraction.current++;
          }}
        >
          <div className="tabs-bar">
            <div
              className="navigation-buttons"
              role="group"
              aria-label="Navigation"
            >
              <button
                className="icon-button small"
                aria-label="Navigate back"
                data-tooltip="Back (Alt+Left)"
                disabled={navigation.current.index <= 0}
                onClick={() => void goHistory(-1)}
              >
                <ArrowLeft />
              </button>
              <button
                className="icon-button small"
                aria-label="Navigate forward"
                data-tooltip="Forward (Alt+Right)"
                disabled={
                  navigation.current.index < 0 ||
                  navigation.current.index >=
                    navigation.current.entries.length - 1
                }
                onClick={() => void goHistory(1)}
              >
                <ArrowRight />
              </button>
            </div>
            <div
              className="tabs-scroll"
              role="tablist"
              aria-label="Open files"
              tabIndex={0}
              onContextMenu={(event) => {
                if (
                  event.defaultPrevented ||
                  (event.target as HTMLElement).closest('[role="tab"]')
                )
                  return;
                event.preventDefault();
                const element = event.currentTarget;
                openMenu({
                  x: event.clientX,
                  y: event.clientY,
                  restoreFocus: () => element.focus(),
                  items: [
                    {
                      label: "Reopen closed tab",
                      shortcut: `${keyboard}+Shift+T`,
                      disabled: !closedTabs.current.length,
                      run: () => reopenClosed(),
                    },
                    ...(closedTabs.current.length
                      ? [
                          {
                            label: "Recently closed",
                            children: [...closedTabs.current]
                              .reverse()
                              .map((entry) => ({
                                label: entry.path,
                                run: () => reopenClosed(entry.path),
                              })),
                          },
                        ]
                      : []),
                  ],
                });
              }}
            >
              {(!settings.sidebarVisible ||
                settings.focusMode ||
                presentation) && (
                <button
                  className="icon-button"
                  aria-label="Show explorer"
                  onClick={() =>
                    void updateSettings({
                      sidebarVisible: true,
                      focusMode: false,
                      presentationMode: false,
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
                  data-tooltip={tab.path}
                  className={
                    "editor-tab " +
                    (active === tab.path ? "active " : "") +
                    (tab.pinned ? "pinned" : "")
                  }
                  tabIndex={0}
                  draggable
                  aria-description={
                    tab.pinned
                      ? "Pinned tab, kept open during bulk close"
                      : undefined
                  }
                  onDragStart={(event) => {
                    draggedTab.current = tab.path;
                    event.dataTransfer.setData(
                      "application/x-margin-tab",
                      tab.path,
                    );
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    draggedTab.current = null;
                  }}
                  onDragOver={(event) => {
                    if (
                      draggedTab.current &&
                      !!tabsRef.current.find(
                        (entry) => entry.path === draggedTab.current,
                      )?.pinned === !!tab.pinned
                    ) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = event.dataTransfer.getData(
                      "application/x-margin-tab",
                    );
                    reorderTab(from, tab.path);
                    draggedTab.current = null;
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    tabMenu(
                      tab.path,
                      event.clientX,
                      event.clientY,
                      event.currentTarget,
                    );
                  }}
                  onClick={() => {
                    void openFile(tab.path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      void openFile(tab.path);
                    }
                  }}
                >
                  <FileIcon path={tab.path} />
                  {tab.pinned && (
                    <Pin size={12} className="tab-pin" aria-label="Pinned" />
                  )}
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
            </div>
            {current && supportsVisualMode(current.path) && (
              <div
                className="document-actions"
                role="group"
                aria-label="Writing"
              >
                <div
                  className="mode-switch"
                  role="group"
                  aria-label="Editing mode"
                >
                  <button
                    aria-label="Visual mode"
                    aria-pressed={current.mode === "visual"}
                    className={current.mode === "visual" ? "active" : ""}
                    onClick={() => {
                      if (current.mode !== "visual") {
                        setLivePreview(false);
                        void toggleMode(current);
                      }
                    }}
                  >
                    {previewType(current.path) ||
                    (isMarkdown(current.path) &&
                      visualProtection(current.text)) ? (
                      <Eye size={13} />
                    ) : (
                      <PenLine size={13} />
                    )}{" "}
                    Visual
                  </button>
                  <button
                    aria-label={`${previewType(current.path) ?? "Markdown"} source mode`}
                    aria-pressed={current.mode === "source"}
                    className={current.mode === "source" ? "active" : ""}
                    onClick={() => {
                      if (current.mode !== "source") void toggleMode(current);
                    }}
                  >
                    <Code2 size={14} /> Source
                  </button>
                </div>
              </div>
            )}
            {(split?.assignment ||
              (current &&
                (isMarkdown(current.path) || isPDF(current.path)))) && (
              <button
                className="teaching-action"
                aria-label={
                  split?.assignment ? "Unpin assignment" : "Pin assignment"
                }
                aria-pressed={!!split?.assignment}
                data-tooltip={
                  split?.assignment
                    ? "Unpin assignment"
                    : "Keep this assignment on the left"
                }
                onClick={toggleAssignment}
              >
                <Pin size={14} />
                <span>{split?.assignment ? "Unpin" : "Pin assignment"}</span>
              </button>
            )}
            {(livePreview ||
              (current && supportsLivePreview(current.path))) && (
              <button
                className="teaching-action"
                aria-label={
                  livePreview
                    ? "Hide live preview"
                    : "Show live preview beside code"
                }
                aria-pressed={livePreview}
                onClick={() => void toggleLivePreview()}
              >
                <Eye size={14} />
                <span>Preview</span>
              </button>
            )}
            <button
              className="view-menu-button"
              aria-label="View options"
              aria-haspopup="menu"
              onClick={(event) => {
                const button = event.currentTarget;
                const rect = button.getBoundingClientRect();
                openMenu({
                  x: rect.left,
                  y: rect.bottom + 4,
                  restoreFocus: () => button.focus(),
                  items: [
                    {
                      label: split ? "Close split view" : "Split editor",
                      disabled: !current,
                      run: () => (split ? setSplit(null) : openBeside()),
                    },
                    {
                      label: showOutline ? "Hide outline" : "Show outline",
                      disabled: !root || (!!current && isPDF(current.path)),
                      run: () => setShowOutline(!showOutline),
                    },
                    null,
                    {
                      label: settings.focusMode
                        ? "Leave focus mode"
                        : "Enter focus mode",
                      run: () =>
                        updateSettings({ focusMode: !settings.focusMode }),
                    },
                    {
                      label: `Switch to ${settings.theme === "light" ? "dark" : "light"} theme`,
                      run: () =>
                        updateSettings({
                          theme: settings.theme === "light" ? "dark" : "light",
                        }),
                    },
                  ],
                });
              }}
            >
              View <ChevronDown size={12} />
            </button>
            <button
              className="document-menu-button"
              aria-label="Document actions"
              data-tooltip="Document actions"
              aria-haspopup="menu"
              disabled={
                reopeningClosed || (!root && !closedTabs.current.length)
              }
              onClick={(event) => {
                const button = event.currentTarget;
                const rect = button.getBoundingClientRect();
                openMenu({
                  x: rect.left,
                  y: rect.bottom + 4,
                  restoreFocus: () => button.focus(),
                  items: [
                    ...(current
                      ? [
                          {
                            label: "Save file",
                            shortcut: `${keyboard}+S`,
                            disabled: isReadOnlyPreview(current.path),
                            run: () => saveTab(current.path),
                          },
                          {
                            label: "Save all files",
                            shortcut: `${keyboard}+Shift+S`,
                            run: () => saveAll(),
                          },
                        ]
                      : []),
                    ...(current && !isReadOnlyPreview(current.path)
                      ? [
                          {
                            label: "Save as…",
                            run: () => saveAs(current.path, false),
                          },
                          {
                            label: "Save a copy…",
                            run: () => saveAs(current.path, true),
                          },
                          null,
                        ]
                      : []),
                    ...(current &&
                    current.mode === "source" &&
                    supportsFormatting(current.path)
                      ? [
                          {
                            label: "Format document",
                            shortcut: "Shift+Alt+F",
                            disabled:
                              formatState.path === current.path &&
                              formatState.busy,
                            run: () =>
                              window.dispatchEvent(
                                new CustomEvent("margin:format-document", {
                                  detail: { path: current.path },
                                }),
                              ),
                          },
                          null,
                        ]
                      : []),
                    ...(current && !isReadOnlyPreview(current.path)
                      ? [
                          ...(isMarkdown(current.path)
                            ? [
                                {
                                  label: "Export to PDF…",
                                  run: () =>
                                    setPdfSource({
                                      path: current.path,
                                      directory: false,
                                      label: current.path,
                                    }),
                                },
                              ]
                            : []),
                          {
                            label: "Local version history",
                            run: () => showHistory(current.path),
                          },
                        ]
                      : []),
                    {
                      label: "Compare files",
                      disabled: !root,
                      run: () => compareFiles(),
                    },
                    null,
                    {
                      label: "Reopen closed tab",
                      shortcut: keyboard + "+Shift+T",
                      disabled: !closedTabs.current.length,
                      run: () => reopenClosed(),
                    },
                  ],
                });
              }}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
          {recovery.length > 0 && (
            <div className="recovery-banner">
              <AlertTriangle size={16} />A previous file operation needs
              recovery. Writes are paused.
              <button onClick={() => setShowSettings(true)}>
                View details
              </button>
            </div>
          )}
          <div
            className={
              "editor-area" +
              (split ? " split" : "") +
              (previewVisible ? " with-preview" : "")
            }
            style={
              {
                "--preview-code-fr": `${((split ? 2.2 : 2) * previewRatio) / 100}fr`,
                "--preview-result-fr": `${((split ? 2.2 : 2) * (100 - previewRatio)) / 100}fr`,
              } as React.CSSProperties
            }
          >
            {tabs.map((tab) => (
              <section
                key={tab.path + ":" + tab.version}
                className={
                  "editor-pane " +
                  (active === tab.path ? "active " : "") +
                  (split &&
                  (split.left === tab.path || split.right === tab.path)
                    ? "split-visible"
                    : "")
                }
                inert={
                  active !== tab.path &&
                  split?.left !== tab.path &&
                  split?.right !== tab.path
                }
                style={
                  split
                    ? {
                        gridColumn: split.left === tab.path ? 1 : 2,
                        gridRow: 1,
                      }
                    : undefined
                }
                onPointerDownCapture={() => {
                  if (
                    split &&
                    (split.left === tab.path || split.right === tab.path)
                  )
                    focusPane(tab.path);
                }}
                onFocusCapture={() => {
                  if (
                    split &&
                    (split.left === tab.path || split.right === tab.path)
                  )
                    focusPane(tab.path);
                }}
                aria-label={`Editor for ${basename(tab.path)}`}
                data-path={tab.path}
              >
                {split &&
                  (split.left === tab.path || split.right === tab.path) && (
                    <div className="split-pane-title">
                      <span data-tooltip={tab.path}>
                        {split.assignment && split.left === tab.path
                          ? "Pinned assignment · "
                          : ""}
                        {tab.path}
                      </span>
                      <button
                        className="icon-button small"
                        aria-label={
                          split.left === tab.path
                            ? "Close left pane"
                            : "Close right pane"
                        }
                        onClick={() => {
                          const other =
                            split.left === tab.path ? split.right : split.left;
                          if (split.assignment && split.right === tab.path)
                            setSplit({ ...split, right: "" });
                          else setSplit(null);
                          if (other) void openFile(other);
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
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
                {isPDF(tab.path) ? (
                  <Suspense
                    fallback={
                      <div className="pdf-notice" role="status">
                        Loading PDF viewer…
                      </div>
                    }
                  >
                    <PdfPreview
                      key={root + ":" + tab.path}
                      path={tab.path}
                      position={positions.current.get(tab.path) || tab.position}
                      visible={
                        active === tab.path ||
                        split?.left === tab.path ||
                        split?.right === tab.path
                      }
                    />
                  </Suspense>
                ) : isImage(tab.path) ? (
                  <ImagePreview path={tab.path} />
                ) : previewType(tab.path) && tab.mode === "visual" ? (
                  <HtmlPreview
                    path={tab.path}
                    text={tab.text}
                    onLink={(href) => void followLink(tab.path, href)}
                    onActivate={() => focusPane(tab.path)}
                    position={positions.current.get(tab.path) || tab.position}
                  />
                ) : isMarkdown(tab.path) &&
                  tab.mode === "visual" &&
                  visualProtection(tab.text) ? (
                  <MarkdownPreview
                    path={tab.path}
                    text={tab.text}
                    onLink={(href) => void followLink(tab.path, href)}
                    onActivate={() => focusPane(tab.path)}
                    position={positions.current.get(tab.path) || tab.position}
                  />
                ) : isMarkdown(tab.path) && tab.mode === "visual" ? (
                  <MarkdownEditor
                    path={tab.path}
                    text={tab.text}
                    onChange={(text) => edit(tab.path, text)}
                    onError={(text) => notify(text, true)}
                    onLink={(href) => void followLink(tab.path, href)}
                    entries={entries}
                    tabs={tabs}
                    spellcheck={spellcheck}
                    active={active === tab.path}
                    visible={
                      active === tab.path ||
                      split?.left === tab.path ||
                      split?.right === tab.path
                    }
                    position={positions.current.get(tab.path) || tab.position}
                  />
                ) : (
                  <>
                    {isMarkdown(tab.path) && visualProtection(tab.text) && (
                      <div className="source-protection">
                        Source preserves {visualProtection(tab.text)}
                      </div>
                    )}
                    <CodeEditor
                      path={tab.path}
                      text={tab.text}
                      settings={editorSettings}
                      active={active === tab.path}
                      visible={
                        active === tab.path ||
                        split?.left === tab.path ||
                        split?.right === tab.path
                      }
                      allowAutoFormat={
                        !tab.dirty && !tab.conflict && !tab.suppressAutoFormat
                      }
                      position={positions.current.get(tab.path) || tab.position}
                      onChange={(text) => edit(tab.path, text)}
                      onError={(text) => notify(text, true)}
                      onFormatStatus={formatStatusChanged}
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
            {split?.assignment && !split.right && (
              <div className="assignment-placeholder">
                Open a code file to work beside this assignment.
              </div>
            )}
            {previewVisible && (
              <PreviewDivider
                ratio={previewRatio}
                codePath={split?.right || active}
                onChange={setPreviewRatio}
              />
            )}
            {previewVisible && (
              <LivePreview
                key={root}
                path={previewTab.path}
                text={previewTab.text}
                overlays={previewOverlays}
                revision={previewRevision}
                visible={previewVisible}
                onLink={(href) => void followLink(previewTab.path, href)}
                onClose={() => setLivePreview(false)}
              />
            )}
            {showOutline &&
              !presentation &&
              current &&
              !isReadOnlyPreview(current.path) && (
                <DocumentOutline
                  path={current.path}
                  text={current.text}
                  mode={current.mode}
                  onClose={() => setShowOutline(false)}
                  onNavigate={(item) => {
                    void openFile(current.path, undefined, {
                      range: { from: item.from, to: item.from },
                      mode: previewType(current.path) ? "source" : current.mode,
                      preserveText: previewType(current.path) !== null,
                    });
                  }}
                />
              )}
          </div>
          {settings.terminalVisible && !settings.focusMode && !presentation && (
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
              (settings.terminalVisible && !settings.focusMode && !presentation
                ? "visible"
                : "")
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
                      {terminal.name}
                      {terminal.cwd ? ` · ${terminal.cwd}` : ""}{" "}
                      <span>{index + 1}</span>
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
                data-tooltip="New terminal"
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
                    !settings.focusMode &&
                    !presentation
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
            <span className="save-status" role="status" aria-live="polite">
              <span className="save-state">
                {isReadOnlyPreview(current.path) ? (
                  "Read-only"
                ) : current.conflict ? (
                  <>
                    <AlertTriangle size={12} /> Conflict
                  </>
                ) : current.dirty ? (
                  "Unsaved"
                ) : (
                  <>
                    <Check size={12} /> Saved
                  </>
                )}
              </span>
            </span>
            {current.mode === "source" &&
              formatState.path === current.path &&
              (formatState.busy || formatState.text) && (
                <span
                  className="format-status"
                  role="status"
                  title={formatState.busy ? "Formatting…" : formatState.text}
                >
                  {formatState.busy ? "Formatting…" : formatState.text}
                </span>
              )}
            {!isPDF(current.path) && (
              <>
                <span>
                  {current.text.trim()
                    ? current.text.trim().split(/\s+/).length
                    : 0}{" "}
                  words
                </span>
                <span>UTF-8</span>
                <span>{current.text.includes("\r\n") ? "CRLF" : "LF"}</span>
              </>
            )}
            <span>
              {isMarkdown(current.path)
                ? "Markdown"
                : current.path.split(".").pop()?.toUpperCase()}
            </span>
          </>
        )}
        <button
          data-tooltip="Autosave preferences"
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
            {!paletteBeside.current && (
              <nav className="search-scopes" aria-label="Search scope">
                <button
                  aria-pressed={palette === "files"}
                  onClick={() => {
                    setPalette("files");
                    setPaletteIndex(0);
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLInputElement>(".palette-input input")
                        ?.focus(),
                    );
                  }}
                >
                  Files
                </button>
                <button
                  onClick={() => {
                    setSearchOptions((previous) => ({ ...previous, query }));
                    setPalette(null);
                    showWorkspaceSearch();
                  }}
                >
                  Contents
                </button>
                <button
                  aria-pressed={palette === "commands"}
                  onClick={() => {
                    setPalette("commands");
                    setPaletteIndex(0);
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLInputElement>(".palette-input input")
                        ?.focus(),
                    );
                  }}
                >
                  Commands
                </button>
              </nav>
            )}
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
                    ? "Search files… (name:42 or name:42:5)"
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
                ? paletteBeside.current
                  ? "CHOOSE A SECOND DOCUMENT"
                  : "FILES IN YOUR WORKSPACE"
                : "WORKSPACE COMMANDS"}
            </div>
            <div className="palette-results">
              {paletteItems.map((item, index) => (
                <button
                  key={item.label + item.detail + index}
                  className={paletteIndex === index ? "active" : ""}
                  data-palette-active={paletteIndex === index}
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
                  setPaletteIndex(0);
                }}
              >
                {palette === "files" ? "Switch to commands" : "Switch to files"}
              </button>
            </div>
          </div>
        </div>
      )}
      {comparison && (
        <CompareFilesDialog
          initialLeft={comparison.left}
          initialRight={comparison.right}
          entries={entries}
          tabs={tabs}
          onClose={() => setComparison(null)}
        />
      )}
      {historyPath && (
        <HistoryDialog
          path={historyPath}
          text={tabs.find((tab) => tab.path === historyPath)?.text || ""}
          onClose={() => setHistoryPath("")}
          onError={fail}
          onRestore={async (text) => {
            const tab = tabsRef.current.find((tab) => tab.path === historyPath);
            if (!tab) return;
            await window.margin.historyCheckpoint(historyPath, tab.text);
            changeTabs((previous) =>
              previous.map((entry) =>
                entry.path === historyPath
                  ? {
                      ...entry,
                      text,
                      dirty: text !== entry.baseline,
                      mode: documentMode(entry.path, text, entry.mode),
                    }
                  : entry,
              ),
            );
            setHistoryPath("");
            notify("Version restored to the editor. Save to update the file.");
          }}
        />
      )}
      {showSettings && (
        <PreferencesDialog
          settings={settings}
          spellcheck={spellcheck}
          recovery={recovery}
          keyboard={keyboard}
          updateSettings={updateSettings}
          onIgnoredChange={async (ignored) => {
            if (!(await settleEdits("Changing workspace exclusions"))) return;
            if (await updateSettings({ ignored })) {
              setTerminalTabs([]);
              await refreshTree();
            }
          }}
          onReset={resetPreferences}
          onClose={() => setShowSettings(false)}
        />
      )}
      {pdfSource && (
        <PdfExportDialog
          {...pdfSource}
          overlays={() =>
            tabsRef.current
              .filter((tab) => isMarkdown(tab.path))
              .map((tab) => ({ path: tab.path, text: tab.text }))
          }
          onClose={() => setPdfSource(null)}
        />
      )}
      {dialog && (
        <div className="modal-scrim dialog-scrim">
          <form
            className={
              "action-dialog " +
              (dialog.extra ? "wide" : dialog.movePaths ? "move-dialog" : "")
            }
            role="dialog"
            aria-modal="true"
            aria-label={dialog.title}
            onSubmit={(e) => {
              e.preventDefault();
              if (
                dialog.input !== undefined &&
                (dialog.movePaths
                  ? !moveProblem(dialog.movePaths, dialogInput.trim(), entries)
                  : dialogInput.trim())
              )
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
            {dialog.movePaths && (
              <MoveDestinationPicker
                entries={entries}
                paths={dialog.movePaths}
                directory={dialogInput.trim()}
                onChange={setDialogInput}
              />
            )}
            <div className="dialog-actions">
              {dialog.choices.map((choice, index) => (
                <button
                  key={choice.id}
                  autoFocus={dialog.input === undefined && index === 0}
                  className={
                    choice.primary ? "primary" : choice.danger ? "danger" : ""
                  }
                  type={choice.id === "submit" ? "submit" : "button"}
                  disabled={
                    choice.id === "submit" &&
                    (dialog.movePaths
                      ? !!moveProblem(
                          dialog.movePaths,
                          dialogInput.trim(),
                          entries,
                        )
                      : !dialogInput.trim())
                  }
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
