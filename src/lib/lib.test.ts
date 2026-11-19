import { describe, expect, it } from 'vitest';
import { createFakeGitHub } from '../../tests/fake-github.mjs';
import { parseConfig, serializeConfig, DEFAULT_CONFIG } from './config';
import { addDays, formatRange, isoWeek, monthGrid, weekRange } from './dates';
import {
  classifyPath,
  emptyLearning,
  learningPath,
  newId,
  parseLearning,
  parseSource,
  parseWeekly,
  relativeLink,
  serializeLearning,
  serializeSource,
  serializeWeekly,
  slugify,
  sourceIdFor,
  uniqueSlug,
  type Source,
  type Weekly,
} from './entries';
import { GitHub } from './github';
import { ConflictError, Journal } from './journal';
import { emptyIndex, matchSources, recentSources, searchIndex, streaks, weekData, withLearning, withSource } from './journalIndex';
import { weeklyQuestionFor } from './prompts';
import {
  addToRecallLog,
  applyResult,
  gapLabel,
  nextGapLabel,
  parseRecallLog,
  rebuildRecall,
  recallQueue,
  retireItem,
  scheduleNew,
  type RecallFile,
} from './recall';

// All sample data here is made up.
const book: Source = { id: 'books/the-patient-mind', type: 'book', title: 'The Patient Mind', author: 'Ana Ferreira', status: 'reading' };
const video: Source = { id: 'videos/2026/how-bridges-carry-load', type: 'video', title: 'How bridges carry load', status: 'finished' };
const learn = (date: string, source: Source, id: string, learned: string, extra: Partial<{ continue: string; stop: string; start: string }> = {}) => ({
  ...emptyLearning(date, source.id, id),
  learned,
  ...extra,
});

