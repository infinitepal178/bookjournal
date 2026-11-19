# bookjournal: a phone-first learning journal saved to your own private GitHub repo

## In short

- **What:** a small web app you open once a day to note what you learned from a book, video, article, podcast, course or conversation. Four short questions, one per screen: **What did you learn today? What will you continue doing? Stop doing? Start doing?** Your learnings come back on a spaced schedule so you keep them, the app asks "Did you try it?" about your start/stop plans, and there's a weekly learning review.
- **Where your data lives:** every entry is a Markdown file with YAML frontmatter, committed to a **private** repo (default name `bookjournal-data`). Each save is one commit. There's no server and no database.
- **How:** a static Vite + React + TypeScript app in this **public** repo, published on GitHub Pages. It talks only to `api.github.com`, using a fine-grained token that can reach the data repo and nothing else.
- **Reference:** the architecture and much of the code come from [myjournal](https://github.com/infinitepal178/myjournal). Appendix A lists what was reused.

## Status

- **Phase 1 (plan + prototypes): done.** You chose **B's guided setup** for logging and Today, and **A's structure for Review and History**. You also asked for:
  - fewer questions: only a title for the source (plus the author for a book);
  - the four questions above, tagged to the source;
  - sources that work like tags: type and matches pop up, and anything new becomes a new source.
- **Phase 2 (build): done.** Everything below is built and tested: unit tests, plus a browser run-through at phone size, in dark mode and on a wide screen. ⏸ Waiting for you to set up Pages and the token (Appendix B) and try it.
- **Phase 3:** improvements from what you report after real use.

## Decisions

| # | Decision | Outcome |
|---|----------|---------|
| 1 | UI direction | **Decided:** B's one-question-per-screen flow and Today; A's calm recall list, two-column weekly review, and calendar + timeline History. On wide screens the Library shows the list and the source side by side. |
| 2 | What a learning asks | **Decided:** source (title, plus author for books and courses), then *What did you learn today?* (required), *continue*, *stop*, *start* (each skippable). No progress, quotes or connections; these can come back later if you miss them. |
| 3 | How you pick a source | **Decided:** type-ahead. Typing shows matching sources by title or author (recent ones first); anything new is added as a source on first use. The first screen also lists your recent sources, and Today has "Continue with" buttons. |
| 4 | Which plans get a "Did you try it?" | **Default:** *stop* and *start* lines ask after **1 week** (chips: 3 days, a week, 2 weeks, don't ask). *Continue* lines don't. The weekly "Next week I'll start…" asks a week after the review. |
| 5 | Recall schedule | **Default:** 1 day → 1 week → 1 month → 3 months → 6 months, then learned for good. Fuzzy repeats the gap, Forgot restarts. At most 5 a day. Editable in `config.json`. |
| 6 | How recall works | **Default:** you see the source and day, try to remember, then tap **Reveal** and answer Remembered / Fuzzy / Forgot, with an optional "What does it mean to you now?". **Retire** removes one that isn't worth keeping. |
| 7 | Source status | **Default:** books and courses start as *Reading*; one-offs (videos, articles, podcasts, conversations) start as *Finished*. *Want to read* (reading list) and *Abandoned* are there too. Logging from a reading-list book moves it to *Reading*. |
| 8 | Streak | **Default:** a day counts when you log at least one learning. |
| 9 | Weekly review day | **Default:** Sunday (shows on Today for two days after). Any week can be opened from Review. |
| 10 | Data repo name | **Default:** `bookjournal-data`. You type it on the Connect screen, so any name works. |
| 11 | Book lookups, encryption | **No** for both. The app only ever talks to GitHub, and plain Markdown stays readable in the GitHub app. |

---

## How it works

```
 ┌────────────────────────────┐   GitHub REST API (HTTPS only)   ┌────────────────────────────────┐
 │  bookjournal (PUBLIC)      │ ── read files / one commit ────▶ │  bookjournal-data (PRIVATE)    │
 │  static site, GitHub Pages │      per save (Git Data API)     │  Markdown + YAML frontmatter   │
 │  React + Vite + TS         │ ◀── file tree, contents ──────── │  .journal/*.json for the app   │
 └────────────────────────────┘                                  └────────────────────────────────┘
        ▲  token kept in this browser only: only the data repo, Contents read & write
        │  unsaved drafts stay in this browser until the save succeeds
      You (phone)
```

- **One save = one commit.** The Git Data API writes blobs, then a tree, then a commit, then moves `main`. A learning, its source file, the index, the recall schedule and any follow-ups land together, as `learning: The Patient Mind · 2026-11-18`. If another device pushed in between, the app re-reads the shared files and retries (up to 3 times).
- **Changed-elsewhere detection.** Before writing a learning or weekly review, the app compares the file at the current head with the copy it loaded. If they differ, it stops and offers **Save mine anyway** or **Use the newer version**.
- **Fast loading.** One call lists every path. `.journal/index.json` holds every source and learning in short form, so Today, Library, Review, History and search load from one file.
- **Rebuildable.** `index.json` and `recall.json` can be rebuilt from the Markdown (Settings → Rebuild).

## Your data repo

```
bookjournal-data/                                (private)
├── README.md                                    written on first run
├── sources/
│   ├── books/the-patient-mind.md                one file per source: status, rating,
│   ├── courses/intro-to-statistics.md             "what I took from this", and a log of entries
│   ├── videos/2026/how-bridges-carry-load.md    one-offs are grouped by year
│   ├── articles/2026/…  podcasts/2026/…  conversations/2026/…  other/2026/…
├── daily/2026/11/2026-11-18/
│   └── the-patient-mind.md                      one file per source per day
├── reviews/
│   ├── recall/2026/2026-11.md                   every recall answer that month, newest day first
│   └── weekly/2026/2026-W47.md                  weekly learning review
├── followups.md                                 start/stop plans and what happened (readable)
└── .journal/
    ├── config.json                              your settings (safe to edit)
    ├── index.json                               summary for the app (rebuildable)
    ├── recall.json                              recall schedule (rebuildable)
    └── followups.json                           follow-up data
```

A source's ID is its path without `sources/` and `.md` (e.g. `books/the-patient-mind`). It's fixed when created, so renaming the title never breaks links. Slugs are unique across all types.

## File formats

### A day's learning: `daily/2026/11/2026-11-18/the-patient-mind.md`

```markdown
---
type: learning
date: 2026-11-18
source: books/the-patient-mind
id: k7f2
followups: [k7f2-stop, k7f2-start]
created: 2026-11-18T21:31:02
updated: 2026-11-18T21:40:12
---
# The Patient Mind · Wed 18 Nov 2026
From [The Patient Mind](../../../../sources/books/the-patient-mind.md)

## What I learned
Attention is a budget: every notification spends a little, even the ones I ignore.

## Stop
Checking chat in the first hour of work.

## Start
Phone in another room for the first hour.
```

Empty sections are left out (`## Continue` here). A second session with the same source on the same day edits this file.

### A source: `sources/books/the-patient-mind.md`

```markdown
---
type: book
title: The Patient Mind
author: Ana Ferreira
status: finished           # want | reading | finished | abandoned
rating: 4
started: 2026-11-02
finished: 2026-11-30
---
# The Patient Mind
Ana Ferreira · book · finished · ★★★★☆

## What I took from this
Focus is built, not found.

## Log
- [Wed 18 Nov 2026](../../daily/2026/11/2026-11-18/the-patient-mind.md) · Attention is a budget…
```

The **Log** list is regenerated on every save. Any other `## Section` you add by hand on GitHub is kept.

### Recall log: `reviews/recall/2026/2026-11.md`

```markdown
## Thu 19 Nov 2026 <!-- date:2026-11-19 -->
- **Remembered** · [The Patient Mind, Wed 18 Nov 2026](../../../daily/…/the-patient-mind.md): Attention is a budget… <!-- recall:k7f2 --> · next in 1 week
  Now: I notice it most on Mondays.
```

### Weekly review: `reviews/weekly/2026/2026-W47.md`

Frontmatter holds `stats` (days, sources, learnings, recalled, remembered, follow-ups done), the IDs of your `top` 3 learnings and the `question`. The body has **Top learnings**, **What I applied**, **What to read next**, your answer to the rotating question, and **Next week I will start**.

### Settings: `.journal/config.json`

```json
{
  "version": 1,
  "builtInPrompts": true,
  "weeklyQuestions": ["What did I read this week that I disagree with?"],
  "recallIntervals": [1, 7, 30, 90, 180],
  "recallPerDay": 5,
  "weeklyDay": "sunday",
  "followUpDays": 7
}
```

## Screens

The tab bar has **Today · Library · Review · History**. It sits at the bottom on phones and at the top on wide screens. Settings is the gear on Today. Addresses use the hash (`#today`, `#library/books/the-patient-mind`, `#review`, `#weekly/2026-W47`, `#history/2026-11-18`, `#followups`, `#settings`).

| Screen | What you do |
|--------|-------------|
| **Connect** | Type `infinitepal178/bookjournal-data`, paste the token. The app checks the repo is private and writable, and creates README and `.journal/*` if missing. |
| **Today** | **Log a learning**; **Continue with** your current books; what you logged today (Edit); **Did you try it?** for due follow-ups; recall cards waiting; the weekly review on Sunday; your streak. |
| **Log a learning** | 1 **What did you learn from?**: type-ahead over your sources, a recent list, "Add …" for a new one (type chips, plus author for books), and Today / Yesterday / another day. 2 **What did you learn today?** 3 **Continue** 4 **Stop** 5 **Start**, with "ask me how it went" chips on 4 and 5. **Save** appears once step 2 is filled. Drafts survive closing the tab. |
| **Library** | Filter by status and type. Open a source to see every learning, its follow-ups, **Log a learning from this**, change status, **Finish** (rating + "What I took from this"), **Abandon** (why), edit title or author, and **Open on GitHub**. **+ Reading list** adds a book you want to read. |
| **Review → Recall** | Up to 5 cards a day: source, day and which review it is. **Reveal**, then Remembered / Fuzzy / Forgot (each shows when it comes back), an optional note, or **Retire**. **Save answers** is one commit. The side column explains the ladder and what's waiting. |
| **Review → Weekly** | Left: the week in numbers, its learnings (star your top 3), and the follow-ups closed that week. Right: top learnings, what you put into practice, what to read next (your reading list as chips), a rotating deeper question with **↻**, and "Next week I'll start…" (becomes a follow-up). Earlier weeks via ‹ ›. |
| **History** | Left: month calendar (a dot on days you logged; tap a day) and a link to all follow-ups. Right: search across learnings, continue / stop / start and source titles, and the timeline with **Edit** and **Open on GitHub**. |
| **Follow-ups** | Due, coming up, and what happened, with Google Calendar links. |
| **Settings** | The connected repo, a summary of your settings and **Edit settings on GitHub**, **Rebuild**, **Disconnect this device**. |

## Roadmap and tests

| Phase | Scope | Test |
|-------|-------|------|
| 1. Plan + prototypes | `PLAN.md`, `prototypes/` (A, B, C and the comparison page) | ✓ You chose a direction. |
| 2. Build | Everything in **Screens**, plus dark mode, home-screen manifest and icons, strict CSP, Pages and CI workflows, and a demo build for previews | ✓ `npm test`: 28 unit tests covering file formats, slugs, dates, the recall ladder and log, search, streaks, and saving against an in-memory GitHub (one commit, retry, conflict, rebuild). ✓ `npm run e2e`: 61 browser checks at phone size, in dark mode and at 1280 px; 26 screenshots reviewed. |
| 3. Real use | Fixes and improvements from your reports | You've logged 7 days without opening GitHub to fix anything, and a recall session takes under 2 minutes. |

## What could go wrong, and how it's handled

- **Token leak.** The token reaches only the data repo; the app loads no third-party scripts; the Content-Security-Policy allows network calls only to `api.github.com` (fonts are bundled). Give the token an expiry; revoke it in one tap.
- **Real entries in the public repo.** The app never writes to its own repo. Tests, the demo and the prototypes use made-up data only.
- **Losing a half-written entry.** Drafts autosave in the browser and are cleared only after a successful commit.
- **Two devices.** The changed-elsewhere check covers the files you wrote; shared files are merged inside the commit retry.
- **Review fatigue.** The 5-a-day cap, Retire, retiring after 6 months, and late reviews that don't pile up.
- **Hand edits on GitHub.** Lenient parsing, unknown sections kept, and **Rebuild**.

---

## Appendix

### A. What came from myjournal

| myjournal | bookjournal |
|-----------|-------------|
| `src/lib/github.ts` | Reused as is: one-commit saves with retry, error messages |
| `src/lib/store.ts`, `dates.ts`, `followups.ts`, `components/FollowUps.tsx`, `screens/FollowUps.tsx`, `screens/Connect.tsx` | Reused with small changes |
| `src/lib/journal.ts`, `journalIndex.ts`, `entries.ts`, `config.ts`, `prompts.ts` | Same patterns, rewritten for sources, learnings, recall and the weekly review |
| New | `src/lib/recall.ts`, `screens/Log.tsx`, `Library.tsx`, `Review.tsx`, `src/demo.ts` |
| `tests/fake-github.mjs`, `tests/e2e/run.mjs`, `vite.config.ts`, workflows, manifest | Reused; new e2e scenario, new icon, fonts bundled locally |

Dependencies (pinned): `react`, `react-dom`, `yaml`; dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, types. The e2e run uses the Playwright that's preinstalled where it runs.

### B. Setup, all from a phone

**1. Private data repo (1 minute).** In your phone's browser open `https://github.com/new`. Name it `bookjournal-data`, choose **Private**, and tap **Create repository**. An empty repo is fine.

**2. Make `main` the default branch of this repo (1 minute).** Open `https://github.com/infinitepal178/bookjournal/settings` (use the browser menu → **Desktop site** if the page is cramped). Under **Default branch**, tap the ⇄ switch button, choose **main**, then **Update** and confirm. GitHub Pages only deploys from the default branch.

**3. Turn on Pages.** Open `https://github.com/infinitepal178/bookjournal/settings/pages`. Under **Build and deployment → Source**, choose **GitHub Actions**. Then open the repo's **Actions** tab, pick **Deploy to GitHub Pages**, and tap **Run workflow** (or wait for the next push). The app appears at `https://infinitepal178.github.io/bookjournal/`.

**4. Token.** Open `https://github.com/settings/personal-access-tokens/new`. Name `bookjournal phone`, expiration 1 year. **Repository access → Only select repositories → `bookjournal-data`**. **Permissions → Repository permissions → Contents: Read and write**; Metadata: Read-only is added automatically. Nothing else. **Generate token** and copy it.

**5. Connect.** Open the app, type `infinitepal178/bookjournal-data`, paste the token, tap **Connect**. Then use the browser menu → **Add to Home screen**.

### C. Commit messages

`learning: The Patient Mind · 2026-11-18`, `added: Notes on Craft`, `finished: The Patient Mind`, `stopped: Field Guide to Clouds`, `recall: 4 learnings · 2026-11-19`, `weekly review: 2026-W47`, `follow-ups`, `Set up learning journal`, `Rebuild index`.

### D. Ideas parked for later

- Progress (page / chapter / %) and quotes, as optional extra steps, if you miss them.
- Topic tags across sources, with a topic page.
- Import Kindle highlights into a source.
- A yearly "reading year" page: books finished, ratings, top learnings.
- An AI summary of a finished book's learnings. This needs a server and an API key, so it's out of scope for a static app.
