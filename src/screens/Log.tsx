// Log a learning: one question per screen (prototype B).
// 1 What did you learn from? (pick a source or type a new one) → 2 What did you
// learn today? → 3 Continue → 4 Stop → 5 Start → save. Steps 3–5 can be skipped,
// and you can save any time after step 2.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Go, UpdateOverview } from '../App';
import { Highlight, TypeBadge, type ToastState } from '../components/ui';
import { addDays, dateKey, daysBetween, formatDay, formatLong } from '../lib/dates';
import {
  LEARNING_SECTIONS,
  SOURCE_TYPES,
  STATUS_LABEL,
  emptyLearning,
  learningPath,
  newId,
  sourceIdFor,
  typeInfo,
  uniqueSlug,
  type Learning,
  type Source,
  type SourceType,
} from '../lib/entries';
import { describeDue, newFollowUp, type FollowUp } from '../lib/followups';
import { explainError } from '../lib/github';
import { ConflictError, type Journal, type LoadedLearning, type Overview } from '../lib/journal';
import { daysWritten, exactSource, matchSources, recentSources, sourceStats, streaks, type SourceSummary } from '../lib/journalIndex';
import { parseLearning } from '../lib/entries';
import { clearDraft, loadDraft, saveDraft } from '../lib/store';

export interface LogTarget {
  date?: string;
  source?: string;
}

type Field = 'learned' | 'continue' | 'stop' | 'start';
type Fields = Record<Field, string>;

interface Draft {
  date: string;
  sourceId: string | null;
  newSource: { title: string; type: SourceType; author: string } | null;
  fields: Fields;
  ask: { stop: number; start: number };
  step: number;
  id: string;
}

const DRAFT_ID = 'log';
const STEPS = 5;
const ASK_OPTIONS = [3, 7, 14];
const emptyFields = (): Fields => ({ learned: '', continue: '', stop: '', start: '' });
const hasText = (f: Fields) => Object.values(f).some((v) => v.trim());

export const sourceFromIndex = (o: Overview, id: string): Source => {
  const s: SourceSummary | undefined = o.index.sources[id];
  return { id, type: s?.type ?? 'other', title: s?.title ?? id, author: s?.author, status: s?.status ?? 'reading', rating: s?.rating, started: s?.started, finished: s?.finished, takeaway: s?.takeaway };
};

