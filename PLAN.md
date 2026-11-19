# bookjournal: a phone-first learning journal saved to your own private GitHub repo

## In short

- **What:** a small web app you open once a day to note what you learned from a book, article, podcast, video, course or conversation. It takes about 3 minutes with one question per screen, or 20 seconds in quick mode. It also brings your ideas back on a spaced schedule so you keep them, asks "Did you try it?" about the plans you make, and gives you a short weekly learning review.
- **Where your data lives:** every entry is a Markdown file with YAML frontmatter, committed to a **private** repo (default name `bookjournal-data`). Each save is one commit. There's no server and no database, and git history keeps every version.
- **How:** a static Vite + React + TypeScript app in this **public** repo (`bookjournal`). It's published on GitHub Pages and talks only to `api.github.com`, using a fine-grained token that can reach the data repo and nothing else.
- **Reference:** it reuses the architecture and much of the code of [myjournal](https://github.com/infinitepal178/myjournal). The Appendix lists which file is reused, changed or new.
- **Cost:** free (GitHub free plan, GitHub Pages on a public repo).

## Decisions needed

Only #1 needs you. For the rest I've picked a default; tell me if you want something different.

| # | Decision | Recommendation | Why |
|---|----------|----------------|-----|
| 1 | **Which UI direction to build** (see `prototypes/`) | **B's guided capture + C's review queue on the phone, with A's two-pane library on wide screens** | You build and write on the phone, so capture has to be one thumb-sized question per screen (B). Recall works best as a short card deck with a tap-to-reveal (C). A's notebook layout is the best way to read a whole book's notes once the screen is wide enough. All three write the same files, so mixing them costs nothing in data. |
| 2 | Name of the private data repo | **`bookjournal-data`** (default; you type it on the Connect screen, so any name works) | Matches `myjournal-data`. If you've already created it under another name, just use that. |
| 3 | Recall schedule | **1 day → 1 week → 1 month → 3 months → 6 months, then retired.** "Fuzzy" repeats the same gap, "Forgot" restarts at 1 day. **At most 5 cards a day.** | A fixed ladder is easy to predict and to explain. The cap keeps a review session under 2 minutes, so the queue never turns into a chore. The gaps are editable in `config.json`. |
| 4 | How recall works | **You see the source and a hint first, try to recall the idea, then tap to reveal it** | Trying to recall before seeing the answer strengthens memory much more than re-reading. You can turn it off (`"recallReveal": false`) to see the idea straight away. |
| 5 | What gets reviewed | **Each key idea separately** (not whole entries). Quotes are optional extra cards (off by default). | One idea per card keeps each answer to a sentence. |
| 6 | Streak | **A day counts if you logged at least one learning, including quick mode.** Reviews don't count, but they show their own count. | Quick mode exists so a busy day doesn't break the streak. |
| 7 | Sources not yet started | **Add a "Want to read" status** next to reading / finished / abandoned | It gives the weekly review's "what to read next" something to pick from. |
| 8 | Weekly review day | **Sunday**, with a nudge on Today from Saturday | Same as myjournal. You can do it any day. |
| 9 | Book lookups (covers, author autocomplete) | **No.** You type the title and author. | Lookups would mean talking to a second website (Open Library or Google Books) and loosening the security policy. Typing a title takes 10 seconds and only happens once per book. |
| 10 | Encrypting entries | **Off** (same as myjournal) | Plain Markdown stays readable in the GitHub app. The repo is private and the token is scoped to it. |

---

## How it works

```
 ┌────────────────────────────┐   GitHub REST API (HTTPS only)   ┌────────────────────────────────┐
 │  bookjournal (PUBLIC)      │ ── read files / one commit ────▶ │  bookjournal-data (PRIVATE)    │
 │  static site, GitHub Pages │      per save (Git Data API)     │  Markdown + YAML frontmatter   │
 │  React + Vite + TS         │ ◀── file tree, contents ──────── │  .journal/*.json for the app   │
 └────────────────────────────┘                                  └────────────────────────────────┘
        ▲  token kept in this browser only (localStorage): only the data repo, Contents read & write
        │  unsaved drafts stay in this browser until the save succeeds
      You (phone)
```

- **Two repos.** `bookjournal` holds the app and is public, so GitHub Pages is free. It never contains entries, tokens or personal details. `bookjournal-data` holds your entries and stays private.
- **One save = one commit.** The app uses the Git Data API (blobs → tree → commit → move `main`), so an entry, its source file, the index and any follow-up land together, with a message like `learning: The Patient Mind · 2026-11-18`. If another device pushed in between, the app re-reads and retries (up to 3 times).
- **Changed-elsewhere detection.** The app remembers each file exactly as it loaded it. Before writing, it compares that copy with the file at the current head. If they differ (an edit on GitHub or another phone), it stops and shows you both versions rather than overwriting.
- **Fast loading.** One call (`git/trees/main?recursive=1`) lists every path, which is enough for the calendar and streak. `.journal/index.json` holds a short summary of every entry and source, so search, the library and the weekly review load from one file. Full entries are fetched only when you open them.
- **Rebuildable.** `index.json` and `recall.json` can be rebuilt from the Markdown (Settings → Rebuild), so editing files by hand on GitHub never breaks anything permanently.

## Your data repo is organised by source and by day

```
bookjournal-data/                                (private)
├── README.md                                    what this repo is (written on first run)
├── sources/
│   ├── books/the-patient-mind.md                one file per source: details, status, rating,
│   ├── courses/intro-to-statistics.md             and "what I took from this" when finished
│   ├── articles/2026/why-checklists-beat-willpower.md
│   ├── podcasts/2026/learning-loop-41-spacing.md
│   ├── videos/2026/how-bridges-carry-load.md
│   └── conversations/2026/coffee-with-jo.md
├── daily/
│   └── 2026/11/2026-11-18/
│       ├── the-patient-mind.md                  one file per source per day
│       ├── why-checklists-beat-willpower.md
│       └── quick.md                             quick-mode notes with no source
├── reviews/
│   ├── recall/2026/2026-11.md                   every recall answer that month, newest first
│   └── weekly/2026/2026-W47.md                  weekly learning review
├── followups.md                                 "I'll try X" plans and what happened (readable)
└── .journal/
    ├── config.json                              your prompts, topics and recall settings (safe to edit)
    ├── index.json                               summaries for search, stats, library (rebuildable)
    ├── recall.json                              where each idea is on the recall schedule (rebuildable)
    └── followups.json                           follow-up data used by the app
```

Changes from your proposal, and why:

- **Every source type has a folder.** Books and courses are long-lived and few, so they sit flat (`sources/books/`). Articles, podcasts, videos and conversations are many and short-lived, so they're grouped by year.
- **A source's ID is its path** without `sources/` and `.md`, e.g. `books/the-patient-mind`. The slug is fixed when the source is created. Renaming the title later changes nothing on disk, so links never break. Slugs are unique across all types, so the daily filename `<slug>.md` is never ambiguous.
- **A second session with the same source on the same day** adds to that day's file rather than making a new one.
- **Recall answers go in one readable log per month** (`reviews/recall/YYYY/YYYY-MM.md`), and the schedule lives in `.journal/recall.json`. The log is what you read; the JSON is what the app uses, and it can be rebuilt by replaying the log.
- **Weekly reviews** live in `reviews/weekly/` as you proposed.

## File formats

Each file is Markdown that reads well in the GitHub app. Frontmatter holds the structured data and the body holds your writing. Each key idea carries a short ID in an HTML comment (`<!-- id:k7f2 -->`). GitHub doesn't display it, and it lets recall, connections and the weekly review point at one exact idea.

### A source: `sources/books/the-patient-mind.md`

```markdown
---
type: book
title: The Patient Mind
author: Ana Ferreira
link: https://example.com/the-patient-mind
status: reading            # want | reading | finished | abandoned
pages: 312                 # optional; lets the app show %
progress: { page: 142, percent: 46 }
started: 2026-11-02
finished:
rating:                    # 1–5, set when finished
topics: [focus, habits]
created: 2026-11-02T08:10:00
updated: 2026-11-18T21:40:12
---
# The Patient Mind
Ana Ferreira · book · reading, p. 142 of 312 (46%)

## What I took from this
_Written when I finish it._

## Log
- [18 Nov 2026](../../daily/2026/11/2026-11-18/the-patient-mind.md) · pp. 120–142 · 2 ideas
- [12 Nov 2026](../../daily/2026/11/2026-11-12/the-patient-mind.md) · pp. 88–120 · 1 idea
```

When you finish a source, the app fills `finished`, `rating`, the **What I took from this** paragraph, **Top ideas** (up to 3 picked from its entries) and an optional **Recommend to** line. The **Log** list is regenerated from the index on every save, so you can browse a book's notes on GitHub.

### A day's learning: `daily/2026/11/2026-11-18/the-patient-mind.md`

```markdown
---
type: learning
date: 2026-11-18
source: books/the-patient-mind
mode: full                 # full | quick
progress: { from: 120, to: 142, unit: page, chapter: "6. The attention budget" }
quote: { page: 131 }
apply: { followup: 2026-11-18-x81q, due: 2026-11-21 }
connects: [m3c9, articles/2026/why-checklists-beat-willpower]
topics: [focus, attention]
created: 2026-11-18T21:31:02
updated: 2026-11-18T21:40:12
---
# The Patient Mind · Wed 18 Nov 2026
pp. 120–142 · Ch. 6 The attention budget

## Key ideas
1. Attention is a budget: every notification spends a little, even the ones I ignore. <!-- id:k7f2 -->
2. Deep work needs a start ritual more than it needs willpower. <!-- id:p2d8 -->

## Worth keeping
> A quiet hour is built, not found. (p. 131)

## I'll try
Phone in another room for the first hour of work, Mon–Wed. Ask me on Fri 21 Nov.

## Connects to
- *A checklist is for the steps experts skip* · [Why Checklists Beat Willpower](../../../../sources/articles/2026/why-checklists-beat-willpower.md)
- #focus #attention

## Question it raised
Does the budget refill with sleep, or with short breaks during the day?
```

A **quick-mode** entry is the same file with `mode: quick` and just `## Key ideas` holding one line. With no source it goes in `quick.md` for that day, one line per note.

### Recall log: `reviews/recall/2026/2026-11.md`

```markdown
---
type: recall-log
month: 2026-11
---
# Recall · November 2026

## Thu 19 Nov
- **Remembered** · *Attention is a budget: every notification spends a little…* <!-- id:k7f2 -->
  ([The Patient Mind, 18 Nov](../../../daily/2026/11/2026-11-18/the-patient-mind.md)) · next in 1 week
  Now: I notice it most on Mondays. Turned off badge counts for chat.
- **Fuzzy** · *Review when it feels slightly hard* <!-- id:r5n1 --> · again in 1 week
```

### Recall schedule: `.journal/recall.json`

```json
{ "version": 1,
  "ideas": {
    "k7f2": { "step": 1, "due": "2026-11-26", "last": "2026-11-19", "results": ["remembered"] },
    "r5n1": { "step": 1, "due": "2026-11-26", "last": "2026-11-19", "results": ["remembered", "fuzzy"] },
    "a0b4": { "retired": "2026-10-02", "reason": "not worth keeping" } } }
```

### Weekly review: `reviews/weekly/2026/2026-W47.md`

```markdown
---
type: weekly
week: 2026-W47
start: 2026-11-16
end: 2026-11-22
stats: { days: 5, sources: 4, pages: 74, ideas: 9, recalled: 11, remembered: 8, applied: 2 }
top: [k7f2, c1x0, r5n1]
next: books/notes-on-craft
question: Which idea this week changed what you do, not just what you know?
---
# Weekly learning review · 16–22 Nov 2026

## Top ideas
1. Attention is a budget… (The Patient Mind)
…
## What I applied
- ✓ Phone in another room for the first hour. Two of three days, and those mornings were my best.
## What to read next
Notes on Craft, because the checklist article made me want the long version.
## Which idea this week changed what you do, not just what you know?
…
## Next week I'll try
Ask for the 5-minute pre-mortem in Tuesday's planning. → follow-up Fri 27 Nov
```

### Follow-ups: `.journal/followups.json` + `followups.md`

The same format as myjournal (`id, text, created, due, source, status, outcome, closed, snoozed`). `source` points at the entry file, so the Library shows "tried it ✓" next to the idea it came from.

### Config: `.journal/config.json`

```json
{
  "version": 1,
  "builtInPrompts": true,
  "weeklyQuestions": ["What did I read this week that I disagree with?"],
  "topics": ["focus", "habits", "statistics", "writing"],
  "recallIntervals": [1, 7, 30, 90, 180],
  "recallPerDay": 5,
  "recallReveal": true,
  "recallQuotes": false,
  "weeklyDay": "sunday"
}
```

### Index: `.journal/index.json` (rebuildable)

```json
{ "version": 1, "updated": "2026-11-18T21:40:12",
  "sources": { "books/the-patient-mind": { "type": "book", "title": "The Patient Mind", "author": "Ana Ferreira",
               "status": "reading", "percent": 46, "last": "2026-11-18", "entries": 6 } },
  "entries": { "2026-11-18/the-patient-mind": { "source": "books/the-patient-mind", "mode": "full",
               "ideas": [{ "id": "k7f2", "text": "Attention is a budget…" }], "quote": "A quiet hour is built, not found.",
               "topics": ["focus"], "question": "Does the budget refill…", "connects": ["m3c9"], "pages": 22 } } }
```

## Screens

The tab bar has **Today · Library · Review · History**. Settings is behind the gear on Today. Page addresses use the hash (`#today`, `#log`, `#library`, `#source/books/the-patient-mind`, `#review`, `#weekly`, `#history`), so the browser's back button works and you can save a home-screen bookmark to any screen.

| Screen | What you do | What gets written |
|--------|-------------|-------------------|
| **Connect** (first run per device) | Type `infinitepal178/bookjournal-data` and paste the token. The app checks that the repo is private and that it can write, then creates README, config, index and recall files if they're missing. | `README.md`, `.journal/*.json` |
| **Today** | See what's due: follow-ups ("Did you try it?"), recall cards waiting, and the weekly review on Sunday. Big buttons: **Log a learning**, **Quick note**, and **Continue: The Patient Mind · p. 142**. Shows the streak. | Follow-up answers → `.journal/followups.json`, `followups.md` |
| **Log a learning** | One question per screen, about 3 min: 1 Source (pick a recent one or add new: type, title, author, link) → 2 Progress (page, chapter or %) → 3 Key ideas (1–3, your own words) → 4 Worth keeping (quote + page, skippable) → 5 I'll try (and when to ask: tomorrow / weekend / next week / pick a date / don't ask) → 6 Connects to (earlier ideas, sources, topics) → 7 One question it raised → 8 Check & save. Drafts survive closing the tab. | `daily/…/<slug>.md`, `sources/…/<slug>.md`, `.journal/index.json`, `recall.json`, follow-ups. All in one commit. |
| **Quick note** | One sentence, source pre-filled with the last one you used (or none). Save. | `daily/…/<slug>.md` (`mode: quick`) or `daily/…/quick.md` |
| **Library** | Filter by Reading / Want / Finished / Abandoned and by type. Each source shows its progress, last date and number of ideas. Open one to see every entry, idea, quote and follow-up for it, plus its open questions. **Finish** asks for a rating, a "what I took from this" paragraph, your top 3 ideas and who you'd recommend it to. **Abandon** asks for one line on what you got anyway. **Add to reading list** creates a Want source. | `sources/…/<slug>.md`, `.journal/index.json` |
| **Review → Recall** | Up to 5 cards due today. Each card shows the source and a hint (chapter, topics), then you try to recall and tap **Reveal**. Answer **Remembered / Fuzzy / Forgot**, then optionally "What does it mean to me now?". **Retire** removes an idea that isn't worth keeping. One commit per session. | `reviews/recall/YYYY/YYYY-MM.md`, `.journal/recall.json` |
| **Review → Weekly** | The week in numbers (days, sources, pages, ideas, recall rate), then pick your top 3 ideas → what you applied (follow-ups closed this week are listed for you) → what to read next (pick from Want or add) → a rotating deeper question with ↻ → one thing to try next week (becomes a follow-up). | `reviews/weekly/YYYY/YYYY-Www.md`, follow-ups |
| **History** | A month calendar (dots per day, ring for quick-only days), current and best streak, and search across ideas, quotes, sources, topics and questions. Tap a day or a result to open the entry, edit it, or open it on GitHub. Also lists all follow-ups and open questions. | read only (edits go through the Log flow) |
| **Settings** | Edit prompts and topics (opens `config.json` on GitHub), rebuild the index, see the connected repo, disconnect this device. | `.journal/index.json`, `recall.json` (rebuild) |

