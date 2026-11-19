// File formats for the data repo. Every file is readable Markdown with YAML
// frontmatter on top: the frontmatter holds structured data, the body holds
// your writing. Parsing is lenient so hand edits on GitHub don't break things.

import YAML from 'yaml';
import { formatRange, formatShort, isoWeek } from './dates';

// ---------- types ----------

export type SourceType = 'book' | 'video' | 'article' | 'podcast' | 'course' | 'conversation' | 'other';
export type SourceStatus = 'reading' | 'want' | 'finished' | 'abandoned';

export const SOURCE_TYPES: { id: SourceType; label: string; folder: string; byYear: boolean }[] = [
  { id: 'book', label: 'Book', folder: 'books', byYear: false },
  { id: 'video', label: 'Video', folder: 'videos', byYear: true },
  { id: 'article', label: 'Article', folder: 'articles', byYear: true },
  { id: 'podcast', label: 'Podcast', folder: 'podcasts', byYear: true },
  { id: 'course', label: 'Course', folder: 'courses', byYear: false },
  { id: 'conversation', label: 'Conversation', folder: 'conversations', byYear: true },
  { id: 'other', label: 'Other', folder: 'other', byYear: true },
];

export const STATUS_LABEL: Record<SourceStatus, string> = {
  reading: 'Reading',
  want: 'Want to read',
  finished: 'Finished',
  abandoned: 'Abandoned',
};

export const typeInfo = (t: SourceType) => SOURCE_TYPES.find((x) => x.id === t) ?? SOURCE_TYPES[SOURCE_TYPES.length - 1];
export const isSourceType = (v: unknown): v is SourceType => SOURCE_TYPES.some((t) => t.id === v);
const isStatus = (v: unknown): v is SourceStatus => typeof v === 'string' && v in STATUS_LABEL;

export interface Source {
  /** Path without "sources/" and ".md", e.g. "books/the-patient-mind". Fixed once created. */
  id: string;
  type: SourceType;
  title: string;
  author?: string;
  status: SourceStatus;
  rating?: number | null;
  started?: string;
  finished?: string;
  /** "What I took from this" (finished) or why you stopped (abandoned). */
  takeaway?: string;
  created?: string;
  updated?: string;
  /** Any other "## Section" you added by hand on GitHub; kept as is. */
  extra?: string;
}

/** One day's learning from one source. */
export interface Learning {
  date: string;
  source: string;
  /** Short stable ID used by recall and the weekly review. */
  id: string;
  learned: string;
  continue: string;
  stop: string;
  start: string;
  followups?: string[];
  created?: string;
  updated?: string;
}

export interface Weekly {
  week: string;
  start: string;
  end: string;
  stats: WeekStats;
  /** IDs of the week's top learnings, in order. */
  top: string[];
  applied: string;
  next: string;
  question: string;
  answer: string;
  startNext: string;
  created?: string;
  updated?: string;
}

export interface WeekStats {
  days: number;
  sources: number;
  learnings: number;
  recalled: number;
  remembered: number;
  done: number;
}

// ---------- paths ----------

export const CONFIG_PATH = '.journal/config.json';
export const INDEX_PATH = '.journal/index.json';
export const RECALL_PATH = '.journal/recall.json';

export const dayDir = (date: string) => `daily/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}`;
export const slugOf = (sourceId: string) => sourceId.slice(sourceId.lastIndexOf('/') + 1);
export const learningPath = (date: string, sourceId: string) => `${dayDir(date)}/${slugOf(sourceId)}.md`;
export const sourcePath = (id: string) => `sources/${id}.md`;
export const weeklyPath = (week: string) => `reviews/weekly/${week.slice(0, 4)}/${week}.md`;
export const recallLogPath = (month: string) => `reviews/recall/${month.slice(0, 4)}/${month}.md`;

/** Key for a learning in the index: "2026-11-18/the-patient-mind". */
export const learningKey = (date: string, sourceId: string) => `${date}/${slugOf(sourceId)}`;

export function sourceIdFor(type: SourceType, slug: string, year: string): string {
  const t = typeInfo(type);
  return t.byYear ? `${t.folder}/${year}/${slug}` : `${t.folder}/${slug}`;
}

const LEARNING_RE = /^daily\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})\/([a-z0-9-]+)\.md$/;
const SOURCE_RE = /^sources\/((?:[a-z]+\/)(?:\d{4}\/)?[a-z0-9-]+)\.md$/;
const WEEKLY_RE = /^reviews\/weekly\/\d{4}\/(\d{4}-W\d{2})\.md$/;
const RECALL_RE = /^reviews\/recall\/\d{4}\/(\d{4}-\d{2})\.md$/;

export type PathKind =
  | { kind: 'learning'; date: string; slug: string }
  | { kind: 'source'; id: string }
  | { kind: 'weekly'; week: string }
  | { kind: 'recall'; month: string };

