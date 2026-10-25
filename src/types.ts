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
}
export interface Settings {
  theme: "light" | "dark";
  autosave: "off" | "afterDelay" | "onBlur";
  autosaveDelay: number;
  attachmentMode: "workspace" | "nearby";
  attachmentFolder: string;
  ignored: string[];
  fontSize: number;
  indentSize: number;
  formatOnOpen: boolean;
  sidebarWidth: number;
  terminalHeight: number;
  sidebarVisible: boolean;
  terminalVisible: boolean;
  focusMode: boolean;
}
export interface SavedSession {
  tabs: Tab[];
  active: string;
  expanded: string[];
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
}
export interface MarginAPI {
  bootstrap(): Promise<{
    settings: Settings;
    recent: string[];
    workspace: OpenedWorkspace | null;
    error: string | null;
    recovery: { file: string; message: string }[];
    shells: string[];
    platform: string;
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
  move(from: string, to: string): Promise<{ referencesUpdated: number }>;
  duplicate(from: string, to: string): Promise<string>;
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
  persist(
    session: Pick<SavedSession, "active" | "expanded" | "tabs">,
  ): Promise<void>;
  openRecovery(): Promise<void>;
  closeConfirmed(): Promise<void>;
  external(url: string): Promise<void>;
  terminalCreate(shell: string): Promise<TerminalInfo>;
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
