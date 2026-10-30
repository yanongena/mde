import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Workspace } from "./workspace.mjs";

const MAX_BYTES = 64 * 1024 * 1024;

// A disposable project copy keeps preview requests and PHP-generated files out
// of the teaching material. PHP itself runs with the user's normal permissions.
export class PhpPreview {
  constructor() {
    this.queue = Promise.resolve();
    this.files = new Map();
    this.generation = 0;
  }
  enqueue(action) {
    const task = this.queue.then(action);
    this.queue = task.catch(() => {});
    return task;
  }
  render(workspace, request) {
    const generation = this.generation;
    return this.enqueue(async () => {
      if (generation !== this.generation)
        throw new Error("PHP preview stopped.");
      if (!request || !/\.(php|phtml)$/i.test(request.path))
        throw new Error("Choose a PHP or PHTML file to preview.");
      const sourceFile = await workspace.resolve(request.path);
      const contextRoot = await workspace.resolve(request.context ?? "");
      if (!(await fs.stat(contextRoot)).isDirectory())
        throw new Error("Choose a folder for the PHP context.");
      const requestPath = path
        .relative(contextRoot, sourceFile)
        .split(path.sep)
        .join("/");
      if (requestPath.startsWith("../") || path.isAbsolute(requestPath))
        throw new Error(
          "The PHP file is outside the selected context. Start PHP again and choose a parent folder.",
        );
      const project = new Workspace(
        contextRoot,
        workspace.transactions,
        workspace.ignored,
      );
      if (!Array.isArray(request.overlays) || request.overlays.length > 100)
        throw new Error("Invalid preview buffers.");
      const overlays = new Map();
      for (const entry of request.overlays) {
        const source = await workspace.resolve(entry.path);
        if (
          typeof entry.text !== "string" ||
          Buffer.byteLength(entry.text) > 10 * 1024 * 1024
        )
          throw new Error("A preview buffer exceeds 10 MB.");
        const relative = path
          .relative(contextRoot, source)
          .split(path.sep)
          .join("/");
        if (!relative.startsWith("../") && !path.isAbsolute(relative))
          overlays.set(relative, entry.text);
      }
      if (
        this.root !== contextRoot ||
        !this.child ||
        this.child.exitCode !== null ||
        this.child.signalCode !== null
      ) {
        await this.dispose();
        this.temporary = await fs.mkdtemp(
          path.join(os.tmpdir(), "margin-php-"),
        );
        this.directory = path.join(this.temporary, "project");
        await fs.mkdir(this.directory);
        this.root = contextRoot;
      }
      try {
        const entries = (await project.tree()).filter(
          (entry) => !entry.directory,
        );
        if (entries.length > 10000)
          throw new Error(
            "The selected PHP context exceeds 10,000 files. Start PHP again and choose a smaller folder.",
          );
        let bytes = 0;
        const current = new Set();
        for (const entry of entries) {
          if (generation !== this.generation)
            throw new Error("PHP preview stopped.");
          const source = await project.resolve(entry.path);
          const stat = await fs.stat(source);
          const overlay = overlays.get(entry.path);
          bytes +=
            overlay === undefined ? stat.size : Buffer.byteLength(overlay);
          if (bytes > MAX_BYTES)
            throw new Error(
              "The selected PHP context exceeds 64 MB. Start PHP again and choose a smaller folder.",
            );
          current.add(entry.path);
          const signature =
            overlay === undefined ? `${stat.mtimeMs}:${stat.size}` : overlay;
          const previous = this.files.get(entry.path);
          if (
            previous?.signature === signature &&
            previous?.overlay === (overlay !== undefined)
          )
            continue;
          const target = path.join(this.directory, entry.path);
          await fs.mkdir(path.dirname(target), { recursive: true });
          if (overlay === undefined) await fs.copyFile(source, target);
          else await fs.writeFile(target, overlay);
          this.files.set(entry.path, {
            signature,
            overlay: overlay !== undefined,
          });
        }
        for (const name of this.files.keys()) {
          if (!current.has(name)) {
            await fs.rm(path.join(this.directory, name), { force: true });
            this.files.delete(name);
          }
        }
        if (!current.has(requestPath))
          throw new Error(
            "This PHP file is excluded from the workspace preview.",
          );
        if (generation !== this.generation)
          throw new Error("PHP preview stopped.");
        if (!this.child) await this.start(generation);
        const url = `${this.address}/${requestPath.split("/").map(encodeURIComponent).join("/")}`;
        this.controller = new AbortController();
        const response = await fetch(url, {
          signal: AbortSignal.any([
            this.controller.signal,
            AbortSignal.timeout(10000),
          ]),
          redirect: "error",
        });
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 5 * 1024 * 1024)
            throw new Error("PHP output exceeds 5 MB.");
          chunks.push(chunk);
        }
        return {
          html: Buffer.concat(chunks).toString("utf8"),
          url,
          status: response.status,
        };
      } catch (error) {
        await this.dispose();
        if (error.code === "ENOENT")
          throw new Error(
            "PHP was not found. Install PHP and make it available on PATH, then start the preview again.",
          );
        if (error.name === "TimeoutError")
          throw new Error(
            "PHP preview timed out after 10 seconds. The server has been stopped.",
          );
        throw error;
      }
    });
  }
  async start(generation) {
    const portServer = createServer();
    portServer.listen(0, "127.0.0.1");
    await once(portServer, "listening");
    const port = portServer.address().port;
    await new Promise((resolve) => portServer.close(resolve));
    let executable = "php";
    if (process.platform === "darwin") {
      for (const candidate of ["/opt/homebrew/bin/php", "/usr/local/bin/php"]) {
        if (
          await fs.access(candidate).then(
            () => true,
            () => false,
          )
        ) {
          executable = candidate;
          break;
        }
      }
    }
    this.address = `http://127.0.0.1:${port}`;
    const router = path.join(this.temporary, "router.php");
    await fs.writeFile(
      router,
      `<?php
$root = realpath(__DIR__ . '/project');
$file = realpath($root . '/' . rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)));
if ($file && strpos($file, $root . DIRECTORY_SEPARATOR) === 0 && preg_match('/\\.(php|phtml)$/i', $file)) {
    chdir(dirname($file));
    require $file;
    return true;
}
return false;
`,
    );
    const environment = { ...process.env };
    delete environment.PHP_CLI_SERVER_WORKERS;
    if (generation !== this.generation) throw new Error("PHP preview stopped.");
    const child = (this.child = spawn(
      executable,
      [
        // Preview buffers change rapidly; cli-server can enable OPcache even
        // when opcache.enable_cli is off and serve stale code after a refresh.
        "-d",
        "opcache.enable=0",
        "-d",
        "display_errors=1",
        "-d",
        "html_errors=1",
        "-S",
        `127.0.0.1:${port}`,
        "-t",
        this.directory,
        router,
      ],
      {
        cwd: this.directory,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: environment,
      },
    ));
    await new Promise((resolve, reject) => {
      let log = "";
      const timer = setTimeout(
        () => done(new Error("PHP server did not start within 5 seconds.")),
        5000,
      );
      const output = (chunk) => {
        log = (log + chunk.toString()).slice(-4000);
        if (log.includes("Development Server") && log.includes("started"))
          done();
      };
      const failed = (error) => done(error);
      const exited = () =>
        done(new Error(log || "PHP server stopped unexpectedly."));
      const done = (error) => {
        clearTimeout(timer);
        child.off("error", failed);
        child.off("exit", exited);
        child.stdout.off("data", output);
        child.stderr.off("data", output);
        // Continue draining pipes, without retaining project output in memory.
        child.stdout.resume();
        child.stderr.resume();
        error ? reject(error) : resolve();
      };
      child.once("error", failed);
      child.once("exit", exited);
      child.stdout.on("data", output);
      child.stderr.on("data", output);
    });
    child.on("error", () => {});
  }
  stop() {
    this.generation++;
    this.controller?.abort();
    this.kill();
    return this.enqueue(() => this.dispose());
  }
  kill() {
    this.child?.kill("SIGKILL");
  }
  async dispose() {
    const child = this.child;
    this.child = undefined;
    if (
      child &&
      child.exitCode === null &&
      child.signalCode === null &&
      child.pid
    ) {
      const exited = once(child, "exit").catch(() => {});
      child.kill("SIGKILL");
      await exited;
    }
    if (this.temporary)
      await fs.rm(this.temporary, { recursive: true, force: true });
    this.temporary = undefined;
    this.directory = undefined;
    this.root = undefined;
    this.files.clear();
  }
}
