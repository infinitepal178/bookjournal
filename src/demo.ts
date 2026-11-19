// Demo build only (vite build --mode demo): runs the real app against an
// in-memory GitHub filled with MADE-UP sample data, dated relative to today.
// Nothing leaves the page and everything resets when you reload.

import { createFakeGitHub } from '../tests/fake-github.mjs';
import { DEFAULT_CONFIG } from './lib/config';
import { addDays, dateKey } from './lib/dates';
import { emptyLearning, learningPath, type Source } from './lib/entries';
import { newFollowUp } from './lib/followups';
import { GitHub } from './lib/github';
import { Journal } from './lib/journal';
import { overrideSettings } from './lib/store';

const OWNER = 'demo';
const REPO = 'bookjournal-data';

const S = {
  patient: { id: 'books/the-patient-mind', type: 'book', title: 'The Patient Mind', author: 'Ana Ferreira', status: 'reading' },
  commute: { id: 'books/the-long-commute', type: 'book', title: 'The Long Commute', author: 'Tomas Lind', status: 'reading' },
  craft: { id: 'books/notes-on-craft', type: 'book', title: 'Notes on Craft', author: 'Ruth Abara', status: 'want' },
  clouds: { id: 'books/field-guide-to-clouds', type: 'book', title: 'Field Guide to Clouds', author: 'Ines Halvorsen', status: 'reading' },
  checklists: { id: 'articles/2026/why-checklists-beat-willpower', type: 'article', title: 'Why Checklists Beat Willpower', status: 'finished' },
  loop: { id: 'podcasts/2026/the-learning-loop-ep-41', type: 'podcast', title: 'The Learning Loop · Ep. 41: Spacing and forgetting', status: 'finished' },
  bridges: { id: 'videos/2026/how-bridges-carry-load', type: 'video', title: 'How bridges carry load', status: 'finished' },
  stats: { id: 'courses/intro-to-statistics', type: 'course', title: 'Intro to Statistics', status: 'reading' },
  jo: { id: 'conversations/2026/coffee-with-jo', type: 'conversation', title: 'Coffee with Jo (mentor)', status: 'finished' },
} satisfies Record<string, Source>;

type Sample = { ago: number; s: Source; id: string; learned: string; continue?: string; stop?: string; start?: string; ask?: number };

const SAMPLES: Sample[] = [
  { ago: 52, s: S.commute, id: 'a9q4', learned: 'New road capacity fills with new traffic within a few years.', stop: 'Assuming more capacity fixes a busy calendar.' },
  { ago: 45, s: S.commute, id: 'c0m2', learned: 'A system pushes back against the obvious fix; look for what the fix makes cheaper.' },
  { ago: 38, s: S.clouds, id: 'cl01', learned: 'Clouds are named by height first, then by shape.' },
  { ago: 38, s: S.jo, id: 'j6w1', learned: 'Ask what would make the project fail before asking what would make it succeed.', start: 'A 5-minute pre-mortem at the start of planning.', continue: 'Monthly coffee with Jo.' },
  { ago: 22, s: S.stats, id: 's1m1', learned: 'The mean hides the shape; always look at the spread too.' },
  { ago: 13, s: S.patient, id: 'm3c9', learned: 'Boredom is the doorway to focus, not a sign it failed.', continue: 'Walking without headphones once a day.' },
  { ago: 8, s: S.bridges, id: 'b8t3', learned: 'Arches turn weight into sideways push, so the ends need something to lean on.' },
  { ago: 7, s: S.patient, id: 'p2d8', learned: 'Deep work needs a start ritual more than it needs willpower.', start: 'Same 3-step start every morning: water, one line of plan, timer.', ask: 7 },
  { ago: 6, s: S.stats, id: 's4m2', learned: 'A p-value says how surprising the data is if nothing is going on, not how likely the idea is true.' },
  { ago: 5, s: S.loop, id: 'r5n1', learned: 'Review when it feels slightly hard; easy reviews do little.', continue: 'Recalling before re-reading.' },
  { ago: 4, s: S.checklists, id: 'c1x0', learned: "A checklist is for the steps experts skip when they're confident, not for the hard parts.", start: 'A 4-line pre-send checklist for client emails.', ask: 3 },
  { ago: 3, s: S.patient, id: 'k3b1', learned: 'Willpower spent early in the day is borrowed from the evening.' },
  { ago: 2, s: S.commute, id: 'lc22', learned: 'Every new road was sold as the last one the city would need.' },
  { ago: 1, s: S.patient, id: 'k7f2', learned: 'Attention is a budget: every notification spends a little, even the ones I ignore.', stop: 'Checking chat in the first hour of work.', start: 'Phone in another room for the first hour.', ask: 7 },
];

