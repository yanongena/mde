export interface PhpFunction {
  name: string;
  fullName: string;
  namespace: string;
  owner: string;
  parameters: { label: string; name: string }[];
  signature: string;
  info: string;
  path: string;
  from: number;
  to: number;
}
export interface PhpSymbols {
  functions: PhpFunction[];
  variables: {
    name: string;
    from: number;
    scopeFrom: number;
    scopeTo: number;
    local: boolean;
  }[];
  classes: { name: string; fullName: string; path: string; from: number }[];
  imports: { name: string; target: string; namespace: string }[];
  includes: string[];
  namespaces: { name: string; from: number; to: number }[];
  html: string;
}
export function isPhp(name: string): boolean;
export function isWebCode(name: string): boolean;
export function workspaceTarget(from: string, href: string): string | null;
export function phpSymbols(text: string, path?: string): PhpSymbols;
export function cssSymbols(text: string): {
  classes: string[];
  ids: string[];
  imports: string[];
};
export function htmlSymbols(text: string): {
  stylesheets: string[];
  ids: string[];
  classes: string[];
  inlineStyles: string[];
};
export function phpCallAt(
  text: string,
  pos: number,
): { name: string; active: number; from: number; to: number } | null;
