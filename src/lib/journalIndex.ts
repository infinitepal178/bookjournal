// .journal/index.json: a summary of every source and learning, so the library,
// search, history, recall and weekly review load from one file. It can always
// be rebuilt from the Markdown files (Settings → Rebuild).

import { addDays, weekRange } from './dates';
import { learningKey, type Learning, type Source, type SourceStatus, type SourceType } from './entries';

export interface SourceSummary {
  type: SourceType;
  title: string;
  author?: string;
  status: SourceStatus;
  rating?: number | null;
  started?: string;
  finished?: string;
  takeaway?: string;
}

export interface EntrySummary {
  date: string;
  source: string;
  id: string;
  learned: string;
  continue?: string;
  stop?: string;
  start?: string;
}

export interface JournalIndex {
  version: 1;
  updated?: string;
  sources: Record<string, SourceSummary>;
  entries: Record<string, EntrySummary>;
}

export const emptyIndex = (): JournalIndex => ({ version: 1, sources: {}, entries: {} });

export function parseIndex(text: string | null): JournalIndex {
  if (!text) return emptyIndex();
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object' && j.sources && j.entries) return { version: 1, updated: j.updated, sources: j.sources, entries: j.entries };
  } catch {
    /* fall through */
  }
  return emptyIndex();
}

const sortKeys = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

export function serializeIndex(index: JournalIndex): string {
  return JSON.stringify({ ...index, sources: sortKeys(index.sources), entries: sortKeys(index.entries) }, null, 1) + '\n';
}

export function summarizeSource(s: Source): SourceSummary {
  const out: SourceSummary = { type: s.type, title: s.title, status: s.status };
  if (s.author) out.author = s.author;
  if (s.rating) out.rating = s.rating;
  if (s.started) out.started = s.started;
  if (s.finished) out.finished = s.finished;
  if (s.takeaway) out.takeaway = s.takeaway;
  return out;
}

export function summarizeLearning(l: Learning): EntrySummary {
  const out: EntrySummary = { date: l.date, source: l.source, id: l.id, learned: l.learned.trim() };
  if (l.continue.trim()) out.continue = l.continue.trim();
  if (l.stop.trim()) out.stop = l.stop.trim();
  if (l.start.trim()) out.start = l.start.trim();
  return out;
}

export const withSource = (index: JournalIndex, s: Source, updated?: string): JournalIndex => ({
  ...index,
  updated: updated ?? index.updated,
  sources: { ...index.sources, [s.id]: summarizeSource(s) },
});

export const withLearning = (index: JournalIndex, l: Learning, updated?: string): JournalIndex => ({
  ...index,
  updated: updated ?? index.updated,
  entries: { ...index.entries, [learningKey(l.date, l.source)]: summarizeLearning(l) },
});

