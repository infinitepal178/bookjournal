// Built-in deeper weekly questions. Your own from .journal/config.json are mixed
// in (set "builtInPrompts": false there to use only yours). Each week gets one;
// the order is shuffled once per year so nothing repeats until the list is used
// up. ↻ in the app moves to the next one.

import type { JournalConfig } from './config';

export const WEEKLY_LIBRARY: string[] = [
  'Which learning this week changed what you do, not just what you know?',
  'What did you read or hear that you disagree with, and why?',
  'Which two sources said the same thing in different words?',
  'What would you explain to a friend over dinner from this week?',
  'Which source is not worth finishing, and what made you sure?',
  'What question keeps coming back across what you read?',
  'What did you learn from a person rather than a page or a screen?',
  'If you could keep only one note from this month, which one?',
  'What did you already know, but finally put into practice?',
  'Where did something you learned meet real life this week?',
  'Which idea made you uncomfortable, and what does that tell you?',
  'What is one thing you were wrong about a month ago?',
  'What would you look up if you had a free afternoon?',
  'Which habit from your "continue" list is quietly paying off?',
  'What did you stop doing, and did you miss it?',
  'Who would benefit most from something you learned this week?',
  'What are you learning slowly that deserves more patience?',
  'Which source surprised you most, compared with what you expected?',
  'What is the simplest version of the best idea you met this week?',
  'What did you learn about how you learn?',
  'Which advice would you give your past self after this week?',
  'What made it hard to apply something you learned?',
  'Where are you collecting ideas instead of using them?',
  'What do you want to understand properly by the end of the year?',
  'Which author or speaker would you want to ask one question, and what?',
  'What topic keeps pulling you in, and why now?',
  'What did you skim that deserves a slower second look?',
  'If this week had a single lesson, how would you put it in one sentence?',
  'What will you read differently next week?',
  'What did you learn this week that you will still use in a year?',
];

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = p.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Small seeded shuffle so the order is stable for a whole year on every device.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list: string[], seed: number): string[] {
  const out = [...list];
  const rnd = seeded(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function weeklyPool(config: JournalConfig): string[] {
  const pool = dedupe([...config.weeklyQuestions, ...(config.builtInPrompts ? WEEKLY_LIBRARY : [])]);
  return pool.length ? pool : WEEKLY_LIBRARY;
}

/** The deeper weekly question for an ISO week like "2026-W47". `skip` is the ↻ button. */
export function weeklyQuestionFor(config: JournalConfig, week: string, skip = 0): string {
  const year = Number(week.slice(0, 4));
  const n = Number(week.slice(6));
  const order = shuffled(weeklyPool(config), year * 7 + 1);
  return order[(n - 1 + skip) % order.length];
}
