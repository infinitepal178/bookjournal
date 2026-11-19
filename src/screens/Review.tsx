// Review (prototype A's structure): today's recall list with reveal in place,
// and the weekly learning review as a two-column spread (the week | the prompts).

import { useEffect, useMemo, useState } from 'react';
import type { Go, UpdateOverview } from '../App';
import { TypeBadge, type ToastState } from '../components/ui';
import { addDays, dateKey, formatDay, formatRange, isoWeek, shiftWeek, weekRange } from '../lib/dates';
import { learningPath, type Weekly } from '../lib/entries';
import { newFollowUp } from '../lib/followups';
import { explainError } from '../lib/github';
import { ConflictError, type Journal, type Overview, type WeeklyData } from '../lib/journal';
import { entryById, weekData } from '../lib/journalIndex';
import { weeklyQuestionFor } from '../lib/prompts';
import { RESULT_LABEL, agoLabel, gapLabel, nextGapLabel, recallQueue, recallStats, reviewLabel, type RecallAnswer, type RecallResult } from '../lib/recall';
import { clearDraft, loadDraft, saveDraft } from '../lib/store';
import { Csd } from './Library';
import { reviewWeek } from './Today';

interface Props {
  journal: Journal;
  overview: Overview;
  tab: 'recall' | 'weekly';
  week: string;
  update: UpdateOverview;
  toast: (t: ToastState) => void;
  go: Go;
}

export function Review(props: Props) {
  const { overview, tab } = props;
  const today = dateKey();
  const known = useMemo(() => new Set(Object.values(overview.index.entries).map((e) => e.id)), [overview.index]);
  const queue = recallQueue(overview.recall, today, overview.config.recallPerDay, known);
  // Default: the review that's due (within two days of the review day), otherwise this week.
  const rw = reviewWeek(today, overview.config.weeklyDay);
  const dueWeek = Math.round((Date.parse(today) - Date.parse(rw.day)) / 86400000) <= 2 && !overview.weeklies.has(rw.week) ? rw.week : isoWeek(today).id;
  const week = /^\d{4}-W\d{2}$/.test(props.week) ? props.week : dueWeek;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="page-head" style={{ marginBottom: 6 }}>
        <span className="kicker">Review · {formatDay(today)}</span>
        <h1 className="title">{tab === 'recall' ? (queue.due.length ? `${queue.due.length === 1 ? 'One learning' : `${queue.due.length} learnings`} to recall` : 'Recall') : 'Weekly learning review'}</h1>
      </div>
      <nav className="tabs" aria-label="Review">
        <a href="#review" aria-current={tab === 'recall' ? 'page' : undefined}>
          Recall · {queue.due.length}
        </a>
        <a href={`#weekly/${week}`} aria-current={tab === 'weekly' ? 'page' : undefined}>
          Weekly · W{week.slice(6)}
        </a>
      </nav>
      {tab === 'recall' ? <Recall {...props} due={queue.due} waiting={queue.waiting} /> : <WeeklyReview key={week} {...props} week={week} />}
    </div>
  );
}

// ---------- recall ----------

interface RecallState {
  revealed: boolean;
  result?: RecallResult | 'retired';
  note: string;
}