/** Entries newest first (by date, then key). */
export function entriesNewestFirst(index: JournalIndex): (EntrySummary & { key: string })[] {
  return Object.entries(index.entries)
    .map(([key, e]) => ({ ...e, key }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

export const entriesFor = (index: JournalIndex, sourceId: string) => entriesNewestFirst(index).filter((e) => e.source === sourceId);

export function entryById(index: JournalIndex): Map<string, EntrySummary & { key: string }> {
  return new Map(Object.entries(index.entries).map(([key, e]) => [e.id, { ...e, key }]));
}

export const daysWritten = (index: JournalIndex) => new Set(Object.values(index.entries).map((e) => e.date));

export function sourceStats(index: JournalIndex): Map<string, { count: number; last?: string }> {
  const out = new Map<string, { count: number; last?: string }>();
  for (const id of Object.keys(index.sources)) out.set(id, { count: 0 });
  for (const e of Object.values(index.entries)) {
    const s = out.get(e.source) ?? { count: 0 };
    s.count++;
    if (!s.last || e.date > s.last) s.last = e.date;
    out.set(e.source, s);
  }
  return out;
}

/** Sources to offer first: most recently used, then anything you're reading or want to read. */
export function recentSources(index: JournalIndex, n = 6): string[] {
  const stats = sourceStats(index);
  const rank = (id: string) => {
    const s = index.sources[id];
    return s?.status === 'reading' ? 0 : s?.status === 'want' ? 1 : 2;
  };
  return Object.keys(index.sources)
    .filter((id) => index.sources[id].status !== 'abandoned' && (stats.get(id)?.last || index.sources[id].status !== 'finished'))
    .sort((a, b) => (stats.get(b)?.last ?? '').localeCompare(stats.get(a)?.last ?? '') || rank(a) - rank(b) || index.sources[a].title.localeCompare(index.sources[b].title))
    .slice(0, n);
}

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Source type-ahead: every source whose title or author contains what you typed.
 * Title starts and word starts rank first, then recent use.
 */
export function matchSources(index: JournalIndex, query: string, limit = 6): string[] {
  const q = norm(query);
  if (!q) return [];
  const stats = sourceStats(index);
  const scored: { id: string; score: number; last: string }[] = [];
  for (const [id, s] of Object.entries(index.sources)) {
    const title = norm(s.title);
    const author = norm(s.author ?? '');
    let score = -1;
    if (title === q) score = 0;
    else if (title.startsWith(q)) score = 1;
    else if (` ${title}`.includes(` ${q}`)) score = 2;
    else if (title.includes(q)) score = 3;
    else if (author && ` ${author}`.includes(` ${q}`)) score = 4;
    else if (q.split(' ').every((w) => ` ${title} ${author}`.includes(` ${w}`))) score = 5;
    if (score >= 0) scored.push({ id, score, last: stats.get(id)?.last ?? '' });
  }
  return scored
    .sort((a, b) => a.score - b.score || b.last.localeCompare(a.last) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((x) => x.id);
}

/** True when a source with exactly this title (ignoring case and punctuation) exists. */
export const exactSource = (index: JournalIndex, title: string) => Object.keys(index.sources).find((id) => norm(index.sources[id].title) === norm(title));

// ---------- streaks ----------

export function streaks(written: Set<string>, today: string): { current: number; best: number } {
  let start = written.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (written.has(start)) {
    current++;
    start = addDays(start, -1);
  }
  const sorted = [...written].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current) };
}

// ---------- search ----------

export interface SearchHit {
  key: string;
  date: string;
  source: string;
  field: 'learned' | 'continue' | 'stop' | 'start' | 'source';
  text: string;
}

/** Search learnings, continue / stop / start lines, and source titles and authors. Newest first. */
export function searchIndex(index: JournalIndex, query: string): SearchHit[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  const has = (s: string | undefined) => {
    if (!s) return false;
    const n = ` ${norm(s)}`;
    return words.every((w) => n.includes(` ${w}`) || n.includes(w));
  };
  const out: SearchHit[] = [];
  for (const e of entriesNewestFirst(index)) {
    const src = index.sources[e.source];
    const fields: [SearchHit['field'], string | undefined][] = [
      ['learned', e.learned],
      ['start', e.start],
      ['stop', e.stop],
      ['continue', e.continue],
    ];
    const hit = fields.find(([, t]) => has(t));
    if (hit) out.push({ key: e.key, date: e.date, source: e.source, field: hit[0], text: hit[1]! });
    else if (src && has(`${src.title} ${src.author ?? ''}`)) out.push({ key: e.key, date: e.date, source: e.source, field: 'source', text: e.learned });
  }
  return out;
}

// ---------- weekly ----------

export interface WeekData {
  days: string[];
  entries: (EntrySummary & { key: string })[];
  daysWritten: number;
  sources: string[];
}

export function weekData(index: JournalIndex, weekId: string): WeekData {
  const { days, start, end } = weekRange(weekId);
  const entries = entriesNewestFirst(index)
    .filter((e) => e.date >= start && e.date <= end)
    .reverse();
  return {
    days,
    entries,
    daysWritten: new Set(entries.map((e) => e.date)).size,
    sources: [...new Set(entries.map((e) => e.source))],
  };
}
