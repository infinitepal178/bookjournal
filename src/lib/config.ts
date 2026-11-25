// .journal/config.json: your own settings. Edit it on GitHub (Settings → Edit
// settings); the app picks up changes the next time it opens.

import { DEFAULT_INTERVALS } from './recall';

export interface JournalConfig {
  version: 1;
  /** Also use the app's built-in weekly questions (src/lib/prompts.ts). */
  builtInPrompts: boolean;
  /** Your own deeper weekly questions, mixed in with the built-in ones. */
  weeklyQuestions: string[];
  /** Days between recalls: 1 day, 1 week, 1 month, 3 months, 6 months. */
  recallIntervals: number[];
  /** Most recall cards shown in a day. */
  recallPerDay: number;
  /** Day of the weekly review: 0 = Sunday … 6 = Saturday. */
  weeklyDay: number;
  /** Default days before asking "Did you start / stop it?". */
  followUpDays: number;
}

export const DEFAULT_CONFIG: JournalConfig = {
  version: 1,
  builtInPrompts: true,
  weeklyQuestions: [],
  recallIntervals: DEFAULT_INTERVALS,
  recallPerDay: 5,
  weeklyDay: 0,
  followUpDays: 7,
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function parseConfig(text: string | null): JournalConfig {
  if (!text) return DEFAULT_CONFIG;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : []);
    const intervals = Array.isArray(j.recallIntervals) ? j.recallIntervals.filter((n): n is number => typeof n === 'number' && n >= 1).map(Math.round) : [];
    const int = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && v >= lo && v <= hi ? Math.round(v) : d);
    const wd = typeof j.weeklyDay === 'string' ? DAY_NAMES.indexOf(j.weeklyDay.toLowerCase()) : int(j.weeklyDay, 0, 0, 6);
    return {
      version: 1,
      builtInPrompts: j.builtInPrompts !== false,
      weeklyQuestions: list(j.weeklyQuestions),
      recallIntervals: intervals.length ? intervals : DEFAULT_INTERVALS,
      recallPerDay: int(j.recallPerDay, 5, 1, 50),
      weeklyDay: wd >= 0 ? wd : 0,
      followUpDays: int(j.followUpDays, 7, 1, 90),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const serializeConfig = (c: JournalConfig) =>
  JSON.stringify({ ...c, weeklyDay: DAY_NAMES[c.weeklyDay] }, null, 2).replace(/\[\s+([\d,\s]+?)\s+\]/g, (_, xs: string) => `[${xs.replace(/\s+/g, ' ')}]`) + '\n';

export const DATA_README = `# My learning journal

This private repo is written by the **Learning journal** app. Every entry is a Markdown file.

\`\`\`
sources/books/<title>.md                   one file per book or course: status, rating, what I took from it, and a log
sources/videos/YYYY/<title>.md             videos, articles, podcasts, conversations: grouped by year
daily/YYYY/MM/YYYY-MM-DD/<source>.md       what I learned that day, and what I'll continue / stop / start
reviews/recall/YYYY/YYYY-MM.md             every recall answer that month
reviews/weekly/YYYY/YYYY-Www.md            weekly learning review
followups.md                               things I said I'd start or stop, and what happened
.journal/config.json                       my settings (safe to edit)
.journal/index.json                        summary used by the app (rebuildable)
.journal/recall.json                       recall schedule used by the app (rebuildable)
.journal/followups.json                    follow-up data used by the app
\`\`\`

Keep this repo **private**.
`;
