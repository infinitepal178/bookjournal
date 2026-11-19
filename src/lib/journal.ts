// The journal: reads and writes the data repo. Every save is one commit.
// Shared files (index, recall schedule, follow-ups, a source's log) are
// re-read at the current head inside the commit, so saves from two devices
// merge instead of overwriting each other.

import { DATA_README, DEFAULT_CONFIG, parseConfig, serializeConfig, type JournalConfig } from './config';
import { addDays, localTimestamp } from './dates';
import {
  CONFIG_PATH,
  INDEX_PATH,
  RECALL_PATH,
  classifyPath,
  learningPath,
  parseLearning,
  parseSource,
  parseWeekly,
  recallLogPath,
  serializeLearning,
  serializeSource,
  serializeWeekly,
  sourcePath,
  weeklyPath,
  type Learning,
  type Source,
  type Weekly,
} from './entries';
import {
  FOLLOWUPS_MD_PATH,
  FOLLOWUPS_PATH,
  emptyFollowUps,
  mergeFollowUps,
  parseFollowUps,
  renderFollowUpsMd,
  serializeFollowUps,
  type FollowUp,
  type FollowUpFile,
} from './followups';
import { GitHub, type FileChange, type RepoInfo } from './github';
import { emptyIndex, entriesFor, parseIndex, serializeIndex, withLearning, withSource, type JournalIndex } from './journalIndex';
import {
  addToRecallLog,
  applyResult,
  emptyRecall,
  parseRecall,
  parseRecallLog,
  rebuildRecall,
  retireItem,
  scheduleNew,
  serializeRecall,
  type RecallAnswer,
  type RecallFile,
} from './recall';

/** Raised when a file changed on GitHub (or another device) after it was loaded here. */
export class ConflictError extends Error {
  constructor(
    public paths: string[],
    public theirs: string | null = null,
  ) {
    super('This entry was changed somewhere else after you opened it.');
  }
}

export interface Overview {
  files: Set<string>;
  weeklies: Set<string>;
  index: JournalIndex;
  config: JournalConfig;
  followUps: FollowUpFile;
  recall: RecallFile;
}

export interface LoadedLearning {
  date: string;
  source: string;
  learning: Learning | null;
  raw: string | null;
}

export interface WeeklyData {
  weekly: Weekly | null;
  raw: string | null;
}

/** Everything a save changes, so the screens can update without reloading. */
export interface SaveResult {
  index: JournalIndex;
  recall: RecallFile;
  followUps: FollowUpFile | null;
  paths: string[];
}

