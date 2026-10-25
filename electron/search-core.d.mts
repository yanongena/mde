export interface MatchOptions { query: string; caseSensitive?: boolean; wholeWord?: boolean; }
export function textMatches(text: string, options: MatchOptions, limit?: number): { from: number; to: number }[];