export async function installDemo(): Promise<void> {
  document.documentElement.dataset.demo = '1';
  const today = dateKey();
  const fake = createFakeGitHub({ owner: OWNER, repo: REPO, files: {} as Record<string, string>, empty: true });
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return url.startsWith('https://api.github.com/') ? fake.fetch(url, init) : realFetch(input, init);
  }) as typeof fetch;

  const gh = new GitHub(OWNER, REPO, 'demo-token');
  const info = await gh.getRepo();
  const j = new Journal(gh, info.defaultBranch, `https://github.com/${OWNER}/${REPO}`);
  await j.bootstrap(info);
  const config = DEFAULT_CONFIG;

  await j.saveSource(S.craft, null);
  for (const x of SAMPLES) {
    const date = addDays(today, -x.ago);
    const learning = { ...emptyLearning(date, x.s.id, x.id), learned: x.learned, continue: x.continue ?? '', stop: x.stop ?? '', start: x.start ?? '' };
    const followUps = x.start && x.ask ? [newFollowUp(`Start: ${x.start}`, date, addDays(date, x.ask), [], learningPath(date, x.s.id), `${x.id}-start`)] : [];
    if (followUps.length) learning.followups = followUps.map((f) => f.id);
    await j.saveLearning({ loaded: { date, source: x.s.id, learning: null, raw: null }, learning, source: x.s as Source, followUps, config });
  }
  // Finish one book and give up on another.
  for (const [s, patch] of [
    [S.commute, { status: 'finished', rating: 4, finished: addDays(today, -2), takeaway: 'Systems push back. When something is congested, adding room invites more of it; changing what is cheap works better than adding capacity.' }],
    [S.clouds, { status: 'abandoned', takeaway: 'Lovely photos, but I wanted the physics.' }],
  ] as const) {
    const loaded = await j.loadSource(s.id);
    await j.saveSource({ ...loaded.source!, ...patch } as Source, loaded.raw);
  }
  // Some recall history, so today's queue has cards at different steps.
  const answer = (id: string, ago: number, result: 'remembered' | 'fuzzy' | 'forgot' | 'retired') => {
    const x = SAMPLES.find((s) => s.id === id)!;
    const date = addDays(today, -x.ago);
    return j.saveRecall([{ id, result, title: x.s.title, date, learned: x.learned, path: learningPath(date, x.s.id) }], addDays(today, -ago), config);
  };
  // Due today: p2d8 (a day late), k7f2 (1-day review), b8t3 (1-week), j6w1 (1-month).
  for (const [id, ago, r] of [
    ['a9q4', 51, 'remembered'],
    ['a9q4', 44, 'remembered'],
    ['a9q4', 14, 'remembered'],
    ['c0m2', 44, 'fuzzy'],
    ['c0m2', 43, 'remembered'],
    ['c0m2', 36, 'remembered'],
    ['c0m2', 6, 'remembered'],
    ['cl01', 37, 'retired'],
    ['j6w1', 37, 'remembered'],
    ['j6w1', 30, 'remembered'],
    ['s1m1', 21, 'remembered'],
    ['s1m1', 14, 'remembered'],
    ['m3c9', 12, 'remembered'],
    ['m3c9', 5, 'remembered'],
    ['b8t3', 7, 'remembered'],
    ['s4m2', 5, 'forgot'],
    ['s4m2', 4, 'remembered'],
    ['r5n1', 4, 'remembered'],
    ['c1x0', 3, 'fuzzy'],
    ['c1x0', 2, 'remembered'],
    ['k3b1', 2, 'remembered'],
    ['lc22', 1, 'remembered'],
  ] as const)
    await answer(id, ago, r);
  // A follow-up from last week that's already answered.
  await j.saveFollowUps([
    { ...newFollowUp('Start: A 5-minute pre-mortem at the start of planning.', addDays(today, -38), addDays(today, -31), [], learningPath(addDays(today, -38), S.jo.id), 'j6w1-start'), status: 'done', closed: addDays(today, -31), outcome: 'Did it twice. It caught a missing sign-off both times.' },
  ]);

  overrideSettings({ owner: OWNER, repo: REPO, token: 'demo-token', branch: 'main' });
}