The clickable wireframes in `prototypes/` show these screens in three styles. Open `prototypes/index.html` (or the artifact link) to compare them.

### The recall schedule in detail

- A new idea is first due **1 day** after it's logged.
- **Remembered** moves it one step up the ladder (`1 → 7 → 30 → 90 → 180` days). After the 6-month review it's **retired as learned**. It still appears in search, the library and History, just not in the queue.
- **Fuzzy** repeats the same gap. **Forgot** goes back to 1 day.
- The next date is counted from the day you review, so falling behind never creates a pile-up of overdue cards.
- At most `recallPerDay` (5) cards a day, oldest first. The rest wait until tomorrow and are shown as "+3 waiting".
- **Retire** at any time: "not worth keeping" or "I know this now".

## Roadmap: build in phases, each one tested before the next

| Phase | Scope | Test before moving on |
|-------|-------|-----------------------|
| **1. Plan + prototypes** ⏸ | This file; three clickable prototypes in `prototypes/` and one artifact link to compare them | You pick a direction, or a mix (Decision 1). |
| **2a. Core** | Project setup from myjournal; Connect; Today; the Log flow with all 8 steps and quick mode; sources (create, pick recent, progress); follow-ups; drafts; changed-elsewhere detection; dark mode; manifest and icons; CSP; Pages and CI workflows | Unit tests: the Markdown round-trip for every file type, slugs, dates, saving against the fake GitHub (one commit, retries, conflicts). Playwright at phone size: connect → log full → log quick → reopen and edit. |
| **2b. Library** | Library list and filters, source page, finish / abandon / reading list, regenerated **Log** section in source files | Unit: source file round-trip, Log regeneration. Playwright: finish a book and check `sources/books/…md` in the fake repo. |
| **2c. Review** | Recall queue with reveal, answers, retire, monthly log; weekly review with stats, picks and ↻ question | Unit: the recall ladder (remembered / fuzzy / forgot / late / cap / retire), rebuilding `recall.json` from the log, weekly stats. Playwright: answer 3 cards, complete a weekly review. |
| **2d. History** | Calendar, streaks, search, entry viewer with "open on GitHub", follow-ups list, open questions | Unit: streaks, search ranking. Playwright: find an idea by a quote word. Screenshots at phone size, in dark mode and on a wide screen, all checked and fixed by me before handover ⏸ |
| **3. Real use** | Fixes and improvements from what you report after a week or two | You've logged 7 days without opening GitHub to fix anything, and a recall session takes under 2 minutes. |

