export interface Entry {
  path: string;
  name: string;
  directory: boolean;
}
export interface Document {
  path: string;
  text: string;
  revision: string;
}
export interface Tab extends Document {
  baseline: string;
  dirty: boolean;
  mode: "visual" | "source";
  conflict?: Document | "deleted";
  version: number;
  position?: EditorPosition;
  suppressAutoFormat?: boolean;
  pinned?: boolean;
}
export interface EditorPosition {
  mode: "visual" | "source";
  anchor: number;
  head: number;
  sourceAnchor: number;
  sourceHead: number;
  scrollTop: number;
  topSource: number;
  topOffset: number;
  scrollRatio: number;
  signature: string;
}
export interface ClosedTab {
  path: string;
  mode: Tab["mode"];
  position?: EditorPosition;
  index: number;
  pinned?: boolean;
}
export interface SearchOptions {
  query: string;
  include: string;
  exclude: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}
export interface SearchMatch {
  path: string;
  from: number;
  to: number;
  line: number;
  column: number;
  preview: string;
  matchStart: number;
  matchEnd: number;
  value: string;
}
export interface SearchResults {
  matches: SearchMatch[];
  files: number;
  skipped: number;
  truncated: boolean;
  cancelled: boolean;
}
export interface Settings {
  theme: "light" | "dark";
  autosave: "off" | "afterDelay" | "onBlur";
  autosaveDelay: number;
  attachmentMode: "workspace" | "nearby";
  attachmentFolder: string;
  ignored: string[];
  fontSize: number;
  readingFontSize: number;
  readingLineHeight: number;
  readingWidth: number;
  historyEnabled: boolean;
  historyLimitMB: number;
  historyVersions: number;
  indentSize: number;
  formatOnOpen: boolean;
  spellcheckEnabled: boolean;
  spellcheckLanguage: string;
  sidebarWidth: number;
  terminalHeight: number;
  sidebarVisible: boolean;
  terminalVisible: boolean;
  focusMode: boolean;
}
export interface SpellcheckInfo {
  enabled: boolean;
  language: string;
  status: "loading" | "ready" | "error";
  revision: number;
  languages: string[];
  systemLanguage: string;
}
export interface SavedSession {
  tabs: Tab[];
  active: string;
  expanded: string[];
  closedTabs?: ClosedTab[];
  recentFiles?: string[];
  split?: { left: string; right: string } | null;
}
export interface OpenedWorkspace {
  root: string;
  entries: Entry[];
  session: SavedSession | null;
}
export interface Attachment {
  path: string;
  url: string;
}
export interface TerminalInfo {
  id: string;
  name: string;
  exited?: boolean;
  cwd?: string;
}
export interface MarginAPI {
  search(
    request: SearchOptions & {
      id: string;
      overlays: { path: string; text: string }[];
    },
  ): Promise<SearchResults>;
  cancelSearch(id: string): Promise<void>;
  edit(
    command:
      | "undo"
      | "redo"
      | "cut"
      | "copy"
      | "paste"
      | "pasteAndMatchStyle"
      | "selectAll",
  ): Promise<void>;
  copyText(text: string, html?: string): Promise<void>;
  readClipboardText(): Promise<string>;
  copyPath(path: string): Promise<void>;
  reveal(path: string): Promise<void>;
  copyImage(pixels: number[]): Promise<void>;
  imageBytes(source: string): Promise<number[]>;
  bootstrap(): Promise<{
    settings: Settings;
    recent: string[];
    workspace: OpenedWorkspace | null;
    error: string | null;
    recovery: { file: string; message: string }[];
    shells: string[];
    platform: string;
    spellcheck: SpellcheckInfo;
  }>;
  chooseWorkspace(): Promise<OpenedWorkspace | null>;
  openWorkspace(root: string): Promise<OpenedWorkspace>;
  tree(): Promise<Entry[]>;
  read(path: string): Promise<Document>;
  save(
    path: string,
    text: string,
    revision: string,
  ): Promise<{ conflict: boolean; disk?: Document; revision?: string }>;
  create(path: string, directory: boolean): Promise<string>;
  saveCopy(from: string, path: string, text: string): Promise<Document>;
  moveSelection(
    paths: string[],
    directory: string,
  ): Promise<{
    moves: { from: string; to: string }[];
    referencesUpdated: number;
    historyWarning?: string;
  }>;
  trashSelection(paths: string[]): Promise<{
    trashed: string[];
    failed: { path: string; message: string }[];
  }>;
  historyList(
    path: string,
  ): Promise<{ id: string; created: string; bytes: number; reason: string }[]>;
  historyRead(path: string, id: string): Promise<string>;
  historyCheckpoint(path: string, text: string): Promise<void>;
  move(
    from: string,
    to: string,
  ): Promise<{ referencesUpdated: number; historyWarning?: string }>;
  duplicate(from: string, to: string): Promise<string>;
  incomingSelection(paths: string[]): Promise<string[]>;
  incoming(path: string): Promise<string[]>;
  trash(path: string): Promise<void>;
  attachment(
    path: string,
    bytes: number[],
    filename: string,
  ): Promise<Attachment>;
  selectImage(path: string): Promise<Attachment | null>;
  clipboardImage(path: string): Promise<Attachment | null>;
  settings(settings: Partial<Settings>): Promise<Settings>;
  checkSpelling(
    words: string[],
    revision: number,
  ): Promise<{ ready: boolean; misspelled: string[] }>;
  onSpellcheckChanged(callback: (info: SpellcheckInfo) => void): () => void;
  persist(
    session: Pick<
      SavedSession,
      "active" | "expanded" | "tabs" | "closedTabs" | "recentFiles" | "split"
    >,
  ): Promise<void>;
  openRecovery(): Promise<void>;
  closeConfirmed(): Promise<void>;
  external(url: string): Promise<void>;
  terminalCreate(shell: string, directory?: string): Promise<TerminalInfo>;
  terminalWrite(id: string, data: string): Promise<void>;
  terminalResize(id: string, cols: number, rows: number): Promise<void>;
  terminalClose(id: string): Promise<void>;
  terminalBuffer(id: string): Promise<string>;
  onFiles(callback: (paths: string[] | { error: string }) => void): () => void;
  onTerminalData(
    callback: (data: { id: string; data: string }) => void,
  ): () => void;
  onTerminalExit(
    callback: (data: { id: string; exitCode: number }) => void,
  ): () => void;
  onClose(callback: () => void): () => void;
  onCommand(callback: (command: string) => void): () => void;
}
declare global {
  interface Window {
    margin: MarginAPI;
  }
}
