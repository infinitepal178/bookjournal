// Today: what's due (follow-ups, recall, the weekly review), and the way in to log.

import { useMemo, useState } from 'react';
import type { Go, UpdateOverview } from '../App';
import { FollowUpReview, applyAnswers, type Answer } from '../components/FollowUps';
import { Icon, TypeBadge, type ToastState } from '../components/ui';
import { addDays, dateKey, formatDay, formatLong, isoWeek, weekday } from '../lib/dates';
import { typeInfo } from '../lib/entries';
import { dueFollowUps } from '../lib/followups';
import { explainError } from '../lib/github';
import type { Journal, Overview } from '../lib/journal';
import { daysWritten, entriesNewestFirst, recentSources, sourceStats, streaks } from '../lib/journalIndex';
import { recallQueue } from '../lib/recall';
import { loadDraft } from '../lib/store';
import type { LogTarget } from './Log';

/** The week a review is for: the week of the latest review day on or before `today`. */
export function reviewWeek(today: string, weeklyDay: number): { week: string; day: string } {
  const jsDay = (weekday(today) + 1) % 7; // weekday() counts Monday = 0; config uses Sunday = 0
  const diff = (jsDay - weeklyDay + 7) % 7;
  const day = addDays(today, -diff);
  return { week: isoWeek(day).id, day };
}