export function overviewFrom(files: Iterable<string>, index: JournalIndex, config: JournalConfig, followUps: FollowUpFile, recall: RecallFile): Overview {
  const set = new Set(files);
  const weeklies = new Set<string>();
  for (const p of set) {
    const c = classifyPath(p);
    if (c?.kind === 'weekly') weeklies.add(c.week);
  }
  return { files: set, weeklies, index, config, followUps, recall };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const followUpFiles = (f: FollowUpFile): FileChange[] => [
  { path: FOLLOWUPS_PATH, content: serializeFollowUps(f) },
  { path: FOLLOWUPS_MD_PATH, content: renderFollowUpsMd(f) },
];

export class Journal {
  constructor(
    public gh: GitHub,
    public branch: string,
    public repoUrl: string,
  ) {}

  fileUrl = (path: string) => `${this.repoUrl}/blob/${this.branch}/${path}`;
  editUrl = (path: string) => `${this.repoUrl}/edit/${this.branch}/${path}`;

  private read = (path: string, ref = this.branch) => this.gh.readFile(path, ref);

  /** First-run setup: create README, config, index and recall files if they're missing. */
  async bootstrap(info: RepoInfo): Promise<void> {
    if (info.empty) await this.gh.createFirstFile('README.md', DATA_README, 'Set up learning journal');
    const files = await this.gh.listFiles(this.branch);
    const has = new Set(files);
    const needed = ['README.md', CONFIG_PATH, INDEX_PATH, RECALL_PATH];
    if (needed.every((p) => has.has(p))) return;
    const hasEntries = files.some((p) => classifyPath(p));
    const rebuilt = hasEntries ? await this.buildAll(files, parseConfig(await (has.has(CONFIG_PATH) ? this.read(CONFIG_PATH) : null))) : null;
    await this.gh.commit(this.branch, 'Set up learning journal', async () => {
      const out: FileChange[] = [];
      if (!has.has('README.md')) out.push({ path: 'README.md', content: DATA_README });
      if (!has.has(CONFIG_PATH)) out.push({ path: CONFIG_PATH, content: serializeConfig(DEFAULT_CONFIG) });
      if (!has.has(INDEX_PATH)) out.push({ path: INDEX_PATH, content: serializeIndex(rebuilt?.index ?? emptyIndex()) });
      if (!has.has(RECALL_PATH)) out.push({ path: RECALL_PATH, content: serializeRecall(rebuilt?.recall ?? emptyRecall()) });
      return out;
    });
  }

  async overview(): Promise<Overview> {
    const files = await this.gh.listFiles(this.branch);
    const has = new Set(files);
    const get = (p: string) => (has.has(p) ? this.read(p) : Promise.resolve(null));
    const [i, c, f, r] = await Promise.all([get(INDEX_PATH), get(CONFIG_PATH), get(FOLLOWUPS_PATH), get(RECALL_PATH)]);
    return overviewFrom(files, parseIndex(i), parseConfig(c), parseFollowUps(f), parseRecall(r));
  }

  async loadLearning(date: string, source: string): Promise<LoadedLearning> {
    const raw = await this.read(learningPath(date, source));
    return { date, source, raw, learning: raw === null ? null : parseLearning(raw, date, source) };
  }

  async loadSource(id: string): Promise<{ source: Source | null; raw: string | null }> {
    const raw = await this.read(sourcePath(id));
    return { raw, source: raw === null ? null : parseSource(raw, id) };
  }

  /**
   * Save one day's learning from one source, together with its source file
   * (created if new, its Log refreshed), the index, the recall schedule and
   * any follow-ups. Unless `force` is set, stops with ConflictError if the
   * day's file changed since it was loaded.
   */
  async saveLearning(opts: {
    loaded: LoadedLearning;
    learning: Learning;
    /** The source as you see it; used as is when it doesn't exist yet. */
    source: Source;
    followUps?: FollowUp[];
    /** Follow-up IDs to drop (you cleared a start/stop line). */
    dropFollowUps?: string[];
    config: JournalConfig;
    force?: boolean;
  }): Promise<SaveResult> {
    const { loaded, source, config, force } = opts;
    const now = localTimestamp();
    const learning: Learning = { ...opts.learning, created: loaded.learning?.created ?? now, updated: now };
    const path = learningPath(learning.date, learning.source);
    const sPath = sourcePath(source.id);
    let result!: SaveResult;

    await this.gh.commit(this.branch, `learning: ${source.title} · ${learning.date}`, async (head) => {
      if (!force) {
        const theirs = await this.read(path, head);
        if (theirs !== loaded.raw) throw new ConflictError([path], theirs);
      }
      const [indexText, recallText, sourceText] = await Promise.all([this.read(INDEX_PATH, head), this.read(RECALL_PATH, head), this.read(sPath, head)]);
      // The source as it is now on GitHub, with your status change (e.g. want → reading) on top.
      const base = sourceText === null ? { ...source, created: source.created ?? now } : parseSource(sourceText, source.id);
      // Logging from something on your reading list means you've started it.
      const status = base.status === 'want' ? 'reading' : base.status;
      const started = base.started ?? learning.date;
      const changed = sourceText === null || status !== base.status || started !== base.started;
      const merged: Source = { ...base, status, started, updated: changed ? now : base.updated };
      const index = withLearning(withSource(parseIndex(indexText), merged, now), learning, now);
      const recall = parseRecall(recallText);
      if (!recall.items[learning.id]) recall.items[learning.id] = scheduleNew(learning.date, config.recallIntervals);
      const log = entriesFor(index, merged.id).map((e) => ({ date: e.date, path: learningPath(e.date, e.source), learned: e.learned }));
      const files: FileChange[] = [
        { path, content: serializeLearning(learning, merged.title) },
        { path: sPath, content: serializeSource(merged, log) },
        { path: INDEX_PATH, content: serializeIndex(index) },
        { path: RECALL_PATH, content: serializeRecall(recall) },
      ];
      let follow: FollowUpFile | null = null;
      if (opts.followUps?.length || opts.dropFollowUps?.length) {
        const current = parseFollowUps(await this.read(FOLLOWUPS_PATH, head));
        const drop = new Set(opts.dropFollowUps ?? []);
        const kept = { version: 1 as const, items: current.items.filter((i) => !drop.has(i.id) || i.status !== 'open') };
        follow = mergeFollowUps(kept, opts.followUps ?? []);
        files.push(...followUpFiles(follow));
      }
      result = { index, recall, followUps: follow, paths: files.map((f) => f.path) };
      return files;
    });
    return result;
  }

  /** Save changes to a source (finish, abandon, rate, rename, reading list). */
  async saveSource(source: Source, loadedRaw: string | null | undefined, force = false): Promise<{ index: JournalIndex; source: Source; raw: string }> {
    const now = localTimestamp();
    const path = sourcePath(source.id);
    let out!: { index: JournalIndex; source: Source; raw: string };
    const verb = source.status === 'finished' ? 'finished' : source.status === 'abandoned' ? 'stopped' : loadedRaw === null ? 'added' : 'source';
    await this.gh.commit(this.branch, `${verb}: ${source.title}`, async (head) => {
      const current = await this.read(path, head);
      if (!force && loadedRaw !== undefined && current !== loadedRaw) throw new ConflictError([path], current);
      const index = withSource(parseIndex(await this.read(INDEX_PATH, head)), source, now);
      const s = { ...source, created: source.created ?? now, updated: now };
      const log = entriesFor(index, s.id).map((e) => ({ date: e.date, path: learningPath(e.date, e.source), learned: e.learned }));
      const raw = serializeSource(s, log);
      out = { index: withSource(index, s, now), source: s, raw };
      return [
        { path, content: raw },
        { path: INDEX_PATH, content: serializeIndex(out.index) },
      ];
    });
    return out;
  }

  /** Save a recall session: the schedule and the readable monthly log, in one commit. */
  async saveRecall(answers: RecallAnswer[], today: string, config: JournalConfig): Promise<RecallFile> {
    let recall = emptyRecall();
    const logPath = recallLogPath(today.slice(0, 7));
    const n = answers.length;
    await this.gh.commit(this.branch, `recall: ${n} ${n === 1 ? 'learning' : 'learnings'} · ${today}`, async (head) => {
      const [r, log] = await Promise.all([this.read(RECALL_PATH, head), this.read(logPath, head)]);
      recall = parseRecall(r);
      for (const a of answers) {
        const item = recall.items[a.id] ?? scheduleNew(a.date, config.recallIntervals);
        recall.items[a.id] = a.result === 'retired' ? retireItem(item, today) : applyResult(item, a.result, today, config.recallIntervals);
      }
      return [
        { path: RECALL_PATH, content: serializeRecall(recall) },
        { path: logPath, content: addToRecallLog(log, logPath, today, answers) },
      ];
    });
    return recall;
  }

  async loadWeekly(week: string): Promise<WeeklyData> {
    const raw = await this.read(weeklyPath(week));
    return { weekly: raw === null ? null : parseWeekly(raw, week), raw };
  }

  async saveWeekly(
    loaded: WeeklyData,
    weekly: Weekly,
    topText: { id: string; text: string; source: string }[],
    followUps: FollowUp[] = [],
    force = false,
  ): Promise<{ data: WeeklyData; followUps: FollowUpFile | null }> {
    const now = localTimestamp();
    const w = { ...weekly, created: loaded.weekly?.created ?? now, updated: now };
    const text = serializeWeekly(w, topText);
    const path = weeklyPath(w.week);
    let follow: FollowUpFile | null = null;
    await this.gh.commit(this.branch, `weekly review: ${w.week}`, async (head) => {
      const theirs = await this.read(path, head);
      if (!force && theirs !== loaded.raw) throw new ConflictError([path], theirs);
      const files: FileChange[] = [{ path, content: text }];
      if (followUps.length) {
        follow = mergeFollowUps(parseFollowUps(await this.read(FOLLOWUPS_PATH, head)), followUps);
        files.push(...followUpFiles(follow));
      }
      return files;
    });
    return { data: { weekly: w, raw: text }, followUps: follow };
  }

  /** Save follow-up answers on their own (e.g. from Today). */
  async saveFollowUps(changes: FollowUp[], message = 'follow-ups'): Promise<FollowUpFile> {
    let follow = emptyFollowUps();
    await this.gh.commit(this.branch, message, async (head) => {
      follow = mergeFollowUps(parseFollowUps(await this.read(FOLLOWUPS_PATH, head)), changes);
      return followUpFiles(follow);
    });
    return follow;
  }

  /** Read every source, learning and recall log, and build the index and schedule from them. */
  private async buildAll(files: string[], config: JournalConfig): Promise<{ index: JournalIndex; recall: RecallFile }> {
    const kinds = files.map((p) => ({ p, c: classifyPath(p) })).filter((x) => x.c && x.c.kind !== 'weekly');
    const texts = await mapLimit(kinds, 6, async (x) => ({ ...x, text: await this.read(x.p) }));
    let index = emptyIndex();
    const learnings: { id: string; date: string }[] = [];
    const events: ReturnType<typeof parseRecallLog> = [];
    for (const { c, text } of texts) {
      if (text === null || !c) continue;
      if (c.kind === 'source') index = withSource(index, parseSource(text, c.id));
    }
    const slugToSource = new Map(Object.keys(index.sources).map((id) => [id.slice(id.lastIndexOf('/') + 1), id]));
    for (const { c, text } of texts) {
      if (text === null || !c) continue;
      if (c.kind === 'learning') {
        const l = parseLearning(text, c.date, slugToSource.get(c.slug) ?? `other/${c.date.slice(0, 4)}/${c.slug}`);
        if (!l.id) l.id = `${c.date.replace(/-/g, '').slice(2)}${c.slug.slice(0, 3)}`;
        if (!index.sources[l.source]) index = withSource(index, { id: l.source, type: 'other', title: c.slug.replace(/-/g, ' '), status: 'reading' });
        index = withLearning(index, l);
        learnings.push({ id: l.id, date: l.date });
      } else if (c.kind === 'recall') events.push(...parseRecallLog(text));
    }
    return { index: { ...index, updated: localTimestamp() }, recall: rebuildRecall(learnings, events, config.recallIntervals) };
  }

  /** Rebuild index.json and recall.json from the Markdown (use after editing files on GitHub). */
  async rebuild(config: JournalConfig): Promise<{ index: JournalIndex; recall: RecallFile }> {
    const built = await this.buildAll(await this.gh.listFiles(this.branch), config);
    await this.gh.commit(this.branch, 'Rebuild index', async () => [
      { path: INDEX_PATH, content: serializeIndex(built.index) },
      { path: RECALL_PATH, content: serializeRecall(built.recall) },
    ]);
    return built;
  }
}

/** Due date for "ask me in N days". */
export const followUpDue = (date: string, days: number) => addDays(date, days);
