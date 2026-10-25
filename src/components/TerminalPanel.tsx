import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import type { TerminalInfo, Settings } from "../types";
import { useContextMenu } from "./ContextMenu";
import { terminalLinkAt } from "../lib/terminal-links";

export function TerminalView({
  info,
  active,
  theme,
  onError,
}: {
  info: TerminalInfo;
  active: boolean;
  theme: Settings["theme"];
  onError(message: string): void;
}) {
  const { openMenu } = useContextMenu();
  const host = useRef<HTMLDivElement>(null),
    terminal = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null),
    errorCallback = useRef(onError);
  errorCallback.current = onError;
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
      scrollback: 10000,
      allowProposedApi: false,
      rightClickSelectsWord: false,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(
      new WebLinksAddon((_event, url) => {
        void window.margin
          .external(url)
          .catch((e) => errorCallback.current(e.message));
      }),
    );
    term.open(host.current);
    terminal.current = term;
    fit.current = fitAddon;
    const input = term.onData((data) => {
      void window.margin
        .terminalWrite(info.id, data)
        .catch((e) => errorCallback.current(e.message));
    });
    const resize = term.onResize(({ cols, rows }) => {
      void window.margin
        .terminalResize(info.id, cols, rows)
        .catch((e) => errorCallback.current(e.message));
    });
    // Subscribe first and buffer events until the snapshot arrives, avoiding startup loss.
    const pending: string[] = [];
    let ready = false;
    const unsubscribe = window.margin.onTerminalData(({ id, data }) => {
      if (id !== info.id) return;
      if (ready) term.write(data);
      else pending.push(data);
    });
    void window.margin.terminalBuffer(info.id).then((buffer) => {
      if (!disposed) {
        term.write(buffer);
        ready = true;
        /* Snapshot includes earlier events; output arriving after the IPC response is delivered normally. */ pending.length = 0;
      }
    });
    const exit = window.margin.onTerminalExit(({ id, exitCode }) => {
      if (id === info.id)
        term.write(
          `\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`,
        );
    });
    const observer = new ResizeObserver(() => {
      if (host.current?.offsetWidth && host.current?.offsetHeight)
        try {
          fitAddon.fit();
        } catch {}
    });
    observer.observe(host.current);
    return () => {
      disposed = true;
      observer.disconnect();
      unsubscribe();
      exit();
      input.dispose();
      resize.dispose();
      term.dispose();
      terminal.current = null;
    };
  }, [info.id]);
  useEffect(() => {
    if (terminal.current)
      terminal.current.options.theme =
        theme === "dark"
          ? {
              background: "#161a1d",
              foreground: "#d5dcd7",
              cursor: "#aad5bc",
              selectionBackground: "#385448",
            }
          : {
              background: "#fafbf9",
              foreground: "#303b36",
              cursor: "#347557",
              selectionBackground: "#d4e9db",
            };
  }, [theme]);
  useEffect(() => {
    if (active)
      requestAnimationFrame(() => {
        try {
          fit.current?.fit();
          terminal.current?.focus();
        } catch {}
      });
  }, [active]);
  return (
    <div
      ref={host}
      className={"terminal-view" + (active ? " active" : "")}
      data-testid="terminal-view"
      onContextMenu={(event) => {
        const term = terminal.current;
        if (!term) return;
        event.preventDefault();
        const selection = term.getSelection();
        const screen = host.current
          ?.querySelector(".xterm-screen")
          ?.getBoundingClientRect();
        const column = screen
          ? Math.floor(
              (event.clientX - screen.left) / (screen.width / term.cols),
            )
          : -1;
        const row = screen
          ? Math.floor(
              (event.clientY - screen.top) / (screen.height / term.rows),
            )
          : -1;
        const url =
          event.button === 2
            ? row >= 0 && row < term.rows && column >= 0 && column < term.cols
              ? terminalLinkAt(term, term.buffer.active.viewportY + row, column)
              : null
            : /^https?:\/\/\S+$/i.test(selection)
              ? selection
              : null;
        openMenu({
          x: event.clientX,
          y: event.clientY,
          restoreFocus: () => {
            if (terminal.current === term) term.focus();
          },
          items: [
            {
              label: "Copy selection",
              disabled: !selection,
              run: () => window.margin.copyText(selection),
            },
            {
              label: "Paste",
              disabled: info.exited,
              run: async () => {
                const text = await window.margin.readClipboardText();
                if (terminal.current === term) term.paste(text);
              },
            },
            { label: "Select all", run: () => term.selectAll() },
            { label: "Clear view", run: () => term.clear() },
            ...(url
              ? [
                  null,
                  {
                    label: "Open link",
                    run: () => window.margin.external(url),
                  },
                  {
                    label: "Copy link address",
                    run: () => window.margin.copyText(url),
                  },
                ]
              : []),
          ],
        });
      }}
    />
  );
}