export function Today({
  journal,
  overview,
  update,
  toast,
  go,
  openLog,
}: {
  journal: Journal;
  overview: Overview;
  update: UpdateOverview;
  toast: (t: ToastState) => void;
  go: Go;
  openLog: (t?: LogTarget) => void;
}) {
  const today = dateKey();
  const { index, config } = overview;
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [saving, setSaving] = useState(false);

  const written = useMemo(() => daysWritten(index), [index]);
  const { current, best } = streaks(written, today);
  const stats = useMemo(() => sourceStats(index), [index]);
  const cont = useMemo(() => recentSources(index, 6).filter((id) => index.sources[id].status === 'reading').slice(0, 3), [index]);
  const todays = entriesNewestFirst(index).filter((e) => e.date === today);
  const due = dueFollowUps(overview.followUps, today);
  const queue = recallQueue(overview.recall, today, config.recallPerDay);
  const nextRecall = Object.values(overview.recall.items)
    .filter((i) => !i.retired && i.due > today)
    .map((i) => i.due)
    .sort()[0];
  const draft = loadDraft<{ fields: Record<string, string>; sourceId: string | null; newSource: { title: string } | null }>('log');
  const draftTitle = draft && Object.values(draft.fields ?? {}).some((v) => v?.trim()) ? (draft.sourceId ? index.sources[draft.sourceId]?.title : draft.newSource?.title) || 'a new source' : null;

  const rw = reviewWeek(today, config.weeklyDay);
  const daysSince = Math.round((Date.parse(today) - Date.parse(rw.day)) / 86400000);
  const showWeekly = daysSince <= 2 && !overview.weeklies.has(rw.week) && written.size > 0;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  async function saveAnswers() {
    setSaving(true);
    try {
      const changes = applyAnswers(due, answers, today);
      const file = await journal.saveFollowUps(changes);
      update((o) => ({ ...o, followUps: file }));
      setAnswers({});
      toast({ text: changes.length === 1 ? 'Saved' : `Saved ${changes.length} answers` });
    } catch (e) {
      toast({ text: explainError(e), error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="narrow stack" style={{ gap: 20 }}>
      <div className="spread" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <span className="kicker">{formatLong(today)}</span>
          <h1 className="title">{todays.length ? 'Anything else today?' : 'What did you learn today?'}</h1>
        </div>
        <a href="#settings" className="iconbtn" aria-label="Settings" style={{ width: 40, height: 40, padding: 8, flex: '0 0 auto' }}>
          <Icon name="settings" />
        </a>
      </div>

      {written.size > 0 && (
        <div className="streak">
          <b>{current}</b> day streak · best {best}
        </div>
      )}

      {draftTitle && (
        <button className="notice accent spread" style={{ border: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }} onClick={() => openLog({})}>
          <span className="small">
            Unsaved entry from <b>{draftTitle}</b>
          </span>
          <span className="link accent">Resume</span>
        </button>
      )}

      <div className="hero">
        <button className="btn primary big wide" onClick={() => openLog({})}>
          Log a learning
        </button>
        {cont.length > 0 && (
          <div className="continue">
            <span className="section-label">Continue with</span>
            {cont.map((id) => {
              const s = index.sources[id];
              const st = stats.get(id);
              return (
                <button key={id} onClick={() => openLog({ source: id })}>
                  <TypeBadge type={s.type} />
                  <span>
                    <b>{s.title}</b>
                    <span>
                      {[s.author, typeInfo(s.type).label].filter(Boolean).join(' · ')}
                      {st?.last ? ` · last ${st.last === today ? 'today' : formatDay(st.last)}` : ''}
                    </span>
                  </span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {todays.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="section-label">Logged today</h2>
          {todays.map((e) => (
            <div key={e.key} className="card stack" style={{ gap: 4, padding: 14 }}>
              <div className="spread" style={{ flexWrap: 'nowrap' }}>
                <span className="small muted">{index.sources[e.source]?.title ?? e.source}</span>
                <button className="link" onClick={() => openLog({ date: e.date, source: e.source })}>
                  Edit
                </button>
              </div>
              <p className="pre" style={{ margin: 0 }}>
                {e.learned}
              </p>
            </div>
          ))}
        </section>
      )}

      {due.length > 0 && (
        <section className="stack">
          <h2 className="section-label">Did you try it?</h2>
          <FollowUpReview items={due} answers={answers} onChange={setAnswers} today={today} />
          {Object.keys(answers).length > 0 && (
            <button className="btn primary" disabled={saving} onClick={saveAnswers}>
              {saving ? 'Saving…' : 'Save answers'}
            </button>
          )}
        </section>
      )}

      {queue.due.length > 0 ? (
        <a className="card raised todo" href="#review">
          <span className="count">{queue.due.length}</span>
          <span className="todo-text">
            <b>{queue.due.length === 1 ? 'learning' : 'learnings'} to recall</b>
            <span className="small muted">About {Math.max(1, Math.round(queue.due.length * 0.5))} min · do you still remember?</span>
          </span>
          <span className="link accent" style={{ marginLeft: 'auto' }}>
            Start
          </span>
        </a>
      ) : (
        nextRecall && (
          <p className="small muted" style={{ margin: 0 }}>
            Nothing to recall today. Next recall: {formatDay(nextRecall)}.
          </p>
        )
      )}

      {showWeekly ? (
        <a className="card raised todo" href={`#weekly/${rw.week}`}>
          <span className="count">W{rw.week.slice(6)}</span>
          <span className="todo-text">
            <b>Weekly learning review</b>
            <span className="small muted">What you learned, what you tried, what to read next · 5 min</span>
          </span>
          <span className="link accent" style={{ marginLeft: 'auto' }}>
            Start
          </span>
        </a>
      ) : (
        written.size > 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            Weekly review: {dayNames[config.weeklyDay]}.{' '}
            <button className="link" onClick={() => go('weekly', isoWeek(today).id)}>
              Open this week
            </button>
          </p>
        )
      )}

      {written.size === 0 && (
        <div className="card stack" style={{ gap: 6 }}>
          <h2>How it works</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Log what you learned from a book, video, article or conversation: the idea in your own words, then what you'll continue, stop and start doing. It takes a
            minute or two. Each learning comes back for recall after a day, a week, a month, 3 months and 6 months, and I'll ask how your "start" and "stop" plans went.
          </p>
        </div>
      )}
    </div>
  );
}
