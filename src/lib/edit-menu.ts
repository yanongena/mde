import type { MenuItem } from "../components/ContextMenu";

export const modKey = /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl";
export const revealLabel = /Mac/i.test(navigator.platform)
  ? "Reveal in Finder"
  : "Reveal in File Explorer";
export function editMenuItems(options: {
  selected: boolean;
  readOnly?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo?(): unknown;
  redo?(): unknown;
  selectAll?(): unknown;
}): MenuItem[] {
  const edit = (command: Parameters<typeof window.margin.edit>[0]) => () =>
    window.margin.edit(command);
  return [
    {
      label: "Undo",
      shortcut: `${modKey}+Z`,
      disabled: options.readOnly || !options.canUndo,
      run: options.undo || edit("undo"),
    },
    {
      label: "Redo",
      shortcut: `${modKey}+Shift+Z`,
      disabled: options.readOnly || !options.canRedo,
      run: options.redo || edit("redo"),
    },
    null,
    {
      label: "Cut",
      shortcut: `${modKey}+X`,
      disabled: options.readOnly || !options.selected,
      run: edit("cut"),
    },
    {
      label: "Copy",
      shortcut: `${modKey}+C`,
      disabled: !options.selected,
      run: edit("copy"),
    },
    {
      label: "Paste",
      shortcut: `${modKey}+V`,
      disabled: options.readOnly,
      run: edit("paste"),
    },
    {
      label: "Paste without formatting",
      shortcut: `${modKey}+Shift+V`,
      disabled: options.readOnly,
      run: edit("pasteAndMatchStyle"),
    },
    null,
    {
      label: "Select all",
      shortcut: `${modKey}+A`,
      run: options.selectAll || edit("selectAll"),
    },
  ];
}
