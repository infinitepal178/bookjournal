// Spaced recall. Each learning comes back after a growing gap:
// 1 day → 1 week → 1 month → 3 months → 6 months, then it's retired as learned.
// "Fuzzy" repeats the same gap, "Forgot" starts again at the first one.
// The schedule lives in .journal/recall.json; every answer is also written to a
// readable monthly log (reviews/recall/YYYY/YYYY-MM.md), from which the
// schedule can be rebuilt.

import { addDays, daysBetween, formatShort } from './dates';
import { oneLine, relativeLink, splitFrontmatter } from './entries';

export type RecallResult = 'remembered' | 'fuzzy' | 'forgot';

export interface RecallItem {
  /** Index into the intervals list: the gap that leads to `due`. */
  step: number;
  due: string;
  last?: string;
  history: { d: string; r: RecallResult }[];
  /** Day it left the queue, and why. */
  retired?: string;
  reason?: 'learned' | 'retired';
}

export interface RecallFile {
  version: 1;
  items: Record<string, RecallItem>;
}

export const DEFAULT_INTERVALS = [1, 7, 30, 90, 180];
export const RESULT_LABEL: Record<RecallResult | 'retired', string> = {
  remembered: 'Remembered',
  fuzzy: 'Fuzzy',
  forgot: 'Forgot',
  retired: 'Retired',
};

export const emptyRecall = (): RecallFile => ({ version: 1, items: {} });

export function parseRecall(text: string | null): RecallFile {
  if (!text) return emptyRecall();
  try {
    const j = JSON.parse(text);
    if (!j || typeof j.items !== 'object' || !j.items) return emptyRecall();
    const items: Record<string, RecallItem> = {};
    for (const [id, v] of Object.entries(j.items as Record<string, Partial<RecallItem>>)) {
      if (!v || typeof v.due !== 'string') continue;
      items[id] = {
        step: typeof v.step === 'number' ? v.step : 0,
        due: v.due,
        last: v.last,
        history: Array.isArray(v.history) ? v.history.filter((h) => h && typeof h.d === 'string') : [],
        retired: v.retired,
        reason: v.reason,
      };
    }
    return { version: 1, items };
  } catch {
    return emptyRecall();
  }
}

export function serializeRecall(f: RecallFile): string {
  const items = Object.fromEntries(Object.entries(f.items).sort(([, a], [, b]) => a.due.localeCompare(b.due)));
  return JSON.stringify({ version: 1, items }, null, 1) + '\n';
}

const gap = (intervals: number[], step: number) => intervals[Math.min(Math.max(step, 0), intervals.length - 1)] ?? 1;

/** Schedule a newly logged learning. */
export const scheduleNew = (date: string, intervals = DEFAULT_INTERVALS): RecallItem => ({ step: 0, due: addDays(date, gap(intervals, 0)), history: [] });

/** Apply one answer. The next date counts from the day you answered, so late reviews never pile up. */
export function applyResult(item: RecallItem, result: RecallResult, today: string, intervals = DEFAULT_INTERVALS): RecallItem {
  const history = [...item.history, { d: today, r: result }];
  if (result === 'remembered') {
    const step = item.step + 1;
    if (step >= intervals.length) return { ...item, step, history, last: today, retired: today, reason: 'learned' };
    return { ...item, step, history, last: today, due: addDays(today, gap(intervals, step)) };
  }
  const step = result === 'forgot' ? 0 : item.step;
  return { ...item, step, history, last: today, due: addDays(today, gap(intervals, step)) };
}

export const retireItem = (item: RecallItem, today: string): RecallItem => ({ ...item, last: today, retired: today, reason: 'retired' });

/** Gap that `result` would lead to, as words: "1 week", or "retired" after the last step. */
export function nextGapLabel(item: RecallItem, result: RecallResult, intervals = DEFAULT_INTERVALS): string {
  const step = result === 'remembered' ? item.step + 1 : result === 'forgot' ? 0 : item.step;
  if (step >= intervals.length) return 'learned for good';
  return `in ${gapLabel(gap(intervals, step))}`;
}

