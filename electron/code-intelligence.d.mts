import type { PhpFunction } from "./code-symbols.mjs";
export interface CodeProject {
  functions: PhpFunction[];
  classes: { name: string; fullName: string; path: string; from: number }[];
  cssClasses: { name: string; path: string }[];
  ids: string[];
  paths: string[];
  related: string[];
  truncated: boolean;
}
