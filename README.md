# bookjournal

A phone-first **learning journal**. Each day, note what you learned from a book, video, article, podcast, course or conversation in four short questions:

1. **What did you learn today?**
2. **What will you continue doing?**
3. **What will you stop doing?**
4. **What will you start doing?**

Each learning is tagged to its source. Type a title and your sources pop up; anything new becomes a new source.

- **Review → Recall:** each learning comes back after 1 day, 1 week, 1 month, 3 months and 6 months. Try to remember it, reveal it, and mark Remembered / Fuzzy / Forgot.
- **Review → Weekly:** the week in numbers, your top 3 learnings, what you put into practice, what to read next, and a rotating deeper question (↻).
- **Follow-ups:** your *stop* and *start* plans come back as "Did you try it?" on the day you choose.
- **Library:** every source with its learnings; reading list, finished (rating + what you took from it) and abandoned.
- **History:** calendar, streak, and search across everything.

Every entry is a Markdown file saved to **your own private GitHub repo**. This repo holds only the app code, which is public and contains no entries or secrets. Background: [PLAN.md](PLAN.md) and the wireframes in [`prototypes/`](prototypes/index.html).

## Using it

Setup steps from a phone are in [PLAN.md, Appendix B](PLAN.md#b-setup-all-from-a-phone). In short:

1. Create a **private** repo for your entries, e.g. `bookjournal-data`.
2. Create a fine-grained token at https://github.com/settings/personal-access-tokens/new with **Only select repositories → that repo** and **Contents: Read and write**.
3. Open https://infinitepal178.github.io/bookjournal/, enter `your-username/bookjournal-data` and the token, and tap **Connect**. Then **Add to Home screen**.

The token is stored only in that browser. Settings → **Disconnect this device** removes it.

## Your settings

Edit `.journal/config.json` in your data repo (Settings → Edit settings on GitHub):

```json
{
  "builtInPrompts": true,
  "weeklyQuestions": ["What did I read this week that I disagree with?"],
  "recallIntervals": [1, 7, 30, 90, 180],
  "recallPerDay": 5,
  "weeklyDay": "sunday",
  "followUpDays": 7
}
```

Use straight quotes `"` and a comma after every item except the last. If the file can't be read, the app uses its defaults.

## Developing

```
npm ci
npm run dev          # local dev server
npm test             # unit tests: file formats, dates, recall, search, saving against a fake GitHub
npm run build        # type-check + production build (dist/)
npm run e2e          # after build: drives the app in Chromium (phone, dark, wide) against a fake GitHub; SHOTS=dir saves screenshots
npm run demo         # builds dist-demo/bookjournal-demo.html: the app with made-up sample data and no network
```

| Path | What's there |
|------|--------------|
| `src/lib/entries.ts` | Source, learning and weekly file formats; paths and slugs |
| `src/lib/github.ts` | GitHub API client; one commit per save using the Git Data API |
| `src/lib/journal.ts` | Load and save, first-run setup, conflict detection, rebuild |
| `src/lib/journalIndex.ts` | Index, source type-ahead, search, streaks, week data |
| `src/lib/recall.ts` | Recall ladder, daily queue, monthly log, rebuilding the schedule |
| `src/lib/followups.ts` | Follow-ups and `followups.md` |
| `src/screens/` | Connect, Today, Log, Library, Review, History, Follow-ups, Settings |
| `src/demo.ts` | Demo build only: in-memory repo with made-up data |
| `tests/fake-github.mjs` | In-memory GitHub used by the tests and the demo |

Pushing to `main` runs the tests and publishes to GitHub Pages (`.github/workflows/deploy-pages.yml`).

Built on the same approach as [myjournal](https://github.com/infinitepal178/myjournal).
