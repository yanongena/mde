import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// App controls share one short delay, independent of native title tooltips.
export function Tooltip() {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const text = target?.dataset.tooltip || target?.getAttribute("aria-label");

  useEffect(() => {
    let anchor: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      clearTimeout(timer);
      anchor = null;
      setTarget(null);
    };
    const show = (event: Event) => {
      if (event instanceof PointerEvent && event.pointerType === "touch")
        return;
      if (popup.current?.contains(event.target as Node)) return;
      const next = (event.target as Element).closest<HTMLElement>(
        "[data-tooltip], button[aria-label]",
      );
      if (next === anchor) return;
      hide();
      if (!next || next.closest("[inert]")) return;
      anchor = next;
      timer = setTimeout(
        () => {
          if (next.isConnected) setTarget(next);
        },
        event.type === "focusin" ? 0 : 200,
      );
    };
    const leave = (event: Event) => {
      const related = (event as PointerEvent | FocusEvent)
        .relatedTarget as Node | null;
      if (
        related &&
        (anchor?.contains(related) || popup.current?.contains(related))
      )
        return;
      hide();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", leave);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", keydown);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", show);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusin", show);
      document.removeEventListener("focusout", leave);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!target || !popup.current) return;
    const bounds = target.getBoundingClientRect();
    const tooltip = popup.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        8,
        Math.min(
          bounds.left + (bounds.width - tooltip.width) / 2,
          window.innerWidth - tooltip.width - 8,
        ),
      ),
      top:
        bounds.bottom + tooltip.height + 16 <= window.innerHeight
          ? bounds.bottom + 8
          : Math.max(8, bounds.top - tooltip.height - 8),
    });
    const previous = target.getAttribute("aria-describedby");
    target.setAttribute(
      "aria-describedby",
      [previous, id].filter(Boolean).join(" "),
    );
    return () => {
      if (previous === null) target.removeAttribute("aria-describedby");
      else target.setAttribute("aria-describedby", previous);
    };
  }, [target, text, id]);

  return target && text
    ? createPortal(
        <div
          ref={popup}
          id={id}
          role="tooltip"
          className="app-tooltip"
          style={position}
        >
          {text}
        </div>,
        document.body,
      )
    : null;
}