export function gapLabel(days: number): string {
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days >= 28 && days % 30 === 0) return days === 30 ? '1 month' : `${days / 30} months`;
  if (days % 7 === 0) return days === 7 ? '1 week' : `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

/** "1-day review", "1-month review": which gap this review closes. */
export const reviewLabel = (item: RecallItem, intervals = DEFAULT_INTERVALS) => `${gapLabel(gap(intervals, item.step))} review`;

/** Today's queue: open items that are due, oldest first, at most `perDay`. */
export function recallQueue(f: RecallFile, today: string, perDay: number, known?: Set<string>): { due: string[]; waiting: number } {
  const all = Object.entries(f.items)
    .filter(([id, i]) => !i.retired && i.due <= today && (!known || known.has(id)))
    .sort(([a, x], [b, y]) => x.due.localeCompare(y.due) || a.localeCompare(b))
    .map(([id]) => id);
  return { due: all.slice(0, perDay), waiting: Math.max(0, all.length - perDay) };
}

// ---------- the readable monthly log ----------

export interface RecallAnswer {
  id: string;
  result: RecallResult | 'retired';
  note?: string;
  /** For the readable line: source title, day it was logged, the learning, its file. */
  title: string;
  date: string;
  learned: string;
  path: string;
  next?: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function answerLines(a: RecallAnswer, logPath: string): string {
  const text = oneLine(a.learned);
  const short = text.length > 110 ? `${text.slice(0, 109).trimEnd()}…` : text;
  let line = `- **${RESULT_LABEL[a.result]}** · [${oneLine(a.title)}, ${formatShort(a.date)}](${relativeLink(logPath, a.path)}): ${short} <!-- recall:${a.id} -->`;
  if (a.next) line += ` · ${a.next}`;
  if (a.note?.trim()) line += `\n  Now: ${oneLine(a.note)}`;
  return line;
}

/** Add a session's answers to the month's log (newest day first). */
export function addToRecallLog(existing: string | null, logPath: string, today: string, answers: RecallAnswer[]): string {
  const month = today.slice(0, 7);
  const head = `---\ntype: recall-log\nmonth: ${month}\n---\n# Recall · ${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}\n`;
  const body = existing ? splitFrontmatter(existing).body.replace(/^# .*\n?/, '') : '';
  const lines = answers.map((a) => answerLines(a, logPath)).join('\n');
  const marker = `<!-- date:${today} -->`;
  const days = body.split(/(?=^## )/m).map((s) => s.trim()).filter(Boolean);
  const i = days.findIndex((d) => d.split('\n')[0].includes(marker));
  if (i >= 0) days[i] = `${days[i]}\n${lines}`;
  else days.unshift(`## ${formatShort(today)} ${marker}\n${lines}`);
  return `${head}\n${days.join('\n\n')}\n`;
}

/** Every answer in a log, in the order given (for rebuilding the schedule). */
export function parseRecallLog(md: string): { date: string; id: string; result: RecallResult | 'retired' }[] {
  const out: { date: string; id: string; result: RecallResult | 'retired' }[] = [];
  let date = '';
  for (const line of md.split('\n')) {
    const d = /^## .*<!-- date:(\d{4}-\d{2}-\d{2}) -->/.exec(line);
    if (d) {
      date = d[1];
      continue;
    }
    const m = /^- \*\*(Remembered|Fuzzy|Forgot|Retired)\*\*.*<!-- recall:([a-z0-9]+) -->/.exec(line);
    if (m && date) out.push({ date, id: m[2], result: m[1].toLowerCase() as RecallResult | 'retired' });
  }
  return out;
}

/** Rebuild recall.json by replaying every logged answer on top of each learning's first schedule. */
export function rebuildRecall(learnings: { id: string; date: string }[], events: { date: string; id: string; result: RecallResult | 'retired' }[], intervals = DEFAULT_INTERVALS): RecallFile {
  const items: Record<string, RecallItem> = {};
  for (const l of learnings) if (l.id) items[l.id] = scheduleNew(l.date, intervals);
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    const item = items[e.id];
    if (!item || item.retired) continue;
    items[e.id] = e.result === 'retired' ? retireItem(item, e.date) : applyResult(item, e.result, e.date, intervals);
  }
  return { version: 1, items };
}

/** How many answers fell in [start, end], and how many were "remembered". */
export function recallStats(f: RecallFile, start: string, end: string): { recalled: number; remembered: number } {
  let recalled = 0;
  let remembered = 0;
  for (const i of Object.values(f.items))
    for (const h of i.history)
      if (h.d >= start && h.d <= end) {
        recalled++;
        if (h.r === 'remembered') remembered++;
      }
  return { recalled, remembered };
}

/** "from 18 Nov · 1 day ago" helper used on the recall cards. */
export const agoLabel = (date: string, today: string) => {
  const n = daysBetween(date, today);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`;
};
