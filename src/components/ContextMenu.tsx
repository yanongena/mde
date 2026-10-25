import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { editMenuItems } from "../lib/edit-menu";

export type MenuItem = {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  children?: MenuItem[];
  run?(): unknown;
} | null;
type MenuSpec = {
  x: number;
  y: number;
  items: MenuItem[];
  restoreFocus(): void;
};
const Context = createContext<{
  openMenu(spec: MenuSpec): void;
  closeMenu(): void;
}>({ openMenu() {}, closeMenu() {} });
export const useContextMenu = () => useContext(Context);

export function ContextMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState<MenuSpec | null>(null);
  const current = useRef(menu);
  current.current = menu;
  const host = useRef<HTMLDivElement>(null);
  const childHost = useRef<HTMLDivElement>(null);
  const [child, setChild] = useState<{
    item: NonNullable<MenuItem>;
    anchor: HTMLButtonElement;
    focus: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const closeMenu = useCallback(() => {
    const previous = current.current;
    current.current = null;
    setMenu(null);
    setChild(null);
    previous?.restoreFocus();
  }, []);
  const openMenu = useCallback((spec: MenuSpec) => {
    current.current = spec;
    setMenu(spec);
    setChild(null);
  }, []);

  useLayoutEffect(() => {
    if (!menu || !host.current) return;
    const element = host.current;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu]);

  useLayoutEffect(() => {
    if (!child || !childHost.current) return;
    const parent = child.anchor.getBoundingClientRect();
    const element = childHost.current;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, parent.right + rect.width + 4 < window.innerWidth ? parent.right + 4 : parent.left - rect.width - 4)}px`;
    element.style.top = `${Math.max(8, Math.min(parent.top, window.innerHeight - rect.height - 8))}px`;
    if (child.focus)
      element
        .querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
  }, [child]);

  useEffect(() => {
    const outside = (event: Event) => {
      if (
        current.current &&
        !host.current?.contains(event.target as Node) &&
        !childHost.current?.contains(event.target as Node)
      )
        closeMenu();
    };
    const dismiss = (event: Event) => {
      if (
        current.current &&
        !(
          event.target instanceof Node &&
          (host.current?.contains(event.target) ||
            childHost.current?.contains(event.target))
        )
      )
        closeMenu();
    };
    const keydown = (event: KeyboardEvent) => {
      if (current.current) {
        const focused = document.activeElement as HTMLButtonElement;
        if (
          event.key === "ArrowRight" &&
          focused?.getAttribute("aria-haspopup") === "menu"
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          focused.click();
          return;
        }
        if (event.key === "ArrowLeft" && childHost.current?.contains(focused)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          host.current
            ?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')
            ?.focus();
          setChild(null);
          return;
        }
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeMenu();
        } else if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const items = Array.from(
            focused
              ?.closest('[role="menu"]')
              ?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ||
              [],
          );
          if (host.current?.contains(focused)) setChild(null);
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[next]?.focus();
        }
        if (event.ctrlKey || event.metaKey) closeMenu();
        return;
      }
      if (
        event.key !== "ContextMenu" &&
        !(event.shiftKey && event.key === "F10")
      )
        return;
      const target = document.activeElement as HTMLElement | null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const selection = window.getSelection();
      const rect =
        target.isContentEditable && selection?.rangeCount
          ? selection.getRangeAt(0).getBoundingClientRect()
          : target.getBoundingClientRect();
      const anchor = selection?.anchorNode;
      const contextTarget =
        target.isContentEditable && anchor && target.contains(anchor)
          ? (anchor instanceof HTMLElement ? anchor : anchor.parentElement) ||
            target
          : target;
      contextTarget.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 8,
          clientY: rect.bottom + 4,
        }),
      );
    };
    const inputs = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof HTMLElement))
        return;
      const target = event.target.closest<
        HTMLInputElement | HTMLTextAreaElement
      >("input, textarea");
      if (
        !target ||
        target.disabled ||
        target.closest(".cm-content, .document-content, .xterm")
      )
        return;
      if (
        target instanceof HTMLInputElement &&
        ![
          "text",
          "search",
          "url",
          "email",
          "tel",
          "password",
          "number",
        ].includes(target.type)
      )
        return;
      event.preventDefault();
      target.focus();
      const start = target.selectionStart,
        end = target.selectionEnd,
        direction = target.selectionDirection;
      openMenu({
        x: event.clientX,
        y: event.clientY,
        restoreFocus: () => {
          if (!target.isConnected) return;
          target.focus({ preventScroll: true });
          if (start !== null && end !== null)
            target.setSelectionRange(start, end, direction || undefined);
        },
        items: editMenuItems({
          selected:
            start !== null && start !== end && target.type !== "password",
          readOnly: target.readOnly,
          canUndo: document.queryCommandEnabled("undo"),
          canRedo: document.queryCommandEnabled("redo"),
        }),
      });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("contextmenu", inputs);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("wheel", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("contextmenu", inputs);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("wheel", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [closeMenu, openMenu]);

  const renderItems = (items: MenuItem[], submenu = false) =>
    items.map((item, index) =>
      item ? (
        <button
          type="button"
          role="menuitem"
          key={index}
          disabled={item.disabled}
          className={item.danger ? "danger-text" : undefined}
          aria-haspopup={item.children ? "menu" : undefined}
          aria-expanded={item.children ? child?.item === item : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onPointerEnter={(event) => {
            if (!submenu)
              setChild(
                item.children
                  ? { item, anchor: event.currentTarget, focus: false }
                  : null,
              );
          }}
          onClick={(event) => {
            if (item.children) {
              setChild({ item, anchor: event.currentTarget, focus: true });
              return;
            }
            closeMenu();
            try {
              Promise.resolve(item.run?.()).catch((e) =>
                setError((e as Error).message),
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {item.label}
          {(item.shortcut || item.children) && (
            <span aria-hidden="true">
              {item.children ? "›" : item.shortcut}
            </span>
          )}
        </button>
      ) : (
        <hr role="separator" key={index} />
      ),
    );

  return (
    <Context.Provider value={{ openMenu, closeMenu }}>
      {children}
      {menu &&
        createPortal(
          <div
            ref={host}
            className="context-menu"
            role="menu"
            aria-label="Context menu"
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(event) => event.preventDefault()}
            onScroll={() => setChild(null)}
          >
            {renderItems(menu.items)}
          </div>,
          document.body,
        )}
      {menu &&
        child &&
        createPortal(
          <div
            ref={childHost}
            className="context-menu context-submenu"
            role="menu"
            aria-label={child.item.label}
            onContextMenu={(event) => event.preventDefault()}
          >
            {renderItems(child.item.children || [], true)}
          </div>,
          document.body,
        )}
      {error && (
        <div className="toast error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss menu error">
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
