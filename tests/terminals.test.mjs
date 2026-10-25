import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { Terminals, installedShells } from "../electron/terminals.mjs";
test(
  "real PTY supports commands, interactive state, dimensions, and explicit termination",
  { timeout: 20000 },
  async () => {
    const output = new Map();
    let resolveOutput;
    const terminals = new Terminals((channel, payload) => {
      if (channel === "terminal:data") {
        output.set(payload.id, (output.get(payload.id) || "") + payload.data);
        resolveOutput?.();
      }
    });
    const waitFor = async (id, expression) => {
      const end = Date.now() + 12000;
      while (!expression.test(output.get(id) || "")) {
        if (Date.now() > end)
          throw new Error("PTY output timeout: " + output.get(id));
        await new Promise((resolve) => {
          resolveOutput = resolve;
          setTimeout(resolve, 100);
        });
      }
    };
    try {
      const first = terminals.create(os.tmpdir(), installedShells()[0].name),
        second = terminals.create(os.tmpdir(), installedShells()[0].name);
      assert.equal(terminals.sessions.size, 2);
      const command =
        process.platform === "win32"
          ? "Write-Output ('MARGIN_RESULT_' + (6*7))\r"
          : "printf 'MARGIN_RESULT_%s\\n' $((6*7))\r";
      terminals.write(first.id, command);
      await waitFor(first.id, /MARGIN_RESULT_42/);
      terminals.resize(first.id, 90, 18);
      assert.equal(terminals.sessions.get(first.id).pty.cols, 90);
      assert.equal(terminals.sessions.get(first.id).pty.rows, 18);
      const set =
          process.platform === "win32"
            ? "$marginValue=19\r"
            : "marginValue=19\r",
        read =
          process.platform === "win32"
            ? "Write-Output ('STATE_RESULT_' + ($marginValue+4))\r"
            : "printf 'STATE_RESULT_%s\\n' $((marginValue+4))\r";
      terminals.write(first.id, set);
      terminals.write(first.id, read);
      await waitFor(first.id, /STATE_RESULT_23/);
      const pid = terminals.sessions.get(first.id).pty.pid;
      await terminals.close(first.id);
      assert.equal(terminals.sessions.has(first.id), false);
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        try {
          process.kill(pid, 0);
        } catch {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.throws(
        () => process.kill(pid, 0),
        "PTY process should terminate when its tab closes",
      );
    } finally {
      await terminals.closeAll();
      assert.equal(terminals.sessions.size, 0);
    }
  },
);