export function classifyPath(path: string): PathKind | null {
  let m;
  if ((m = LEARNING_RE.exec(path))) return { kind: 'learning', date: m[1], slug: m[2] };
  if ((m = SOURCE_RE.exec(path))) return { kind: 'source', id: m[1] };
  if ((m = WEEKLY_RE.exec(path))) return { kind: 'weekly', week: m[1] };
  if ((m = RECALL_RE.exec(path))) return { kind: 'recall', month: m[1] };
  return null;
}

/** Relative link from one repo file to another, so links work on GitHub. */
export function relativeLink(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

// ---------- slugs and IDs ----------

export function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/g, '') || 'untitled'
  );
}

/** A slug not used by any existing source (slugs are unique across all types). */
export function uniqueSlug(title: string, taken: Iterable<string>, author?: string): string {
  const used = new Set([...taken].map(slugOf));
  const base = slugify(title);
  if (!used.has(base)) return base;
  if (author) {
    const withAuthor = slugify(`${title} ${author.split(/\s+/).pop()}`);
    if (!used.has(withAuthor)) return withAuthor;
  }
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function newId(taken: Set<string> = new Set(), random: () => number = Math.random): string {
  for (;;) {
    const id = Math.floor(random() * 36 ** 4)
      .toString(36)
      .padStart(4, '0');
    if (!taken.has(id)) return id;
  }
}

// ---------- frontmatter ----------

export function splitFrontmatter(md: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!m) return { data: {}, body: md };
  let data: unknown;
  try {
    data = YAML.parse(m[1]);
  } catch {
    data = {};
  }
  return { data: data && typeof data === 'object' ? (data as Record<string, unknown>) : {}, body: m[2] };
}

function frontmatter(data: Record<string, unknown>): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
  const doc = new YAML.Document(clean);
  YAML.visit(doc, {
    Seq(_, node) {
      node.flow = true;
    },
    Map(key, node) {
      if (key !== null) node.flow = true; // nested maps inline: stats: { days: 5, … }
    },
  });
  return `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: true }).trimEnd()}\n---\n`;
}