export function Log({
  journal,
  overview,
  target,
  update,
  toast,
  go,
  onAnother,
}: {
  journal: Journal;
  overview: Overview;
  target: LogTarget;
  update: UpdateOverview;
  toast: (t: ToastState) => void;
  go: Go;
  onAnother: () => void;
}) {
  const index = overview.index;
  const config = overview.config;
  const today = dateKey();
  const takenIds = useMemo(() => new Set([...Object.values(index.entries).map((e) => e.id), ...Object.keys(overview.recall.items)]), [index, overview.recall]);

  const [draft, setDraft] = useState<Draft>(() => {
    const stored = loadDraft<Draft>(DRAFT_ID);
    const fresh: Draft = {
      date: target.date ?? today,
      sourceId: target.source ?? null,
      newSource: null,
      fields: emptyFields(),
      ask: { stop: config.followUpDays, start: config.followUpDays },
      step: target.source ? 1 : 0,
      id: newId(takenIds),
    };
    if (stored && (!target.source || (stored.sourceId === target.source && stored.date === (target.date ?? today)))) return { ...fresh, ...stored };
    return fresh;
  });
  const [resumed] = useState(() => {
    const s = loadDraft<Draft>(DRAFT_ID);
    return !!s && hasText(s.fields) && (!target.source || s.sourceId === target.source);
  });
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState<LoadedLearning | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ theirs: string | null } | null>(null);
  const [saved, setSaved] = useState<{ paths: string[]; followUps: FollowUp[]; isNew: boolean; title: string } | null>(null);
  const [query, setQuery] = useState('');

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const setField = (k: Field, v: string) => set({ fields: { ...draft.fields, [k]: v } });

  // Keep a draft only when there's something not yet on GitHub.
  useEffect(() => {
    if (!dirty || saved) return;
    const l = loaded?.learning;
    const unchanged = l && (['learned', 'continue', 'stop', 'start'] as Field[]).every((k) => draft.fields[k].trim() === l[k].trim());
    if (hasText(draft.fields) && !unchanged) saveDraft(DRAFT_ID, draft);
    else if (loaded) clearDraft(DRAFT_ID);
  }, [draft, dirty, saved, loaded]);

  // Once a source and day are known, load that day's file (you may have logged from it already today).
  const sourceKnown = draft.sourceId;
  useEffect(() => {
    if (!sourceKnown) {
      setLoaded({ date: draft.date, source: '', learning: null, raw: null });
      return;
    }
    let live = true;
    setLoading(true);
    journal
      .loadLearning(draft.date, sourceKnown)
      .then((l) => {
        if (!live) return;
        setLoaded(l);
        if (l.learning) {
          const existing = l.learning;
          setDraft((d) => {
            const keepMine = hasText(d.fields) && d.id === existing.id;
            const ask = { ...d.ask };
            for (const k of ['stop', 'start'] as const) {
              const f = overview.followUps.items.find((i) => i.id === `${existing.id}-${k}`);
              if (f) ask[k] = f.status === 'open' ? Math.max(1, daysBetween(existing.date, f.due)) : ask[k];
              else if (existing[k].trim()) ask[k] = 0;
            }
            return keepMine ? d : { ...d, id: existing.id || d.id, fields: { learned: existing.learned, continue: existing.continue, stop: existing.stop, start: existing.start }, ask };
          });
        }
      })
      .catch((e) => live && toast({ text: explainError(e), error: true }))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [journal, sourceKnown, draft.date, overview.followUps, toast]);

  const sourceTitle = draft.sourceId ? (index.sources[draft.sourceId]?.title ?? draft.sourceId) : (draft.newSource?.title ?? '');
  const sourceReady = !!draft.sourceId || !!draft.newSource?.title.trim();
  const editing = !!loaded?.learning;

  function discard() {
    clearDraft(DRAFT_ID);
    go('today');
  }

  async function save(force = false) {
    if (!draft.fields.learned.trim() || !loaded) return;
    setSaving(true);
    setConflict(null);
    try {
      const year = draft.date.slice(0, 4);
      let source: Source;
      if (draft.sourceId) source = sourceFromIndex(overview, draft.sourceId);
      else {
        const ns = draft.newSource!;
        const title = ns.title.trim();
        const author = ns.author.trim() || undefined;
        const oneOff = ns.type !== 'book' && ns.type !== 'course';
        source = {
          id: sourceIdFor(ns.type, uniqueSlug(title, Object.keys(index.sources), author), year),
          type: ns.type,
          title,
          author: ns.type === 'book' || ns.type === 'course' ? author : undefined,
          status: oneOff ? 'finished' : 'reading',
          finished: oneOff ? draft.date : undefined,
        };
      }
      const path = learningPath(draft.date, source.id);
      const followUps: FollowUp[] = [];
      const drop: string[] = [];
      const active: string[] = [];
      for (const k of ['stop', 'start'] as const) {
        const fid = `${draft.id}-${k}`;
        const text = draft.fields[k].trim();
        const existing = overview.followUps.items.find((i) => i.id === fid);
        if (existing && existing.status !== 'open') {
          active.push(fid);
          continue;
        }
        if (text && draft.ask[k] > 0) {
          const label = k === 'stop' ? 'Stop' : 'Start';
          const f = newFollowUp(`${label}: ${text.replace(/\s*\n\s*/g, ' ')}`, existing?.created ?? draft.date, addDays(draft.date, draft.ask[k]), [], path, fid);
          followUps.push(f);
          active.push(fid);
        } else if (existing) drop.push(fid);
      }
      const learning: Learning = {
        ...emptyLearning(draft.date, source.id, draft.id),
        ...(loaded.learning ?? {}),
        ...draft.fields,
        date: draft.date,
        source: source.id,
        id: draft.id,
        followups: active,
      };
      const r = await journal.saveLearning({ loaded: { ...loaded, source: source.id }, learning, source, followUps, dropFollowUps: drop, config, force });
      update((o) => ({
        ...o,
        files: new Set([...o.files, ...r.paths]),
        index: r.index,
        recall: r.recall,
        followUps: r.followUps ?? o.followUps,
      }));
      clearDraft(DRAFT_ID);
      setSaved({ paths: r.paths, followUps, isNew: !loaded.learning, title: source.title });
    } catch (e) {
      if (e instanceof ConflictError) setConflict({ theirs: e.theirs });
      else toast({ text: explainError(e), error: true });
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    const written = daysWritten(overview.index);
    const { current } = streaks(written, today);
    return (
      <div className="flow">
        <div className="done">
          <div className="big" aria-hidden="true">
            ✓
          </div>
          <h1 className="title">Saved</h1>
          <p className="muted" style={{ margin: 0 }}>
            {saved.title} · {formatDay(draft.date)}
          </p>
          {current > 0 && (
            <p style={{ margin: '6px 0 0' }}>
              <b>{current}-day streak</b>
            </p>
          )}
          {saved.isNew && <p className="small muted" style={{ margin: 0 }}>It comes back for recall {describeDue(addDays(draft.date, config.recallIntervals[0]), today)}.</p>}
          {saved.followUps.map((f) => (
            <p key={f.id} className="small muted" style={{ margin: 0 }}>
              I'll ask {describeDue(f.due, today)}: {f.text}
            </p>
          ))}
          <details className="small muted" style={{ marginTop: 10, maxWidth: '100%' }}>
            <summary>What was saved (one commit)</summary>
            <div className="files" style={{ marginTop: 8, textAlign: 'left' }}>
              {saved.paths.map((p) => (
                <div key={p}>{p}</div>
              ))}
            </div>
          </details>
        </div>
        <div className="flow-foot">
          <button className="btn" onClick={onAnother}>
            Log another
          </button>
          <button className="btn primary" onClick={() => go('today')}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const step = draft.step;
  const next = () => set({ step: Math.min(STEPS - 1, step + 1) });
  const back = () => (step === 0 || (step === 1 && target.source) ? go('today') : set({ step: step - 1 }));
  const field = (['learned', 'learned', 'continue', 'stop', 'start'] as Field[])[step];
  const section = LEARNING_SECTIONS.find((s) => s.key === field)!;
  const canSave = !!draft.fields.learned.trim() && sourceReady && !loading;

  return (
    <div className="flow">
      <div className="flow-top">
        <button className="iconbtn" onClick={back} aria-label={step === 0 ? 'Close' : 'Back'}>
          {step === 0 ? '×' : '‹'}
        </button>
        <div className="progress" aria-hidden="true">
          <b style={{ width: `${((step + 1) / STEPS) * 100}%` }} />
        </div>
        <span className="count-label">
          {step + 1}/{STEPS}
        </span>
      </div>

      <div className="flow-body">
        {resumed && step <= 1 && !dirty && (
          <div className="notice accent spread small">
            <span>Picked up your unsaved entry.</span>
            <button className="link" onClick={() => discard()}>
              Start over
            </button>
          </div>
        )}

        {step === 0 ? (
          <SourceStep overview={overview} draft={draft} set={set} query={query} setQuery={setQuery} onDone={next} />
        ) : (
          <>
            <div className="source-for">
              {editing ? 'Editing · ' : ''}
              <b>{sourceTitle}</b> · {draft.date === today ? 'today' : formatDay(draft.date)}
            </div>
            <h1 className="q">{section.question}</h1>
            <StepText key={step} value={draft.fields[field]} onChange={(v) => setField(field, v)} label={section.question} placeholder={PLACEHOLDER[field]} short={field !== 'learned'} />
            {(field === 'stop' || field === 'start') && draft.fields[field].trim() && (
              <div className="ask">
                <span className="label">Ask me how it went</span>
                <div className="chips" role="group" aria-label="When should I ask how it went?">
                  {[...new Set([...ASK_OPTIONS, config.followUpDays])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <button key={n} type="button" className="chip" aria-pressed={draft.ask[field] === n} onClick={() => set({ ask: { ...draft.ask, [field]: n } })}>
                        {n === 7 ? 'In a week' : n === 14 ? 'In 2 weeks' : `In ${n} days`}
                      </button>
                    ))}
                  <button type="button" className="chip" aria-pressed={draft.ask[field] === 0} onClick={() => set({ ask: { ...draft.ask, [field]: 0 } })}>
                    Don't ask
                  </button>
                </div>
                {draft.ask[field] > 0 && <span className="tiny muted">I'll ask on {formatDay(addDays(draft.date, draft.ask[field]))}.</span>}
              </div>
            )}
            {field === 'learned' && <p className="tiny muted" style={{ margin: 0 }}>In your own words. A sentence or two is plenty.</p>}
            {loading && <p className="tiny muted">Checking for an earlier entry today…</p>}
          </>
        )}

        {conflict && (
          <div className="notice danger stack" style={{ gap: 8 }}>
            <span>This entry was changed on GitHub or another device after you opened it.</span>
            <div className="row">
              <button className="btn sm danger" onClick={() => save(true)}>
                Save mine anyway
              </button>
              <button
                className="btn sm ghost"
                onClick={() => {
                  if (conflict.theirs !== null) {
                    const l = parseLearning(conflict.theirs, draft.date, draft.sourceId ?? '');
                    set({ fields: { learned: l.learned, continue: l.continue, stop: l.stop, start: l.start }, id: l.id || draft.id });
                  }
                  setLoaded((x) => x && { ...x, raw: conflict.theirs, learning: conflict.theirs === null ? null : parseLearning(conflict.theirs, draft.date, draft.sourceId ?? '') });
                  setConflict(null);
                }}
              >
                Use the newer version
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flow-foot">
        {step === 0 && (
          <button className="btn primary" disabled={!sourceReady} onClick={next}>
            Next
          </button>
        )}
        {step >= 1 && step < STEPS - 1 && (
          <>
            {canSave && step >= 2 && (
              <button className="btn" disabled={saving} onClick={() => save()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            <button className="btn primary" disabled={step === 1 && !draft.fields.learned.trim()} onClick={next}>
              {step >= 2 && !draft.fields[field].trim() ? 'Skip' : 'Next'}
            </button>
          </>
        )}
        {step === STEPS - 1 && (
          <button className="btn primary" disabled={!canSave || saving} onClick={() => save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}

const PLACEHOLDER: Record<Field, string> = {
  learned: 'e.g. Attention is a budget: every notification spends a little, even the ones I ignore.',
  continue: 'e.g. Writing the day’s plan before opening email.',
  stop: 'e.g. Checking chat in the first hour of work.',
  start: 'e.g. Phone in another room for the first hour.',
};

function StepText({ value, onChange, label, placeholder, short }: { value: string; onChange: (v: string) => void; label: string; placeholder: string; short: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return <textarea ref={ref} id="step-text" className={`textarea${short ? ' short' : ''}`} aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Step 1: pick a source you've used, or type a new one. Matches pop up as you type. */
function SourceStep({
  overview,
  draft,
  set,
  query,
  setQuery,
  onDone,
}: {
  overview: Overview;
  draft: Draft;
  set: (p: Partial<Draft>) => void;
  query: string;
  setQuery: (q: string) => void;
  onDone: () => void;
}) {
  const index = overview.index;
  const today = dateKey();
  const stats = useMemo(() => sourceStats(index), [index]);
  const matches = useMemo(() => (query.trim() ? matchSources(index, query) : recentSources(index)), [index, query]);
  const exact = query.trim() ? exactSource(index, query) : undefined;
  const pick = (id: string) => {
    set({ sourceId: id, newSource: null });
    setQuery('');
    onDone();
  };
  const startNew = () => {
    set({ sourceId: null, newSource: { title: query.trim(), type: 'book', author: '' } });
    setQuery('');
  };
  const meta = (id: string) => {
    const s = index.sources[id];
    const st = stats.get(id);
    return [s.author, typeInfo(s.type).label, s.status !== 'finished' || s.type === 'book' ? STATUS_LABEL[s.status] : null, st?.last ? `last ${formatDay(st.last)}` : null].filter(Boolean).join(' · ');
  };

  const ns = draft.newSource;
  return (
    <>
      <h1 className="q">What did you learn from?</h1>

      {draft.sourceId || ns ? (
        <div className="stack">
          <div className="picked">
            <TypeBadge type={draft.sourceId ? index.sources[draft.sourceId]?.type ?? 'other' : ns!.type} />
            <div className="grow">
              <b>{draft.sourceId ? index.sources[draft.sourceId]?.title : ns!.title}</b>
              <span className="tiny muted">{draft.sourceId ? meta(draft.sourceId) : 'New source'}</span>
            </div>
            <button className="link" onClick={() => set({ sourceId: null, newSource: null })}>
              Change
            </button>
          </div>
          {ns && (
            <>
              <label className="field">
                <span className="label">Title</span>
                <input id="new-title" className="input" value={ns.title} onChange={(e) => set({ newSource: { ...ns, title: e.target.value } })} />
              </label>
              <div className="field">
                <span className="label">What is it?</span>
                <div className="chips" role="group" aria-label="Type of source">
                  {SOURCE_TYPES.map((t) => (
                    <button key={t.id} type="button" className="chip" aria-pressed={ns.type === t.id} onClick={() => set({ newSource: { ...ns, type: t.id } })}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {(ns.type === 'book' || ns.type === 'course') && (
                <label className="field">
                  <span className="label">Author (optional)</span>
                  <input id="new-author" className="input" autoCapitalize="words" value={ns.author} onChange={(e) => set({ newSource: { ...ns, author: e.target.value } })} />
                </label>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="stack">
          <input
            id="source-search"
            className="input"
            autoFocus
            placeholder="Type a book, video, article…"
            aria-label="Source"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (exact) pick(exact);
              else if (matches[0]) pick(matches[0]);
              else if (query.trim()) startNew();
            }}
          />
          {!query.trim() && matches.length > 0 && <span className="section-label">Recent</span>}
          {(matches.length > 0 || (query.trim() && !exact)) && (
            <div className="suggest" role="listbox" aria-label="Matching sources">
              {matches.map((id) => (
                <button key={id} role="option" aria-selected="false" onClick={() => pick(id)}>
                  <TypeBadge type={index.sources[id].type} />
                  <span className="grow">
                    <b>
                      <Highlight text={index.sources[id].title} query={query} />
                    </b>
                    <span className="meta">{meta(id)}</span>
                  </span>
                </button>
              ))}
              {query.trim() && !exact && (
                <button className="new" role="option" aria-selected="false" onClick={startNew}>
                  <span className="type-dot" aria-hidden="true">
                    +
                  </span>
                  <span className="grow">
                    <b>Add “{query.trim()}”</b>
                    <span className="meta">New source</span>
                  </span>
                </button>
              )}
            </div>
          )}
          {!query.trim() && !matches.length && <p className="small muted" style={{ margin: 0 }}>Type the title of what you read, watched or heard. It's saved as a source you can pick next time.</p>}
        </div>
      )}

      <div className="field" style={{ marginTop: 6 }}>
        <span className="label">Day</span>
        <div className="chips" role="group" aria-label="Day">
          <button type="button" className="chip" aria-pressed={draft.date === today} onClick={() => set({ date: today })}>
            Today
          </button>
          <button type="button" className="chip" aria-pressed={draft.date === addDays(today, -1)} onClick={() => set({ date: addDays(today, -1) })}>
            Yesterday
          </button>
          <input
            type="date"
            className="chip"
            aria-label="Another day"
            max={today}
            value={draft.date}
            onChange={(e) => e.target.value && e.target.value <= today && set({ date: e.target.value })}
          />
        </div>
        {draft.date !== today && <span className="tiny muted">{formatLong(draft.date)}</span>}
      </div>
    </>
  );
}