## What could go wrong, and how the plan handles it

- **Token leak.** The token is stored in your browser, so any script running on the page could read it. *Mitigation:* the token reaches only the data repo with Contents read/write; the app loads no third-party scripts; a strict Content-Security-Policy lets the page talk only to `api.github.com`; set a token expiry; and you can revoke it in one tap on GitHub.
- **Real entries ending up in the public repo.** *Mitigation:* the app never writes to its own repo. All test and prototype data is made up (the fictional *The Patient Mind* by "Ana Ferreira" and friends). The fake GitHub used in tests lives in memory.
- **Losing a half-written entry.** *Mitigation:* every step autosaves to browser storage, and the draft is cleared only after the commit succeeds. If you're offline, the draft waits.
- **Editing on two devices.** *Mitigation:* the changed-elsewhere check stops the save and shows both versions; `index.json`, `recall.json` and follow-ups are re-read and merged inside the commit retry.
- **Review fatigue.** A spaced queue that grows every day is the most common reason people stop. *Mitigation:* the 5-card cap, Retire, retiring after 6 months, and late reviews that don't pile up.
- **Capture fatigue.** Eight screens is too many on a tired evening. *Mitigation:* every step after Key ideas can be skipped; there's a quick note from Today; and "Continue: <book>" skips step 1.
- **Hand edits on GitHub.** You might edit a file in the GitHub app and break its format. *Mitigation:* the parser is lenient (unknown fields are kept, missing ones get defaults), IDs survive edits because they sit on the idea's own line, and Rebuild re-creates the JSON files.
- **Slug collisions.** Two sources might share a title, e.g. two podcasts both called "Episode 12". *Mitigation:* add the author or year, then `-2`, and check against the index.
- **API limits.** 5,000 requests an hour per token; a session uses about 10–30.
- **Copyright of quotes.** Short highlights in a private repo for personal study are fine. The public repo never holds any.