/** "## Heading" sections in order, with their text. */
function sections(body: string): { heading: string; text: string }[] {
  const parts = body.split(/^## +(.+?)\s*$/m);
  const out: { heading: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) out.push({ heading: parts[i].trim(), text: (parts[i + 1] ?? '').trim() });
  return out;
}

const find = (s: { heading: string; text: string }[], ...names: string[]) =>
  s.find((x) => names.includes(x.heading.toLowerCase()))?.text ?? '';

const str = (v: unknown): string | undefined => (v == null || v === '' ? undefined : String(v));
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const numOr = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

// ---------- sources ----------

export interface SourceLogLine {
  date: string;
  path: string;
  learned: string;
}

export function serializeSource(s: Source, log: SourceLogLine[] = []): string {
  const fm = frontmatter({
    type: s.type,
    title: s.title,
    author: s.author,
    status: s.status,
    rating: s.rating ?? undefined,
    started: s.started,
    finished: s.finished,
    created: s.created,
    updated: s.updated,
  });
  const by = [s.author, typeInfo(s.type).label.toLowerCase(), STATUS_LABEL[s.status].toLowerCase()].filter(Boolean).join(' · ');
  const parts = [`# ${oneLine(s.title)}\n${by}${s.rating ? ` · ${'★'.repeat(s.rating)}${'☆'.repeat(5 - s.rating)}` : ''}`];
  if (s.takeaway?.trim()) parts.push(`## ${s.status === 'abandoned' ? 'Why I stopped' : 'What I took from this'}\n${s.takeaway.trim()}`);
  if (s.extra?.trim()) parts.push(s.extra.trim());
  if (log.length) {
    const from = sourcePath(s.id);
    const lines = [...log]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((l) => `- [${formatShort(l.date)}](${relativeLink(from, l.path)}) · ${truncate(oneLine(l.learned), 90)}`);
    parts.push(`## Log\n${lines.join('\n')}`);
  }
  return `${fm}${parts.join('\n\n')}\n`;
}

export function parseSource(md: string, id: string): Source {
  const { data, body } = splitFrontmatter(md);
  const s = sections(body);
  const title = str(data.title) ?? /^# +(.+)$/m.exec(body)?.[1]?.trim() ?? slugOf(id);
  const known = ['what i took from this', 'why i stopped', 'log'];
  const extra = s
    .filter((x) => !known.includes(x.heading.toLowerCase()))
    .map((x) => `## ${x.heading}\n${x.text}`)
    .join('\n\n');
  const folderType = SOURCE_TYPES.find((t) => id.startsWith(`${t.folder}/`))?.id ?? 'other';
  const rating = typeof data.rating === 'number' && data.rating >= 1 && data.rating <= 5 ? data.rating : null;
  return {
    id,
    type: isSourceType(data.type) ? data.type : folderType,
    title,
    author: str(data.author),
    status: isStatus(data.status) ? data.status : 'reading',
    rating,
    started: str(data.started),
    finished: str(data.finished),
    takeaway: find(s, 'what i took from this', 'why i stopped') || undefined,
    created: str(data.created),
    updated: str(data.updated),
    extra: extra || undefined,
  };
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// ---------- learnings ----------

export const LEARNING_SECTIONS: { key: 'learned' | 'continue' | 'stop' | 'start'; heading: string; question: string }[] = [
  { key: 'learned', heading: 'What I learned', question: 'What did you learn today?' },
  { key: 'continue', heading: 'Continue', question: 'What will you continue doing?' },
  { key: 'stop', heading: 'Stop', question: 'What will you stop doing?' },
  { key: 'start', heading: 'Start', question: 'What will you start doing?' },
];

export function serializeLearning(l: Learning, sourceTitle: string): string {
  const fm = frontmatter({
    type: 'learning',
    date: l.date,
    source: l.source,
    id: l.id,
    followups: l.followups,
    created: l.created,
    updated: l.updated,
  });
  const body = LEARNING_SECTIONS.filter((s) => l[s.key].trim())
    .map((s) => `## ${s.heading}\n${l[s.key].trim()}`)
    .join('\n\n');
  const link = `[${oneLine(sourceTitle)}](${relativeLink(learningPath(l.date, l.source), sourcePath(l.source))})`;
  return `${fm}# ${oneLine(sourceTitle)} · ${formatShort(l.date)}\nFrom ${link}\n${body ? `\n${body}\n` : ''}`;
}

export function parseLearning(md: string, date: string, fallbackSource = ''): Learning {
  const { data, body } = splitFrontmatter(md);
  const s = sections(body);
  return {
    date: str(data.date) ?? date,
    source: str(data.source) ?? fallbackSource,
    id: str(data.id) ?? '',
    learned: find(s, 'what i learned', 'what i learnt', 'learned'),
    continue: find(s, 'continue', 'continue doing', 'keep doing'),
    stop: find(s, 'stop', 'stop doing'),
    start: find(s, 'start', 'start doing'),
    followups: strList(data.followups),
    created: str(data.created),
    updated: str(data.updated),
  };
}

export const emptyLearning = (date: string, source: string, id: string): Learning => ({ date, source, id, learned: '', continue: '', stop: '', start: '' });

// ---------- weekly review ----------

export const WEEKLY_HEADINGS = { top: 'Top learnings', applied: 'What I applied', next: 'What to read next', startNext: 'Next week I will start' };

export function serializeWeekly(w: Weekly, topText: { id: string; text: string; source: string }[] = []): string {
  const fm = frontmatter({
    type: 'weekly',
    week: w.week,
    start: w.start,
    end: w.end,
    stats: { ...w.stats },
    top: w.top,
    question: w.question || undefined,
    created: w.created,
    updated: w.updated,
  });
  const parts: string[] = [];
  if (topText.length) parts.push(`## ${WEEKLY_HEADINGS.top}\n${topText.map((t, i) => `${i + 1}. ${oneLine(t.text)} (${t.source})`).join('\n')}`);
  if (w.applied.trim()) parts.push(`## ${WEEKLY_HEADINGS.applied}\n${w.applied.trim()}`);
  if (w.next.trim()) parts.push(`## ${WEEKLY_HEADINGS.next}\n${w.next.trim()}`);
  if (w.question && w.answer.trim()) parts.push(`## ${oneLine(w.question)}\n${w.answer.trim()}`);
  if (w.startNext.trim()) parts.push(`## ${WEEKLY_HEADINGS.startNext}\n${w.startNext.trim()}`);
  const { week } = isoWeek(w.start);
  const head = `# Weekly learning review · Week ${week} (${formatRange(w.start, w.end)} ${w.end.slice(0, 4)})`;
  const st = w.stats;
  const line = `${st.days} days · ${st.learnings} learnings from ${st.sources} sources · recalled ${st.remembered}/${st.recalled} · ${st.done} follow-ups done`;
  return `${fm}${head}\n${line}\n${parts.length ? `\n${parts.join('\n\n')}\n` : ''}`;
}

export function parseWeekly(md: string, week: string): Weekly {
  const { data, body } = splitFrontmatter(md);
  const s = sections(body);
  const st = (data.stats ?? {}) as Record<string, unknown>;
  const question = str(data.question) ?? '';
  return {
    week: str(data.week) ?? week,
    start: str(data.start) ?? '',
    end: str(data.end) ?? '',
    stats: {
      days: numOr(st.days),
      sources: numOr(st.sources),
      learnings: numOr(st.learnings),
      recalled: numOr(st.recalled),
      remembered: numOr(st.remembered),
      done: numOr(st.done),
    },
    top: strList(data.top),
    applied: find(s, WEEKLY_HEADINGS.applied.toLowerCase()),
    next: find(s, WEEKLY_HEADINGS.next.toLowerCase()),
    question,
    answer: question ? find(s, oneLine(question).toLowerCase()) : '',
    startNext: find(s, WEEKLY_HEADINGS.startNext.toLowerCase()),
    created: str(data.created),
    updated: str(data.updated),
  };
}
