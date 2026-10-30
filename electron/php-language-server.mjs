import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isPhp } from "./code-symbols.mjs";

// A bounded stdio JSON-RPC client. It never runs shell strings or server edits.
export class PhpLanguageServer {
  constructor(spawnProcess = spawn) {
    this.spawnProcess = spawnProcess;
    this.pending = new Map();
    this.documents = new Map();
    this.sequence = 0;
    this.status = "off";
    this.message = "";
  }
  send(value) {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...value }));
    if (this.child?.stdin.writable)
      this.child.stdin.write(
        Buffer.concat([
          Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),
          body,
        ]),
      );
  }
  request(method, params, timeout = 4000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.send({ method: "$/cancelRequest", params: { id } });
        reject(new Error("PHP language server timed out."));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > 8_000_000) {
      this.fail("PHP language server response is too large.");
      return;
    }
    for (;;) {
      const end = this.buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      const size = /Content-Length:\s*(\d+)/i.exec(
        this.buffer.subarray(0, end).toString(),
      );
      if (!size || +size[1] > 8_000_000) {
        this.fail("Invalid PHP language server response.");
        return;
      }
      const length = +size[1];
      if (this.buffer.length < end + 4 + length) return;
      let value;
      try {
        value = JSON.parse(
          this.buffer.subarray(end + 4, end + 4 + length).toString(),
        );
      } catch {
        this.fail("Invalid PHP language server JSON.");
        return;
      }
      this.buffer = this.buffer.subarray(end + 4 + length);
      if (value.method && value.id !== undefined) {
        if (value.method === "workspace/configuration")
          this.send({
            id: value.id,
            result: (value.params?.items || []).map(() => null),
          });
        else if (value.method === "workspace/workspaceFolders")
          this.send({
            id: value.id,
            result: [{ uri: this.rootUri, name: path.basename(this.root) }],
          });
        else if (
          [
            "client/registerCapability",
            "client/unregisterCapability",
            "window/workDoneProgress/create",
          ].includes(value.method)
        )
          this.send({ id: value.id, result: null });
        else
          this.send({
            id: value.id,
            error: { code: -32601, message: "Unsupported client request" },
          });
      } else if (value.id !== undefined) {
        const pending = this.pending.get(value.id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(value.id);
        if (value.error) pending.reject(new Error(String(value.error.message)));
        else pending.resolve(value.result);
      }
    }
  }
  fail(message) {
    this.status = "error";
    this.message = message;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(message));
    }
    this.pending.clear();
    this.child?.kill();
  }
  useWorkspace(workspace) {
    this.stop();
    this.workspace = workspace;
  }
  async start(workspace, executable) {
    if (this.workspace && this.workspace !== workspace)
      throw new Error("The workspace changed.");
    if (
      this.root === workspace.root &&
      this.executable === executable &&
      this.starting
    )
      return this.starting;
    this.stop();
    this.root = workspace.root;
    this.executable = executable;
    this.rootUri = pathToFileURL(workspace.root).href;
    this.status = "starting";
    this.message = "";
    this.buffer = Buffer.alloc(0);
    const env = {
      ...process.env,
      PATH: [
        ...new Set([
          process.env.PATH || "",
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
        ]),
      ].join(path.delimiter),
    };
    const phar = /\.phar$/i.test(executable);
    const child = (this.child = this.spawnProcess(
      phar ? "php" : executable,
      phar ? [executable, "language-server"] : ["language-server"],
      {
        cwd: workspace.root,
        env,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      },
    ));
    child.stdout.on("data", (chunk) => {
      if (this.child === child) this.receive(chunk);
    });
    child.stderr.on("data", () => {}); // Drain stderr; user code and server logs stay out of the UI.
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      if (this.child === child)
        this.fail(`Cannot start Phpactor: ${error.message}`);
    });
    child.on("exit", () => {
      if (
        this.child === child &&
        this.status !== "off" &&
        this.status !== "error"
      )
        this.fail("Phpactor stopped. Disable and enable it to reconnect.");
    });
    this.starting = this.request(
      "initialize",
      {
        processId: process.pid,
        rootUri: this.rootUri,
        workspaceFolders: [
          { uri: this.rootUri, name: path.basename(workspace.root) },
        ],
        capabilities: {
          general: { positionEncodings: ["utf-16"] },
          workspace: { configuration: true, workspaceFolders: true },
          textDocument: {
            synchronization: { didSave: true },
            completion: {
              completionItem: {
                snippetSupport: false,
                documentationFormat: ["plaintext"],
              },
            },
            signatureHelp: {
              signatureInformation: {
                documentationFormat: ["plaintext"],
                parameterInformation: { labelOffsetSupport: true },
              },
            },
          },
        },
      },
      12000,
    )
      .then((response) => {
        if (this.child !== child)
          throw new Error("PHP language server changed.");
        if (
          response?.capabilities?.positionEncoding &&
          response.capabilities.positionEncoding !== "utf-16"
        )
          throw new Error("Phpactor must use UTF-16 positions.");
        this.capabilities = response?.capabilities || {};
        this.send({ method: "initialized", params: {} });
        this.status = "ready";
      })
      .catch((error) => {
        if (this.child === child) this.fail(error.message);
        throw error;
      });
    return this.starting;
  }
  async query(workspace, executable, request) {
    if (
      !request ||
      !isPhp(request.path) ||
      !["completion", "signatureHelp"].includes(request.method) ||
      !Array.isArray(request.overlays) ||
      request.overlays.length > 100
    )
      throw new Error("Invalid PHP language request.");
    const file = await workspace.resolve(request.path);
    if (!Number.isInteger(request.pos) || request.pos < 0)
      throw new Error("Invalid PHP position.");
    const buffers = new Map();
    let size = 0;
    for (const entry of request.overlays) {
      if (
        typeof entry?.path !== "string" ||
        typeof entry.text !== "string" ||
        entry.text.length > 1_000_000 ||
        (size += entry.text.length) > 20_000_000
      )
        throw new Error("Invalid PHP buffers.");
      if (!isPhp(entry.path)) continue;
      if (
        entry.path.split("/").some((part) => workspace.ignored.includes(part))
      )
        continue;
      const target = await workspace.resolve(entry.path);
      buffers.set(
        pathToFileURL(target).href,
        entry.text.replace(/\r\n/g, "\n"),
      );
    }
    const uri = pathToFileURL(file).href;
    if (!buffers.has(uri))
      buffers.set(
        uri,
        (await workspace.read(request.path)).text.replace(/\r\n/g, "\n"),
      );
    const text = buffers.get(uri);
    if (text.length > 1_000_000 || request.pos > text.length)
      throw new Error("PHP position is outside the buffer.");
    await this.start(workspace, executable);
    for (const [oldUri] of this.documents)
      if (!buffers.has(oldUri)) {
        this.send({
          method: "textDocument/didClose",
          params: { textDocument: { uri: oldUri } },
        });
        this.documents.delete(oldUri);
      }
    for (const [bufferUri, content] of buffers) {
      const old = this.documents.get(bufferUri);
      if (old?.text === content) continue;
      const version = (old?.version || 0) + 1;
      if (!old)
        this.send({
          method: "textDocument/didOpen",
          params: {
            textDocument: {
              uri: bufferUri,
              languageId: "php",
              version,
              text: content,
            },
          },
        });
      else
        this.send({
          method: "textDocument/didChange",
          params: {
            textDocument: { uri: bufferUri, version },
            contentChanges: [{ text: content }],
          },
        });
      this.documents.set(bufferUri, { text: content, version });
    }
    const before = text.slice(0, request.pos),
      line = before.split("\n").length - 1,
      character = before.length - before.lastIndexOf("\n") - 1;
    const capability =
      request.method === "completion"
        ? "completionProvider"
        : "signatureHelpProvider";
    if (!this.capabilities[capability]) return null;
    const result = await this.request("textDocument/" + request.method, {
      textDocument: { uri },
      position: { line, character },
    });
    if (
      request.method === "completion" &&
      this.capabilities.completionProvider.resolveProvider
    ) {
      const items = Array.isArray(result) ? result : result?.items;
      // Resolve a bounded batch; Phpactor supplies signatures lazily here.
      if (Array.isArray(items)) {
        const resolved = await Promise.all(
          items
            .slice(0, 12)
            .map((item) =>
              this.request("completionItem/resolve", item, 1500).catch(
                () => item,
              ),
            ),
        );
        items.splice(0, resolved.length, ...resolved);
      }
    }
    return result;
  }
  changed(paths, kind = "change") {
    if (this.status === "ready")
      this.send({
        method: "workspace/didChangeWatchedFiles",
        params: {
          changes: paths.map((name) => ({
            uri: pathToFileURL(path.join(this.root, name)).href,
            type: kind === "add" ? 1 : kind === "unlink" ? 3 : 2,
          })),
        },
      });
  }
  info() {
    return { status: this.status, message: this.message };
  }
  stop() {
    const child = this.child;
    this.child = undefined;
    this.starting = undefined;
    this.root = undefined;
    this.status = "off";
    this.message = "";
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("PHP language server stopped."));
    }
    this.pending.clear();
    this.documents.clear();
    if (child) {
      child.kill();
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      }, 1500);
      timer.unref();
      child.once("exit", () => clearTimeout(timer));
    }
  }
}