## Next steps

1. Open the artifact link (or `prototypes/index.html`) on your phone and click through A, B and C.
2. Reply with your pick or your mix (Decision 1), plus any change to Decisions 2–10.
3. Create the private data repo if you haven't already (Appendix B, about 1 minute in the mobile browser).
4. I build Phase 2 and push it to `main`, then send you the Pages and token steps (Appendix B).

---

## Appendix

### A. What's reused from myjournal

| myjournal file | In bookjournal |
|----------------|----------------|
| `src/lib/github.ts` | **Reused as is.** Git Data API single-commit save with `prepare(head)` re-run on 422, error explanations. |
| `src/lib/store.ts` | Reused; keys renamed to `bookjournal.*`. |
| `src/lib/dates.ts` | Reused; adds `addMonths` and "in 3 months" labels for recall. |
| `src/lib/followups.ts`, `components/FollowUps.tsx`, `screens/FollowUps.tsx` | Reused; adds a "pick a date" option and links back to the entry and idea. |
| `src/lib/journal.ts` | Same pattern (overview, load, save with conflict check inside `commit`), rewritten for sources, learnings, recall and weekly. |
| `src/lib/entries.ts` | Rewritten: source, learning, quick, recall log and weekly formats, with the same frontmatter split and lenient parsing. |
| `src/lib/journalIndex.ts` | Rewritten: sources + entries index, streaks (same algorithm), search, weekly stats. |
| `src/lib/prompts.ts` | Same rotation; new library of about 40 deeper weekly questions about learning. |
| `src/lib/config.ts` | New fields (topics, recall settings). |
| New: `src/lib/recall.ts` | The ladder, the daily queue, rebuilding from the log. |
| `src/components/ui.tsx`, `styles.css` | Reused as the base; new screens. |
| `screens/Connect.tsx`, `Settings.tsx` | Reused with new copy. |
| `tests/fake-github.mjs`, `tests/e2e/run.mjs` | Reused; the e2e run gains dark-mode and wide-screen passes. |
| `vite.config.ts` (CSP), `index.html`, `public/manifest.webmanifest`, `.github/workflows/ci.yml`, `deploy-pages.yml` | Reused with the new name and a new icon. |

