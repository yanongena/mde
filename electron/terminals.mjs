import * as pty from "node-pty";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";

export function installedShells() {
  if (process.platform === "win32") {
    const candidates = [
      [
        "PowerShell",
        path.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        ),
        ["-NoLogo"],
      ],
      [
        "PowerShell 7",
        path.join(
          process.env.ProgramFiles || "C:\\Program Files",
          "PowerShell",
          "7",
          "pwsh.exe",
        ),
        ["-NoLogo"],
      ],
      [
        "Command Prompt",
        process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
        [],
      ],
      [
        "Git Bash",
        path.join(
          process.env.ProgramFiles || "C:\\Program Files",
          "Git",
          "bin",
          "bash.exe",
        ),
        ["--login"],
      ],
    ];
    return candidates
      .filter(([, executable]) => fs.existsSync(executable))
      .map(([name, executable, args]) => ({ name, executable, args }));
  }
  return [
    ...new Set(
      [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(Boolean),
    ),
  ]
    .filter((executable) => fs.existsSync(executable))
    .map((executable) => ({
      name: path.basename(executable),
      executable,
      args: ["-l"],
    }));
}
export class Terminals {
  constructor(send) {
    this.send = send;
    this.sessions = new Map();
  }
  create(cwd, shellName) {
    const shell =
      installedShells().find((s) => s.name === shellName) ||
      installedShells()[0];
    if (!shell) throw new Error("No supported shell is installed.");
    if (this.sessions.size >= 12)
      throw new Error("Close a terminal before opening more than 12 sessions.");
    const id = randomUUID();
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => typeof v === "string"),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    const processPty = pty.spawn(shell.executable, shell.args, {
      name: "xterm-256color",
      cols: 100,
      rows: 24,
      cwd,
      env,
    });
    const terminal = {
      id,
      name: shell.name,
      pty: processPty,
      buffer: "",
      exited: false,
      released: false,
    };
    terminal.release = () => {
      if (!terminal.released) {
        terminal.released = true;
        processPty.kill();
      }
    };
    this.sessions.set(id, terminal);
    processPty.onData((data) => {
      terminal.buffer = (terminal.buffer + data).slice(-200000);
      this.send("terminal:data", { id, data });
    });
    processPty.onExit(({ exitCode }) => {
      terminal.exited = true;
      if (process.platform === "win32") terminal.release();
      this.send("terminal:exit", { id, exitCode });
    });
    return { id, name: shell.name };
  }
  write(id, data) {
    const term = this.sessions.get(id);
    if (
      term &&
      !term.exited &&
      typeof data === "string" &&
      data.length <= 1000000
    )
      term.pty.write(data);
  }
  resize(id, cols, rows) {
    if (
      Number.isInteger(cols) &&
      Number.isInteger(rows) &&
      cols > 1 &&
      cols < 1000 &&
      rows > 0 &&
      rows < 500
    ) {
      const term = this.sessions.get(id);
      if (term && !term.exited) term.pty.resize(cols, rows);
    }
  }
  async close(id) {
    const term = this.sessions.get(id);
    if (!term) return;
    this.sessions.delete(id);
    if (term.exited) return;
    if (process.platform === "win32") {
      // Stop descendants as well as the shell, then release ConPTY's native
      // handle and its drain worker. The pinned node-pty version tolerates an
      // already-exited console in its process-list helper.
      await new Promise((resolve) =>
        execFile(
          path.join(
            process.env.SystemRoot || "C:\\Windows",
            "System32",
            "taskkill.exe",
          ),
          ["/pid", String(term.pty.pid), "/T", "/F"],
          { windowsHide: true, timeout: 5000 },
          () => resolve(),
        ),
      );
      term.release();
    } else term.release();
  }
  async closeAll() {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }
}
