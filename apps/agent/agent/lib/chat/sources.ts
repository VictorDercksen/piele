export interface ChatSource {
  readonly url: string;
  readonly title: string;
  readonly publisher?: string;
}

export interface CitedSource extends ChatSource {
  readonly n: number;
}

/**
 * Reads the numbered `<sources>` block the API puts at the end of the context, one line per
 * source: `[n] <title> | <publisher> | <url>`, publisher possibly empty. The last block wins,
 * because document text above it could quote one. Lines without an http(s) URL are skipped, as
 * the app turns every entry into a link.
 */
export function parseSources(context: string): Map<number, ChatSource> {
  const sources = new Map<number, ChatSource>();
  const start = context.lastIndexOf('<sources>');
  if (start < 0) return sources;
  const end = context.indexOf('</sources>', start);
  const block = context.slice(start + '<sources>'.length, end < 0 ? undefined : end);
  for (const line of block.split('\n')) {
    const match = /^\s*\[(\d{1,4})\]\s*(.*)$/.exec(line);
    if (!match) continue;
    // Split from the right so a title containing "|" stays whole.
    const parts = match[2].split('|');
    if (parts.length < 3) continue;
    const url = parts.pop()!.trim();
    const publisher = parts.pop()!.trim();
    const title = parts.join('|').trim();
    if (!/^https?:\/\/\S+$/i.test(url) || !title) continue;
    sources.set(Number(match[1]), { url, title, ...(publisher ? { publisher } : {}) });
  }
  return sources;
}

/** The sources an answer cites with `[n]` markers, each once, in order of first citation. */
export function citedSources(text: string, sources: Map<number, ChatSource>): CitedSource[] {
  const cited = new Map<number, CitedSource>();
  for (const [, digits] of text.matchAll(/\[(\d{1,4})\]/g)) {
    const n = Number(digits);
    const source = sources.get(n);
    if (source && !cited.has(n)) cited.set(n, { n, ...source });
  }
  return [...cited.values()];
}