Dependencies stay the same and pinned: `react`, `react-dom`, `yaml`; dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, types. Playwright is the one preinstalled for e2e and isn't added to `package.json`.

### B. Setup steps, all from a phone

**Private data repo (before Phase 2, about 1 minute)**
1. In your phone's browser, open `https://github.com/new`.
2. Repository name: `bookjournal-data`. Choose **Private**. Tick **Add a README file** (optional; the app also handles an empty repo). Tap **Create repository**.

**Pages (once Phase 2 is on `main`)**
1. Open `https://github.com/infinitepal178/bookjournal/settings/pages` in the browser. If the page looks cramped, use the browser menu → **Desktop site**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**. Nothing else to fill in.
3. The next push to `main` publishes the app at `https://infinitepal178.github.io/bookjournal/`. Progress shows in the GitHub app under the repo → **Actions**.

**Token (once the app is live)**
1. Open `https://github.com/settings/personal-access-tokens/new`.
2. Token name `bookjournal phone`; Expiration 1 year (or your choice).
3. Repository access: **Only select repositories** → `bookjournal-data`.
4. Permissions → Repository permissions → **Contents: Read and write** (Metadata: Read-only is added automatically). Nothing else.
5. **Generate token**, copy it, open the app, paste it on Connect. Keep a copy in your password manager for other devices.
6. In the browser menu, **Add to Home screen**.

### C. Commit messages

`learning: The Patient Mind · 2026-11-18`, `quick: 2026-11-18`, `finished: The Patient Mind`, `recall: 4 ideas · 2026-11-19`, `weekly review: 2026-W47`, `follow-ups`, `Set up journal`, `Rebuild index`.

### D. Built-in weekly questions (sample; about 40 in the app)

- Which idea this week changed what you do, not just what you know?
- What did you read that you disagree with, and why?
- Which two sources said the same thing in different words?
- What would you explain to a friend over dinner from this week?
- Which source isn't worth finishing?
- What question keeps coming back across your reading?
- What did you learn from a person rather than a page?
- If you could only keep one note from this month, which one?

### E. Ideas parked for later

- Import Kindle highlights (`My Clippings.txt` uploaded from the phone) into a source's quotes.
- A monthly "reading year" page: books finished, ratings, top ideas, as a readable `reviews/monthly/` file.
- Topic pages: everything tagged `#focus` across sources, with its connections drawn as a small graph.
- An AI summary of a finished book's notes or of the week. This needs a small server and a separate API key, so it's out of scope for a static app.
- Book metadata lookups (Decision 9) if typing titles ever becomes annoying.