describe('dates', () => {
  it('computes ISO weeks and ranges', () => {
    expect(isoWeek('2026-11-19').id).toBe('2026-W47');
    expect(isoWeek('2027-01-01').id).toBe('2026-W53');
    expect(weekRange('2026-W47')).toMatchObject({ start: '2026-11-16', end: '2026-11-22' });
    expect(formatRange('2026-11-16', '2026-11-22')).toBe('16–22 Nov');
    expect(monthGrid(2026, 11).filter(Boolean)).toHaveLength(30);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('paths and slugs', () => {
  it('builds source and learning paths', () => {
    expect(sourceIdFor('book', 'the-patient-mind', '2026')).toBe('books/the-patient-mind');
    expect(sourceIdFor('video', 'how-bridges-carry-load', '2026')).toBe('videos/2026/how-bridges-carry-load');
    expect(learningPath('2026-11-18', 'videos/2026/how-bridges-carry-load')).toBe('daily/2026/11/2026-11-18/how-bridges-carry-load.md');
    expect(classifyPath('daily/2026/11/2026-11-18/the-patient-mind.md')).toEqual({ kind: 'learning', date: '2026-11-18', slug: 'the-patient-mind' });
    expect(classifyPath('sources/articles/2026/why-checklists.md')).toEqual({ kind: 'source', id: 'articles/2026/why-checklists' });
    expect(classifyPath('reviews/weekly/2026/2026-W47.md')).toEqual({ kind: 'weekly', week: '2026-W47' });
    expect(classifyPath('reviews/recall/2026/2026-11.md')).toEqual({ kind: 'recall', month: '2026-11' });
    expect(classifyPath('README.md')).toBeNull();
  });
  it('makes readable, unique slugs', () => {
    expect(slugify('Café Society: Notes & Thoughts!')).toBe('cafe-society-notes-and-thoughts');
    expect(slugify('???')).toBe('untitled');
    expect(uniqueSlug('Episode 12', ['podcasts/2026/episode-12'])).toBe('episode-12-2');
    expect(uniqueSlug('Episode 12', ['podcasts/2026/episode-12'], 'The Learning Loop')).toBe('episode-12-loop');
    expect(newId(new Set(['0000']), () => 0.5)).toMatch(/^[a-z0-9]{4}$/);
  });
  it('makes relative links that work on GitHub', () => {
    expect(relativeLink('sources/books/a.md', 'daily/2026/11/2026-11-18/a.md')).toBe('../../daily/2026/11/2026-11-18/a.md');
    expect(relativeLink('daily/2026/11/2026-11-18/a.md', 'sources/books/a.md')).toBe('../../../../sources/books/a.md');
    expect(relativeLink('reviews/recall/2026/2026-11.md', 'daily/2026/11/2026-11-18/a.md')).toBe('../../../daily/2026/11/2026-11-18/a.md');
  });
});

describe('file formats', () => {
  it('round-trips a learning and leaves out empty sections', () => {
    const l = { ...learn('2026-11-18', book, 'k7f2', 'Attention is a budget.\n\nEven ignored pings cost.', { start: 'Phone in another room.' }), followups: ['k7f2-start'], created: '2026-11-18T21:31:02' };
    const md = serializeLearning(l, book.title);
    expect(md).toContain('# The Patient Mind · Wed 18 Nov 2026');
    expect(md).toContain('From [The Patient Mind](../../../../sources/books/the-patient-mind.md)');
    expect(md).toContain('## What I learned\nAttention is a budget.');
    expect(md).not.toContain('## Stop');
    expect(parseLearning(md, l.date)).toEqual({ ...l, updated: undefined });
  });
  it('round-trips a source with its log and keeps hand-written sections', () => {
    const s: Source = { ...book, status: 'finished', rating: 4, finished: '2026-11-30', takeaway: 'Focus is built.', extra: '## My own notes\nRe-read ch. 6.' };
    const md = serializeSource(s, [{ date: '2026-11-18', path: 'daily/2026/11/2026-11-18/the-patient-mind.md', learned: 'Attention is a budget.' }]);
    expect(md).toContain('Ana Ferreira · book · finished · ★★★★☆');
    expect(md).toContain('## What I took from this\nFocus is built.');
    expect(md).toContain('- [Wed 18 Nov 2026](../../daily/2026/11/2026-11-18/the-patient-mind.md) · Attention is a budget.');
    expect(parseSource(md, s.id)).toEqual({ ...s, started: undefined, created: undefined, updated: undefined });
  });
  it('parses a source edited by hand', () => {
    const s = parseSource('# Some Talk\nnotes', 'videos/2026/some-talk');
    expect(s).toMatchObject({ type: 'video', title: 'Some Talk', status: 'reading' });
    expect(parseSource('---\nstatus: nonsense\nrating: 9\n---\n', 'books/x')).toMatchObject({ status: 'reading', rating: null, title: 'x' });
  });
  it('round-trips a weekly review', () => {
    const w: Weekly = {
      week: '2026-W47',
      start: '2026-11-16',
      end: '2026-11-22',
      stats: { days: 5, sources: 4, learnings: 6, recalled: 11, remembered: 8, done: 2 },
      top: ['k7f2', 'c1x0'],
      applied: 'Phone out of the room, two days of three.',
      next: 'Notes on Craft',
      question: 'Which learning this week changed what you do, not just what you know?',
      answer: 'The attention budget.',
      startNext: 'A pre-mortem in Tuesday planning.',
    };
    const md = serializeWeekly(w, [{ id: 'k7f2', text: 'Attention is a budget.', source: 'The Patient Mind' }]);
    expect(md).toContain('stats: { days: 5, sources: 4, learnings: 6, recalled: 11, remembered: 8, done: 2 }');
    expect(md).toContain('1. Attention is a budget. (The Patient Mind)');
    expect(parseWeekly(md, w.week)).toEqual({ ...w, created: undefined, updated: undefined });
  });
  it('reads config leniently', () => {
    expect(parseConfig('not json')).toEqual(DEFAULT_CONFIG);
    const c = parseConfig('{"weeklyDay":"saturday","recallIntervals":[2,"x",10],"recallPerDay":0}');
    expect(c).toMatchObject({ weeklyDay: 6, recallIntervals: [2, 10], recallPerDay: 5 });
    expect(parseConfig(serializeConfig(c))).toEqual(c);
    expect(serializeConfig(DEFAULT_CONFIG)).toContain('"recallIntervals": [1, 7, 30, 90, 180]');
  });
});

describe('recall schedule', () => {
  it('climbs the ladder and retires after six months', () => {
    let item = scheduleNew('2026-11-18');
    expect(item.due).toBe('2026-11-19');
    item = applyResult(item, 'remembered', '2026-11-19');
    expect(item).toMatchObject({ step: 1, due: '2026-11-26' });
    item = applyResult(item, 'fuzzy', '2026-11-28'); // late: counts from the day answered
    expect(item).toMatchObject({ step: 1, due: '2026-12-05' });
    item = applyResult(item, 'forgot', '2026-12-05');
    expect(item).toMatchObject({ step: 0, due: '2026-12-06' });
    for (const d of ['2026-12-06', '2026-12-13', '2027-01-12', '2027-04-12']) item = applyResult(item, 'remembered', d);
    expect(item.retired).toBeUndefined();
    expect(nextGapLabel(item, 'remembered')).toBe('learned for good');
    item = applyResult(item, 'remembered', '2027-10-09');
    expect(item).toMatchObject({ retired: '2027-10-09', reason: 'learned' });
    expect(item.history).toHaveLength(8);
  });
  it('builds a capped daily queue, oldest first, skipping retired', () => {
    const f: RecallFile = {
      version: 1,
      items: {
        a: { step: 0, due: '2026-11-19', history: [] },
        b: { step: 2, due: '2026-11-01', history: [] },
        c: { step: 1, due: '2026-11-20', history: [] },
        d: retireItem({ step: 1, due: '2026-11-02', history: [] }, '2026-11-10'),
        e: { step: 1, due: '2026-11-10', history: [] },
      },
    };
    expect(recallQueue(f, '2026-11-19', 5)).toEqual({ due: ['b', 'e', 'a'], waiting: 0 });
    expect(recallQueue(f, '2026-11-19', 2)).toEqual({ due: ['b', 'e'], waiting: 1 });
  });
  it('labels gaps', () => {
    expect([1, 7, 14, 30, 90, 180, 365, 3].map(gapLabel)).toEqual(['1 day', '1 week', '2 weeks', '1 month', '3 months', '6 months', '1 year', '3 days']);
  });
  it('writes a readable log and rebuilds the schedule from it', () => {
    const path = 'reviews/recall/2026/2026-11.md';
    const a = { title: 'The Patient Mind', date: '2026-11-18', learned: 'Attention is a budget.', path: 'daily/2026/11/2026-11-18/the-patient-mind.md' };
    let log = addToRecallLog(null, path, '2026-11-19', [{ ...a, id: 'k7f2', result: 'remembered', note: 'I notice it\non Mondays.', next: 'next in 1 week' }]);
    log = addToRecallLog(log, path, '2026-11-26', [{ ...a, id: 'k7f2', result: 'fuzzy' }]);
    log = addToRecallLog(log, path, '2026-11-26', [{ ...a, id: 'zz99', result: 'retired' }]);
    expect(log).toContain('# Recall · November 2026');
    expect(log.indexOf('Thu 26 Nov')).toBeLessThan(log.indexOf('Thu 19 Nov'));
    expect(log).toContain('- **Remembered** · [The Patient Mind, Wed 18 Nov 2026](../../../daily/2026/11/2026-11-18/the-patient-mind.md): Attention is a budget. <!-- recall:k7f2 --> · next in 1 week\n  Now: I notice it on Mondays.');
    const events = parseRecallLog(log);
    expect(events).toEqual([
      { date: '2026-11-26', id: 'k7f2', result: 'fuzzy' },
      { date: '2026-11-26', id: 'zz99', result: 'retired' },
      { date: '2026-11-19', id: 'k7f2', result: 'remembered' },
    ]);
    const r = rebuildRecall(
      [
        { id: 'k7f2', date: '2026-11-18' },
        { id: 'zz99', date: '2026-11-01' },
      ],
      events,
    );
    expect(r.items.k7f2).toMatchObject({ step: 1, due: '2026-12-03' });
    expect(r.items.zz99.retired).toBe('2026-11-26');
  });
});

describe('index', () => {
  const index = [
    learn('2026-11-17', book, 'aaaa', 'Boredom is the doorway to focus.'),
    learn('2026-11-18', book, 'k7f2', 'Attention is a budget.', { stop: 'Checking chat in the first hour' }),
    learn('2026-11-19', video, 'b8t3', 'Arches turn weight into sideways push.'),
  ].reduce((i, l) => withLearning(i, l), withSource(withSource(emptyIndex(), book), video));

  it('finds sources as you type', () => {
    expect(matchSources(index, 'pat')).toEqual(['books/the-patient-mind']);
    expect(matchSources(index, 'mind')).toEqual(['books/the-patient-mind']);
    expect(matchSources(index, 'ferr')).toEqual(['books/the-patient-mind']);
    expect(matchSources(index, 'bridges load')).toEqual(['videos/2026/how-bridges-carry-load']);
    expect(matchSources(index, 'zebra')).toEqual([]);
    expect(recentSources(index)).toEqual(['videos/2026/how-bridges-carry-load', 'books/the-patient-mind']);
  });
  it('searches learnings, stop / start lines and sources', () => {
    expect(searchIndex(index, 'budget').map((h) => h.key)).toEqual(['2026-11-18/the-patient-mind']);
    expect(searchIndex(index, 'chat')[0].field).toBe('stop');
    expect(searchIndex(index, 'patient').map((h) => h.date)).toEqual(['2026-11-18', '2026-11-17']);
  });
  it('counts streaks and weeks', () => {
    expect(streaks(new Set(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-10']), '2026-11-19')).toEqual({ current: 3, best: 3 });
    expect(streaks(new Set(['2026-11-17', '2026-11-18']), '2026-11-19').current).toBe(2);
    const w = weekData(index, '2026-W47');
    expect(w.entries.map((e) => e.id)).toEqual(['aaaa', 'k7f2', 'b8t3']);
    expect(w.sources).toHaveLength(2);
  });
  it('rotates the weekly question and ↻ moves on', () => {
    const q0 = weeklyQuestionFor(DEFAULT_CONFIG, '2026-W47');
    expect(weeklyQuestionFor(DEFAULT_CONFIG, '2026-W47')).toBe(q0);
    expect(weeklyQuestionFor(DEFAULT_CONFIG, '2026-W47', 1)).not.toBe(q0);
  });
});

describe('journal against a fake GitHub', () => {
  const setup = async (opts = {}) => {
    const fake = createFakeGitHub(opts);
    const gh = new GitHub('me', 'bookjournal-data', 'tok', fake.fetch);
    const info = await gh.getRepo();
    const j = new Journal(gh, info.defaultBranch, info.htmlUrl);
    await j.bootstrap(info);
    return { fake, j };
  };

  it('sets up an empty repo', async () => {
    const { fake } = await setup({ empty: true });
    expect(fake.paths().sort()).toEqual(['.journal/config.json', '.journal/index.json', '.journal/recall.json', 'README.md']);
  });

  it('saves a learning, its new source, index, recall and follow-up in one commit', async () => {
    const { fake, j } = await setup();
    const before = fake.commitMessages().length;
    const loaded = await j.loadLearning('2026-11-18', book.id);
    const l = learn('2026-11-18', book, 'k7f2', 'Attention is a budget.', { start: 'Phone in another room.' });
    const fu = { id: 'k7f2-start', text: 'Start: Phone in another room.', people: [], created: '2026-11-18', due: '2026-11-25', status: 'open' as const };
    const r = await j.saveLearning({ loaded, learning: { ...l, followups: [fu.id] }, source: book, followUps: [fu], config: DEFAULT_CONFIG });
    expect(fake.commitMessages().length).toBe(before + 1);
    expect(fake.commitMessages()[0]).toBe('learning: The Patient Mind · 2026-11-18');
    expect(r.paths.sort()).toEqual([
      '.journal/followups.json',
      '.journal/index.json',
      '.journal/recall.json',
      'daily/2026/11/2026-11-18/the-patient-mind.md',
      'followups.md',
      'sources/books/the-patient-mind.md',
    ]);
    expect(fake.file('sources/books/the-patient-mind.md')).toContain('](../../daily/2026/11/2026-11-18/the-patient-mind.md) · Attention is a budget.');
    const o = await j.overview();
    expect(o.index.entries['2026-11-18/the-patient-mind'].learned).toBe('Attention is a budget.');
    expect(o.recall.items.k7f2.due).toBe('2026-11-19');
    expect(o.followUps.items[0].text).toBe('Start: Phone in another room.');
    const again = await j.loadLearning('2026-11-18', book.id);
    expect(again.learning?.start).toBe('Phone in another room.');
  });

  it('moves a reading-list source to reading when you log from it', async () => {
    const { j } = await setup();
    const want = { ...book, status: 'want' as const };
    await j.saveSource(want, null);
    await j.saveLearning({ loaded: await j.loadLearning('2026-11-19', book.id), learning: learn('2026-11-19', book, 'zz11', 'x'), source: want, config: DEFAULT_CONFIG });
    const s = await j.loadSource(book.id);
    expect(s.source).toMatchObject({ status: 'reading', started: '2026-11-19' });
  });

  it('retries when the branch moves mid-save, keeping both entries', async () => {
    const { fake, j } = await setup();
    await j.saveLearning({ loaded: await j.loadLearning('2026-11-17', book.id), learning: learn('2026-11-17', book, 'aaaa', 'one'), source: book, config: DEFAULT_CONFIG });
    fake.failNextRefUpdate();
    await j.saveLearning({ loaded: await j.loadLearning('2026-11-18', video.id), learning: learn('2026-11-18', video, 'bbbb', 'two'), source: video, config: DEFAULT_CONFIG });
    const o = await j.overview();
    expect(Object.keys(o.index.entries)).toEqual(['2026-11-17/the-patient-mind', '2026-11-18/how-bridges-carry-load']);
    expect(Object.keys(o.recall.items).sort()).toEqual(['aaaa', 'bbbb']);
  });

  it('refuses to overwrite an entry changed elsewhere unless forced', async () => {
    const { fake, j } = await setup();
    const loaded = await j.loadLearning('2026-11-18', book.id);
    fake.write('daily/2026/11/2026-11-18/the-patient-mind.md', '## What I learned\nwritten on github\n');
    const l = learn('2026-11-18', book, 'k7f2', 'mine');
    await expect(j.saveLearning({ loaded, learning: l, source: book, config: DEFAULT_CONFIG })).rejects.toBeInstanceOf(ConflictError);
    await j.saveLearning({ loaded, learning: l, source: book, config: DEFAULT_CONFIG, force: true });
    expect(fake.file('daily/2026/11/2026-11-18/the-patient-mind.md')).toContain('mine');
  });

  it('finishes a source and saves a recall session with its log', async () => {
    const { fake, j } = await setup();
    await j.saveLearning({ loaded: await j.loadLearning('2026-11-18', book.id), learning: learn('2026-11-18', book, 'k7f2', 'Attention is a budget.'), source: book, config: DEFAULT_CONFIG });
    const loaded = await j.loadSource(book.id);
    await j.saveSource({ ...loaded.source!, status: 'finished', rating: 5, finished: '2026-11-30', takeaway: 'Built, not found.' }, loaded.raw);
    expect(fake.file('sources/books/the-patient-mind.md')).toContain('## What I took from this\nBuilt, not found.');
    expect(fake.file('sources/books/the-patient-mind.md')).toContain('## Log');
    const r = await j.saveRecall(
      [{ id: 'k7f2', result: 'remembered', title: book.title, date: '2026-11-18', learned: 'Attention is a budget.', path: learningPath('2026-11-18', book.id) }],
      '2026-11-19',
      DEFAULT_CONFIG,
    );
    expect(r.items.k7f2).toMatchObject({ step: 1, due: '2026-11-26' });
    expect(fake.file('reviews/recall/2026/2026-11.md')).toContain('<!-- recall:k7f2 -->');
    expect(fake.commitMessages()[0]).toBe('recall: 1 learning · 2026-11-19');
  });

  it('rebuilds the index and schedule from the Markdown', async () => {
    const { fake, j } = await setup();
    await j.saveLearning({ loaded: await j.loadLearning('2026-11-18', book.id), learning: learn('2026-11-18', book, 'k7f2', 'Attention is a budget.'), source: book, config: DEFAULT_CONFIG });
    await j.saveRecall([{ id: 'k7f2', result: 'remembered', title: book.title, date: '2026-11-18', learned: 'x', path: 'p' }], '2026-11-19', DEFAULT_CONFIG);
    fake.write('daily/2026/11/2026-11-20/the-patient-mind.md', '## What I learned\nWritten by hand on GitHub.\n');
    const built = await j.rebuild(DEFAULT_CONFIG);
    expect(built.index.entries['2026-11-20/the-patient-mind']).toMatchObject({ source: 'books/the-patient-mind', learned: 'Written by hand on GitHub.' });
    expect(built.recall.items.k7f2).toMatchObject({ step: 1, due: '2026-11-26' });
    expect(Object.keys(built.recall.items)).toHaveLength(2);
  });
});