function Recall({ journal, overview, update, toast, due, waiting }: Props & { due: string[]; waiting: number }) {
  const today = dateKey();
  const { index, config, recall } = overview;
  const byId = useMemo(() => entryById(index), [index]);
  const draftId = `recall.${today}`;
  const [state, setState] = useState<Record<string, RecallState>>(() => loadDraft(draftId) ?? {});
  const [saving, setSaving] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [items] = useState(due); // keep answered cards on screen until saved

  useEffect(() => {
    if (Object.keys(state).length) saveDraft(draftId, state);
  }, [state, draftId]);

  const set = (id: string, patch: Partial<RecallState>) => setState((s) => ({ ...s, [id]: { ...{ revealed: false, note: '' }, ...s[id], ...patch } }));
  const answered = items.filter((id) => state[id]?.result);
  const intervals = config.recallIntervals;
  const retiredLearned = Object.values(recall.items).filter((i) => i.reason === 'learned').length;
  const inRotation = Object.values(recall.items).filter((i) => !i.retired).length;
  const nextDue = Object.values(recall.items)
    .filter((i) => !i.retired && i.due > today)
    .map((i) => i.due)
    .sort()[0];

  async function save() {
    setSaving(true);
    try {
      const answers: RecallAnswer[] = answered.map((id) => {
        const e = byId.get(id)!;
        const st = state[id];
        const item = recall.items[id];
        const result = st.result!;
        return {
          id,
          result,
          note: st.note.trim() || undefined,
          title: index.sources[e.source]?.title ?? e.source,
          date: e.date,
          learned: e.learned,
          path: learningPath(e.date, e.source),
          next: result === 'retired' || !item ? undefined : nextGapLabel(item, result, intervals).replace(/^in /, 'next in '),
        };
      });
      const r = await journal.saveRecall(answers, today, config);
      update((o) => ({ ...o, recall: r }));
      clearDraft(draftId);
      setDoneCount(answers.length);
      setState({});
      toast({ text: `Saved ${answers.length === 1 ? '1 answer' : `${answers.length} answers`}` });
    } catch (e) {
      toast({ text: explainError(e), error: true });
    } finally {
      setSaving(false);
    }
  }

  const side = (
    <aside className="stack" style={{ gap: 18 }}>
      <div className="side-note">
        <span className="section-label">How recall works</span>
        <p className="small" style={{ margin: 0 }}>
          Each learning comes back after a growing gap. <b>Remembered</b> moves it up a step, <b>Fuzzy</b> repeats the step, <b>Forgot</b> starts again.
        </p>
        <div className="ladder">
          {intervals.map((d) => (
            <span key={d}>{gapLabel(d)}</span>
          ))}
          <span>learned</span>
        </div>
      </div>
      <div className="side-note small">
        <span className="section-label">Your recall</span>
        <span>
          {inRotation} in rotation · {retiredLearned} learned for good
        </span>
        {waiting > 0 && <span>+{waiting} waiting (at most {config.recallPerDay} a day)</span>}
        {nextDue && <span>Next: {formatDay(nextDue)}</span>}
      </div>
    </aside>
  );

  const visible = doneCount ? [] : items.filter((id) => byId.has(id) && recall.items[id]);
  return (
    <div className="two-col wide-left">
      <div className="stack" style={{ gap: 0 }}>
        {visible.length === 0 ? (
          <div className="card stack" style={{ gap: 6 }}>
            <h2>{doneCount ? 'Done for today' : 'Nothing to recall today'}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              {doneCount ? `You answered ${doneCount === 1 ? 'one card' : `${doneCount} cards`}. ` : ''}
              {nextDue ? `Next recall: ${formatDay(nextDue)}.` : 'Each learning you log comes back here the next day.'}
            </p>
          </div>
        ) : (
          <>
            <p className="small muted" style={{ margin: '0 0 10px' }}>
              Try to remember what you learned, then reveal it.
            </p>
            {visible.map((id) => {
              const e = byId.get(id)!;
              const item = recall.items[id];
              const st = state[id];
              const src = index.sources[e.source];
              return (
                <article key={id} className="recall-item" aria-label={`Recall: ${src?.title ?? e.source}`}>
                  <div className="row small muted" style={{ flexWrap: 'nowrap' }}>
                    {src && <TypeBadge type={src.type} />}
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      {src?.title ?? e.source} · {formatDay(e.date)}, {agoLabel(e.date, today)} · {reviewLabel(item, intervals)}
                    </span>
                  </div>
                  <h2 className="cue">What did you learn from {src?.title ?? 'this'}?</h2>
                  {!st?.revealed ? (
                    <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => set(id, { revealed: true })}>
                      Reveal
                    </button>
                  ) : (
                    <>
                      <div className="answer">
                        <p className="learned">{e.learned}</p>
                        <Csd e={e} />
                      </div>
                      <div className="results" role="group" aria-label="Did you remember it?">
                        {(['remembered', 'fuzzy', 'forgot'] as RecallResult[]).map((r) => (
                          <button key={r} className={r} aria-pressed={st.result === r} onClick={() => set(id, { result: st.result === r ? undefined : r })}>
                            {RESULT_LABEL[r]}
                            <span>{nextGapLabel(item, r, intervals)}</span>
                          </button>
                        ))}
                      </div>
                      {st.result && st.result !== 'retired' && (
                        <input
                          className="input"
                          id={`note-${id}`}
                          aria-label="What does it mean to you now?"
                          placeholder="What does it mean to you now? (optional)"
                          value={st.note}
                          onChange={(ev) => set(id, { note: ev.target.value })}
                        />
                      )}
                      <div className="row">
                        {st.result === 'retired' ? (
                          <span className="small muted">
                            Retiring this one: it won't come back.{' '}
                            <button className="link" onClick={() => set(id, { result: undefined })}>
                              Undo
                            </button>
                          </span>
                        ) : (
                          <button className="link" onClick={() => set(id, { result: 'retired' })}>
                            Not worth keeping? Retire it
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </article>
              );
            })}
            <div className="flow-foot" style={{ paddingBottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 12px)', alignItems: 'center' }}>
              <button className="btn primary" style={{ flex: '0 1 auto' }} disabled={!answered.length || saving} onClick={save}>
                {saving ? 'Saving…' : 'Save answers'}
              </button>
              <span className="small muted">
                {answered.length} of {visible.length} answered
              </span>
            </div>
          </>
        )}
      </div>
      {side}
    </div>
  );
}

// ---------- weekly ----------

interface WeeklyDraft {
  top: string[];
  applied: string;
  next: string;
  answer: string;
  startNext: string;
  skip: number;
}

function WeeklyReview({ journal, overview, update, toast, go, week }: Props) {
  const today = dateKey();
  const { index, config, recall, followUps } = overview;
  const { start, end } = weekRange(week);
  const wd = useMemo(() => weekData(index, week), [index, week]);
  const rs = recallStats(recall, start, end);
  const closed = followUps.items.filter((f) => f.closed && f.closed >= start && f.closed <= end);
  const done = closed.filter((f) => f.status === 'done' || f.status === 'partly');
  const want = Object.keys(index.sources).filter((id) => index.sources[id].status === 'want');
  const draftId = `weekly.${week}`;
  const [loaded, setLoaded] = useState<WeeklyData | null>(null);
  const [d, setD] = useState<WeeklyDraft>(() => loadDraft<WeeklyDraft>(draftId) ?? { top: [], applied: '', next: '', answer: '', startNext: '', skip: 0 });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const set = (p: Partial<WeeklyDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  const question = loaded?.weekly?.question && d.skip === 0 ? loaded.weekly.question : weeklyQuestionFor(config, week, d.skip);
  const isFuture = start > today;
  const current = isoWeek(today).id;

  useEffect(() => {
    let live = true;
    journal
      .loadWeekly(week)
      .then((w) => {
        if (!live) return;
        setLoaded(w);
        if (w.weekly && !loadDraft(draftId)) {
          const x = w.weekly;
          setD({ top: x.top, applied: x.applied, next: x.next, answer: x.answer, startNext: x.startNext, skip: 0 });
        }
      })
      .catch((e) => live && toast({ text: explainError(e), error: true }));
    return () => {
      live = false;
    };
  }, [journal, week, draftId, toast]);

  useEffect(() => {
    if (dirty) saveDraft(draftId, d);
  }, [d, dirty, draftId]);

  const toggleTop = (id: string) => set({ top: d.top.includes(id) ? d.top.filter((x) => x !== id) : d.top.length >= 3 ? d.top : [...d.top, id] });
  const byId = new Map(wd.entries.map((e) => [e.id, e]));

  async function save(force = false) {
    if (!loaded) return;
    setSaving(true);
    setConflict(false);
    try {
      const weekly: Weekly = {
        week,
        start,
        end,
        stats: { days: wd.daysWritten, sources: wd.sources.length, learnings: wd.entries.length, recalled: rs.recalled, remembered: rs.remembered, done: done.length },
        top: d.top.filter((id) => byId.has(id)),
        applied: d.applied,
        next: d.next,
        question,
        answer: d.answer,
        startNext: d.startNext,
      };
      const topText = weekly.top.map((id) => {
        const e = byId.get(id)!;
        return { id, text: e.learned, source: index.sources[e.source]?.title ?? e.source };
      });
      const fid = `${week}-start`;
      const existing = followUps.items.find((f) => f.id === fid);
      const fu = d.startNext.trim() && (!existing || existing.status === 'open') ? [newFollowUp(`Start: ${d.startNext.trim().replace(/\s*\n\s*/g, ' ')}`, end > today ? today : end, addDays(end, 7), [], `reviews/weekly/${week.slice(0, 4)}/${week}.md`, fid)] : [];
      const r = await journal.saveWeekly(loaded, weekly, topText, fu, force);
      setLoaded(r.data);
      update((o) => ({ ...o, weeklies: new Set([...o.weeklies, week]), followUps: r.followUps ?? o.followUps }));
      clearDraft(draftId);
      setDirty(false);
      toast({ text: `Saved your review of week ${Number(week.slice(6))}` });
    } catch (e) {
      if (e instanceof ConflictError) setConflict(true);
      else toast({ text: explainError(e), error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="spread">
        <button className="link" onClick={() => go('weekly', shiftWeek(week, -1))}>
          ‹ Week {Number(shiftWeek(week, -1).slice(6))}
        </button>
        <b className="small">
          {formatRange(start, end)} {end.slice(0, 4)}
          {overview.weeklies.has(week) ? ' · saved' : ''}
        </b>
        <button className="link" disabled={week >= current} style={{ visibility: week >= current ? 'hidden' : undefined }} onClick={() => go('weekly', shiftWeek(week, 1))}>
          Week {Number(shiftWeek(week, 1).slice(6))} ›
        </button>
      </div>

      {isFuture ? (
        <p className="muted">This week hasn't started yet.</p>
      ) : (
        <div className="two-col">
          <section className="stack" style={{ gap: 14 }}>
            <h2 className="section-label">The week</h2>
            <div className="stats">
              <div className="stat">
                <strong>{wd.daysWritten}</strong>
                <span>days logged</span>
              </div>
              <div className="stat">
                <strong>{wd.entries.length}</strong>
                <span>learnings</span>
              </div>
              <div className="stat">
                <strong>{wd.sources.length}</strong>
                <span>sources</span>
              </div>
              <div className="stat">
                <strong>
                  {rs.remembered}/{rs.recalled}
                </strong>
                <span>remembered</span>
              </div>
              <div className="stat">
                <strong>{done.length}</strong>
                <span>tried it</span>
              </div>
              <div className="stat">
                <strong>{want.length}</strong>
                <span>on your list</span>
              </div>
            </div>
            <div className="card" style={{ padding: '6px 14px' }}>
              {wd.entries.length === 0 && <p className="small muted">Nothing logged this week.</p>}
              {wd.entries.map((e) => (
                <div key={e.key} className="week-item">
                  <button className="star" aria-label={`Top learning: ${e.learned}`} aria-pressed={d.top.includes(e.id)} onClick={() => toggleTop(e.id)}>
                    {d.top.includes(e.id) ? '★' : '☆'}
                  </button>
                  <div className="grow">
                    <div className="tiny muted">
                      {formatDay(e.date)} · {index.sources[e.source]?.title ?? e.source}
                    </div>
                    <div className="small pre">{e.learned}</div>
                  </div>
                </div>
              ))}
            </div>
            {closed.length > 0 && (
              <div className="side-note small">
                <span className="section-label">Follow-ups this week</span>
                {closed.map((f) => (
                  <span key={f.id}>
                    {f.status === 'done' ? '✓' : f.status === 'partly' ? '½' : '✕'} {f.text}
                    {f.outcome ? <span className="muted"> · {f.outcome}</span> : null}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="stack" style={{ gap: 18 }}>
            <div className="stack" style={{ gap: 8 }}>
              <h3 className="prompt-q">Top learnings of the week</h3>
              {d.top.filter((id) => byId.has(id)).length ? (
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {d.top
                    .filter((id) => byId.has(id))
                    .map((id) => (
                      <li key={id} className="small">
                        {byId.get(id)!.learned}
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>
                  Star up to 3 learnings in the week's list.
                </p>
              )}
            </div>
            <label className="stack" style={{ gap: 8 }}>
              <span className="prompt-q">What did you put into practice?</span>
              {done.length > 0 && <span className="tiny muted">You said: {done.map((f) => f.text).join(' · ')}</span>}
              <textarea id="w-applied" className="textarea short" value={d.applied} onChange={(e) => set({ applied: e.target.value })} />
            </label>
            <div className="stack" style={{ gap: 8 }}>
              <label className="prompt-q" htmlFor="w-next">
                What will you read, watch or listen to next?
              </label>
              {want.length > 0 && (
                <div className="chips">
                  {want.slice(0, 6).map((id) => (
                    <button key={id} className="chip" aria-pressed={d.next === index.sources[id].title} onClick={() => set({ next: index.sources[id].title })}>
                      {index.sources[id].title}
                    </button>
                  ))}
                </div>
              )}
              <input id="w-next" className="input" value={d.next} onChange={(e) => set({ next: e.target.value })} />
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <div className="spread" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <label className="prompt-q" htmlFor="w-answer">
                  {question}
                </label>
                <button className="iconbtn" aria-label="Show a different question" title="Different question" onClick={() => set({ skip: d.skip + 1 })}>
                  ↻
                </button>
              </div>
              <textarea id="w-answer" className="textarea short" value={d.answer} onChange={(e) => set({ answer: e.target.value })} />
            </div>
            <label className="stack" style={{ gap: 8 }}>
              <span className="prompt-q">Next week I'll start…</span>
              <input id="w-start" className="input" value={d.startNext} onChange={(e) => set({ startNext: e.target.value })} />
              {d.startNext.trim() && <span className="tiny muted">I'll ask how it went on {formatDay(addDays(end, 7))}.</span>}
            </label>
            {conflict && (
              <div className="notice danger stack" style={{ gap: 8 }}>
                <span>This review was changed somewhere else after you opened it.</span>
                <button className="btn sm danger" onClick={() => save(true)}>
                  Save mine anyway
                </button>
              </div>
            )}
            <button className="btn primary" disabled={!loaded || saving} onClick={() => save()}>
              {saving ? 'Saving…' : overview.weeklies.has(week) ? 'Update review' : 'Save review'}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
