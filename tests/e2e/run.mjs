// End-to-end check: builds nothing, serves dist/ with `vite preview`, and drives
// the app in Chromium at phone size against an in-memory fake GitHub.
// Usage: npm run build && npm run e2e   (SHOTS=dir to save screenshots)

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createFakeGitHub } from '../fake-github.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview did not start')), 20000);
});

const fake = createFakeGitHub();
const browser = await chromium.launch();
const errors = [];
let failures = 0;

function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.log(`  ✕ ${msg}`);
  }
}

async function newPage(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // A 404 is how GitHub says "no entry for this day yet", so the browser logs those; they're expected.
  page.on('console', (m) => m.type() === 'error' && !/status of 404/.test(m.text()) && errors.push(m.text()));
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const r = fake.handle(req.method(), req.url(), req.postData(), await req.allHeaders());
    await route.fulfill({ status: r.status, body: r.body, contentType: r.contentType, headers: cors });
  });
  return { ctx, page };
}

async function shot(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 0, `${name}: no sideways scrolling`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const today = iso(new Date());
const yesterday = iso(new Date(Date.now() - 86400000));
const dayFile = (date, slug) => `daily/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}/${slug}.md`;
const json = (p) => JSON.parse(fake.file(p) ?? 'null');
const SETTINGS = JSON.stringify({ owner: 'me', repo: 'bookjournal-data', token: 't', branch: 'main' });

// All data typed here is made up.
try {
  const { ctx, page } = await newPage({ ...devices['Pixel 7'] });

  console.log('Connect');
  await page.goto(URL);
  await shot(page, '01-connect');
  await page.fill('#repo', 'https://github.com/me/bookjournal-data');
  await page.fill('#token', 'github_pat_test');
  await page.click('button:has-text("Connect")');
  await page.waitForSelector('text=Log a learning');
  for (const f of ['.journal/config.json', '.journal/index.json', '.journal/recall.json']) check(fake.file(f) !== null, `created ${f}`);
  await shot(page, '02-today-empty');

  console.log('Log a learning from a new book');
  await page.click('button:has-text("Log a learning")');
  check(await page.waitForSelector('nav.tabbar', { state: 'hidden', timeout: 2000 }).then(() => true, () => false), 'tab bar hidden while logging');
  await page.fill('#source-search', 'The Patient Mind');
  await page.click('button:has-text("Add “The Patient Mind”")');
  check(await page.isVisible('[aria-label="Type of source"] button[aria-pressed="true"]:has-text("Book")'), 'new source defaults to Book');
  await page.fill('#new-author', 'Ana Ferreira');
  await shot(page, '03-source-new');
  await page.click('.flow-foot button:has-text("Next")');
  await page.waitForSelector('h1:has-text("What did you learn today?")');
  await page.fill('#step-text', 'Attention is a budget: every notification spends a little.');
  await shot(page, '04-learned');
  await page.click('.flow-foot button:has-text("Next")');
  await page.waitForSelector('h1:has-text("What will you continue doing?")');
  check(await page.isVisible('.flow-foot button:has-text("Skip")'), 'empty optional step offers Skip');
  await page.click('.flow-foot button:has-text("Skip")');
  await page.fill('#step-text', 'Checking chat in the first hour.');
  check(await page.isVisible('text=Ask me how it went'), 'stop step offers a follow-up');
  await page.click('.flow-foot button:has-text("Next")');
  await page.fill('#step-text', 'Phone in another room for the first hour.');
  await page.click('[aria-label="When should I ask how it went?"] button:has-text("In 3 days")');
  await shot(page, '05-start');
  const commitsBefore = fake.commitMessages().length;
  await page.click('.flow-foot button:has-text("Save")');
  await page.waitForSelector('h1:has-text("Saved")');
  await shot(page, '06-saved');
  check(fake.commitMessages().length === commitsBefore + 1, `one commit ("${fake.commitMessages()[0]}")`);
  const f1 = fake.file(dayFile(today, 'the-patient-mind')) ?? '';
  check(f1.includes('## What I learned\nAttention is a budget') && f1.includes('## Stop\nChecking chat') && f1.includes('## Start\nPhone in another room') && !f1.includes('## Continue'), 'learning file written');
  const src = fake.file('sources/books/the-patient-mind.md') ?? '';
  check(src.includes('author: Ana Ferreira') && src.includes('status: reading') && src.includes('## Log'), 'source file created with its log');
  const fus = json('.journal/followups.json').items;
  check(fus.length === 2 && fus.some((f) => f.text.startsWith('Start: Phone') && f.due > today), 'stop and start saved as follow-ups');
  const learnedId = Object.values(json('.journal/index.json').entries)[0]?.id;
  check(!!json('.journal/recall.json').items[learnedId], 'learning added to the recall schedule');

  console.log('Typeahead finds the source; a second source for yesterday');
  await page.click('button:has-text("Log another")');
  await page.fill('#source-search', 'pat');
  await page.waitForSelector('.suggest button:has-text("The Patient Mind")');
  await shot(page, '07-typeahead');
  await page.fill('#source-search', 'How bridges carry load');
  await page.click('button:has-text("Add “How bridges carry load”")');
  await page.click('[aria-label="Type of source"] button:has-text("Video")');
  check(!(await page.isVisible('#new-author')), 'no author field for a video');
  await page.click('[aria-label="Day"] button:has-text("Yesterday")');
  await page.click('.flow-foot button:has-text("Next")');
  await page.fill('#step-text', 'Arches turn weight into sideways push.');
  await page.click('.flow-foot button:has-text("Next")');
  await page.click('.flow-foot button:has-text("Save")'); // save early, skipping the rest
  await page.waitForSelector('h1:has-text("Saved")');
  check(fake.file(`sources/videos/${yesterday.slice(0, 4)}/how-bridges-carry-load.md`)?.includes('status: finished'), 'video saved as a finished one-off source');
  check(fake.file(dayFile(yesterday, 'how-bridges-carry-load')) !== null, "yesterday's learning written");
  await page.click('button:has-text("Done")');
  await page.waitForSelector('text=day streak');
  check((await page.textContent('.streak')).includes('2'), 'streak counts today and yesterday');
  check(await page.isVisible('.continue button:has-text("The Patient Mind")'), 'Today offers "Continue with" the book');
  await shot(page, '08-today');

  console.log('Library: finish a book, add to the reading list');
  await page.click('nav a:has-text("Library")');
  await page.click('.list a:has-text("The Patient Mind")');
  await page.waitForSelector('text=1 learning');
  await page.click('[aria-label="Change status"] button:has-text("Finished")');
  await page.click('[aria-label="4 stars"]');
  await page.fill('#takeaway', 'Focus is built, not found.');
  await shot(page, '09-finish');
  await page.click('.card button:has-text("Save")');
  await page.waitForSelector('.toast:has-text("Finished The Patient Mind")');
  const src2 = fake.file('sources/books/the-patient-mind.md');
  check(/status: finished/.test(src2) && /rating: 4/.test(src2) && src2.includes('## What I took from this\nFocus is built, not found.') && src2.includes('## Log'), 'finished book written with rating, takeaway and log');
  await shot(page, '10-source');
  await page.click('a.back:has-text("Library")');
  await page.click('button:has-text("+ Reading list")');
  await page.fill('#want-title', 'Notes on Craft');
  await page.fill('#want-author', 'Ruth Abara');
  await page.click('.card button:has-text("Add")');
  await page.waitForSelector('h1:has-text("Notes on Craft")');
  check(/status: want/.test(fake.file('sources/books/notes-on-craft.md') ?? ''), 'reading-list book saved as want');

  console.log('Recall');
  await page.click('nav a:has-text("Review")');
  await page.waitForSelector('h2.cue:has-text("How bridges carry load")');
  await page.click('button:has-text("Reveal")');
  check(await page.isVisible('.answer >> text=Arches turn weight'), 'reveal shows the learning');
  await page.click('.results button.remembered');
  await page.fill('input[aria-label="What does it mean to you now?"]', 'Like a team leaning on one person.');
  await shot(page, '11-recall');
  await page.click('button:has-text("Save answers")');
  await page.waitForSelector('text=Done for today');
  const vid = Object.values(json('.journal/index.json').entries).find((e) => e.learned.startsWith('Arches'));
  check(json('.journal/recall.json').items[vid.id].step === 1, 'remembered moves it up a step');
  const logFile = fake.paths().find((p) => p.startsWith('reviews/recall/'));
  check(!!logFile && fake.file(logFile).includes('**Remembered**') && fake.file(logFile).includes('Now: Like a team leaning on one person.'), 'recall log written');

  console.log('Weekly review');
  await page.click('.tabs a:has-text("Weekly")');
  await page.waitForSelector('text=Top learnings of the week');
  await page.click('.week-item button.star >> nth=0');
  await page.fill('#w-applied', 'Phone out of the room two mornings.');
  const q1 = await page.textContent('label[for="w-answer"]');
  await page.click('button[aria-label="Show a different question"]');
  const q2 = await page.textContent('label[for="w-answer"]');
  check(q1 !== q2, `↻ swaps the question ("${q1}" → "${q2}")`);
  await page.fill('#w-answer', 'The attention budget.');
  await page.fill('#w-start', 'A pre-send checklist.');
  await shot(page, '12-weekly');
  await page.click('button:has-text("Save review")');
  await page.waitForSelector('.toast');
  const wf = fake.paths().find((p) => p.startsWith('reviews/weekly/'));
  check(!!wf && fake.file(wf).includes('## What I applied\nPhone out of the room') && /top: \[/.test(fake.file(wf)) && fake.file(wf).includes(q2), 'weekly review written');
  check(json('.journal/followups.json').items.some((f) => f.text === 'Start: A pre-send checklist.'), "next week's start becomes a follow-up");

  console.log('History and search');
  await page.click('nav a:has-text("History")');
  await page.waitForSelector('.tl-item >> text=Attention is a budget');
  await page.fill('#search', 'arches');
  await page.waitForSelector('text=1 match');
  check(!(await page.isVisible('.tl-item >> text=Attention is a budget')), 'search filters the timeline');
  await shot(page, '13-history-search');
  await page.fill('#search', '');

  console.log('Draft survives a reload');
  await page.click('nav a:has-text("Today")');
  await page.click('.card:has-text("Attention is a budget") button:has-text("Edit")');
  await page.waitForSelector('text=Editing');
  await page.fill('#step-text', 'Attention is a budget, and sleep refills it.');
  await page.reload();
  await page.waitForSelector('text=Picked up your unsaved entry');
  check((await page.inputValue('#step-text')) === 'Attention is a budget, and sleep refills it.', 'draft restored after reload');
  await page.goto(URL + '#today');
  await page.waitForSelector('text=Unsaved entry');
  await page.click('button:has-text("Resume")');
  check((await page.inputValue('#step-text')) === 'Attention is a budget, and sleep refills it.', 'Today offers to resume the draft');

  console.log('Changed elsewhere');
  fake.write(dayFile(today, 'the-patient-mind'), fake.file(dayFile(today, 'the-patient-mind')).replace('Attention is a budget', 'Edited on GitHub'));
  for (let i = 0; i < 3; i++) await page.click('.flow-foot button.primary');
  await page.click('.flow-foot button:has-text("Save")');
  await page.waitForSelector('text=changed on GitHub or another device');
  check(fake.file(dayFile(today, 'the-patient-mind')).includes('Edited on GitHub'), 'did not overwrite the other edit');
  await shot(page, '14-conflict');
  await page.click('button:has-text("Save mine anyway")');
  await page.waitForSelector('h1:has-text("Saved")');
  check(fake.file(dayFile(today, 'the-patient-mind')).includes('sleep refills it'), 'saved after choosing to overwrite');
  check(json('.journal/followups.json').items.filter((f) => f.id.endsWith('-start') && f.text.startsWith('Start: Phone')).length === 1, 'editing does not duplicate follow-ups');

  console.log('A follow-up comes due');
  const items = json('.journal/followups.json').items.map((f) => (f.text.startsWith('Start: Phone') ? { ...f, due: today } : f));
  fake.write('.journal/followups.json', JSON.stringify({ version: 1, items }));
  await page.goto(URL + '#today');
  await page.reload();
  await page.waitForSelector('text=Did you try it?');
  check(await page.isVisible('nav .badge'), 'Today tab shows a dot');
  await page.click('.followup:has-text("Phone in another room") button.chip:has-text("Done")');
  await page.fill('textarea[aria-label^="What happened"]', 'Two mornings out of three.');
  await shot(page, '15-followup-due');
  await page.click('button:has-text("Save answers")');
  await page.waitForSelector('.toast');
  const done1 = json('.journal/followups.json').items.find((f) => f.text.startsWith('Start: Phone'));
  check(done1?.status === 'done' && done1.outcome === 'Two mornings out of three.', 'answer saved with what happened');

  console.log('Settings');
  await page.goto(URL + '#settings');
  await page.click('button:has-text("Rebuild from my files")');
  await page.waitForSelector('text=Rebuilt from 2 learnings');
  check(true, 'rebuild works');
  await shot(page, '16-settings');
  await ctx.close();

  console.log('Dark mode');
  const dark = await newPage({ ...devices['Pixel 7'], colorScheme: 'dark' });
  await dark.page.addInitScript((s) => localStorage.setItem('bookjournal.settings', s), SETTINGS);
  for (const [hash, wait, name] of [
    ['#today', 'text=Log a learning', '17-today-dark'],
    ['#library', '.list', '18-library-dark'],
    ['#history', '.tl-item', '19-history-dark'],
    ['#weekly', 'text=Top learnings of the week', '20-weekly-dark'],
  ]) {
    await dark.page.goto(URL + hash);
    await dark.page.waitForSelector(wait);
    await shot(dark.page, name);
  }
  await dark.page.goto(URL + '#today');
  await dark.page.click('button:has-text("Log a learning")');
  await dark.page.fill('#source-search', 'note');
  await dark.page.waitForSelector('.suggest');
  await shot(dark.page, '21-log-dark');
  await dark.ctx.close();

  console.log('Wide screen');
  const wide = await newPage({ viewport: { width: 1280, height: 860 } });
  await wide.page.addInitScript((s) => localStorage.setItem('bookjournal.settings', s), SETTINGS);
  for (const [hash, wait, name] of [
    ['#today', 'text=Log a learning', '22-today-wide'],
    ['#library/books/the-patient-mind', 'text=What I took from this', '23-library-wide'],
    ['#history', '.tl-item', '24-history-wide'],
    ['#weekly', 'text=Top learnings of the week', '25-weekly-wide'],
    ['#review', 'text=How recall works', '26-review-wide'],
  ]) {
    await wide.page.goto(URL + hash);
    await wide.page.waitForSelector(wait);
    await shot(wide.page, name);
  }
  await wide.ctx.close();
} catch (e) {
  failures++;
  console.error(e);
} finally {
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
