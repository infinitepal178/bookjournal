// Library: every source with its learnings, status and rating.
// Phone: a list, and a source page when you tap one. Wide screens: both side by side.

import { useEffect, useMemo, useState } from 'react';
import type { Go, UpdateOverview } from '../App';
import { ExternalLink, RatingInput, TypeBadge, starText, type ToastState } from '../components/ui';
import { dateKey, formatDay, formatShort } from '../lib/dates';
import {
  SOURCE_TYPES,
  STATUS_LABEL,
  learningPath,
  sourceIdFor,
  sourcePath,
  typeInfo,
  uniqueSlug,
  type Source,
  type SourceStatus,
  type SourceType,
} from '../lib/entries';
import { STATUS_LABEL as FU_STATUS } from '../lib/followups';
import { explainError } from '../lib/github';
import { ConflictError, type Journal, type Overview } from '../lib/journal';
import { entriesFor, matchSources, sourceStats } from '../lib/journalIndex';
import type { LogTarget } from './Log';

const STATUSES: SourceStatus[] = ['reading', 'want', 'finished', 'abandoned'];
const ORDER: Record<SourceStatus, number> = { reading: 0, want: 1, finished: 2, abandoned: 3 };

interface Props {
  journal: Journal;
  overview: Overview;
  selected: string;
  update: UpdateOverview;
  toast: (t: ToastState) => void;
  go: Go;
  openLog: (t?: LogTarget) => void;
}

export function Library(props: Props) {
  const { overview, selected, go } = props;
  const index = overview.index;
  const [status, setStatus] = useState<SourceStatus | 'all'>('all');
  const [type, setType] = useState<SourceType | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const stats = useMemo(() => sourceStats(index), [index]);
  const ids = Object.keys(index.sources);
  const types = SOURCE_TYPES.filter((t) => ids.some((id) => index.sources[id].type === t.id));
  const shown = ids
    .filter((id) => (status === 'all' || index.sources[id].status === status) && (type === 'all' || index.sources[id].type === type))
    .sort((a, b) => {
      const x = index.sources[a];
      const y = index.sources[b];
      return ORDER[x.status] - ORDER[y.status] || (stats.get(b)?.last ?? y.finished ?? '').localeCompare(stats.get(a)?.last ?? x.finished ?? '') || x.title.localeCompare(y.title);
    });
  const hasSelected = !!selected && !!index.sources[selected];

  const list = (
    <div className="stack" style={{ gap: 14 }}>
      <div className="spread">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <span className="kicker">{ids.length === 1 ? '1 source' : `${ids.length} sources`}</span>
          <h1 className="title">Library</h1>
        </div>
        <button className="btn sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          + Reading list
        </button>
      </div>

      {adding && <AddToList {...props} onDone={(id) => {
        setAdding(false);
        if (id) go('library', id);
      }} />}

      <div className="chips" role="group" aria-label="Show sources">
        <button className="chip" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>
          All<span className="n">{ids.length}</span>
        </button>
        {STATUSES.map((s) => {
          const n = ids.filter((id) => index.sources[id].status === s).length;
          return n ? (
            <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(status === s ? 'all' : s)}>
              {STATUS_LABEL[s]}
              <span className="n">{n}</span>
            </button>
          ) : null;
        })}
      </div>
      {types.length > 1 && (
        <div className="chips" role="group" aria-label="Type">
          {types.map((t) => (
            <button key={t.id} className="chip" aria-pressed={type === t.id} onClick={() => setType(type === t.id ? 'all' : t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {shown.length ? (
        <div className="list">
          {shown.map((id) => {
            const s = index.sources[id];
            const st = stats.get(id);
            return (
              <a key={id} href={`#library/${id}`} aria-current={selected === id ? 'true' : undefined}>
                <TypeBadge type={s.type} />
                <span className="grow">
                  <b>{s.title}</b>
                  <span className="meta">
                    {[s.author, typeInfo(s.type).label].filter(Boolean).join(' · ')}
                    {st?.count ? ` · ${st.count === 1 ? '1 learning' : `${st.count} learnings`}` : ''}
                    {st?.last ? ` · last ${formatDay(st.last)}` : ''}
                  </span>
                </span>
                <span className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                  <span className={`pill ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                  {s.rating ? <span className="stars">{starText(s.rating)}</span> : null}
                </span>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="small muted">{ids.length ? 'Nothing matches these filters.' : 'Sources you log from appear here. Add books you want to read with + Reading list.'}</p>
      )}
    </div>
  );

  return (
    <div className="two-col">
      <div className={hasSelected ? 'hide-narrow' : undefined}>{list}</div>
      {hasSelected ? (
        <SourceDetail key={selected} {...props} id={selected} />
      ) : (
        <div className="card muted small show-wide" style={{ textAlign: 'center' }}>
          Pick a source to see everything you learned from it.
        </div>
      )}
    </div>
  );
}

function AddToList({ journal, overview, update, toast, onDone }: Props & { onDone: (id?: string) => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<SourceType>('book');
  const [author, setAuthor] = useState('');
  const [saving, setSaving] = useState(false);
  const index = overview.index;
  const similar = title.trim().length > 2 ? matchSources(index, title, 3) : [];

  async function save() {
    setSaving(true);
    try {
      const t = title.trim();
      const a = author.trim() || undefined;
      const id = sourceIdFor(type, uniqueSlug(t, Object.keys(index.sources), a), dateKey().slice(0, 4));
      const r = await journal.saveSource({ id, type, title: t, author: type === 'book' || type === 'course' ? a : undefined, status: 'want' }, null);
      update((o) => ({ ...o, index: r.index, files: new Set([...o.files, sourcePath(id)]) }));
      toast({ text: `Added ${t} to your reading list` });
      onDone(id);
    } catch (e) {
      toast({ text: explainError(e), error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card stack">
      <h2>Add to your reading list</h2>
      <label className="field">
        <span className="label">Title</span>
        <input id="want-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {similar.length > 0 && (
        <p className="tiny muted" style={{ margin: 0 }}>
          Already in your library:{' '}
          {similar.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <a href={`#library/${id}`} onClick={() => onDone()}>
                {index.sources[id].title}
              </a>
            </span>
          ))}
        </p>
      )}
      <div className="chips" role="group" aria-label="Type of source">
        {SOURCE_TYPES.map((t) => (
          <button key={t.id} className="chip" aria-pressed={type === t.id} onClick={() => setType(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {(type === 'book' || type === 'course') && (
        <label className="field">
          <span className="label">Author (optional)</span>
          <input id="want-author" className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
      )}
      <div className="row">
        <button className="btn primary" disabled={!title.trim() || saving} onClick={save}>
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button className="btn ghost" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function SourceDetail({ journal, overview, update, toast, openLog, id }: Props & { id: string }) {
  const index = overview.index;
  const summary = index.sources[id];
  const today = dateKey();
  const [file, setFile] = useState<{ source: Source; raw: string | null } | null>(null);
  const [form, setForm] = useState<null | 'finished' | 'abandoned' | 'details'>(null);
  const [rating, setRating] = useState<number | null>(summary.rating ?? null);
  const [takeaway, setTakeaway] = useState(summary.takeaway ?? '');
  const [title, setTitle] = useState(summary.title);
  const [author, setAuthor] = useState(summary.author ?? '');
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const entries = entriesFor(index, id);
  const paths = new Set(entries.map((e) => learningPath(e.date, e.source)));
  const followUps = overview.followUps.items.filter((f) => f.source && paths.has(f.source));

  useEffect(() => {
    let live = true;
    journal
      .loadSource(id)
      .then((r) => live && setFile({ source: r.source ?? { id, ...summary }, raw: r.raw }))
      .catch((e) => live && toast({ text: explainError(e), error: true }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal, id, reload]);

  async function save(patch: Partial<Source>, message: string) {
    if (!file) return;
    setSaving(true);
    try {
      const r = await journal.saveSource({ ...file.source, ...patch }, file.raw);
      setFile({ source: r.source, raw: r.raw });
      update((o) => ({ ...o, index: r.index }));
      setForm(null);
      toast({ text: message });
    } catch (e) {
      if (e instanceof ConflictError) {
        toast({ text: 'This source was changed somewhere else. I reloaded it; please try again.', error: true });
        setReload((n) => n + 1);
      } else toast({ text: explainError(e), error: true });
    } finally {
      setSaving(false);
    }
  }

  const setStatus = (s: SourceStatus) => {
    if (s === 'finished' || s === 'abandoned') {
      setForm(s);
      return;
    }
    save({ status: s, finished: undefined }, `Moved to ${STATUS_LABEL[s]}`);
  };

  return (
    <div className="stack sticky-col" style={{ gap: 16 }}>
      <a href="#library" className="back hide-wide">
        ‹ Library
      </a>
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <TypeBadge type={summary.type} />
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h1 className="title" style={{ fontSize: 26, overflowWrap: 'anywhere' }}>
            {summary.title}
          </h1>
          <span className="small muted">
            {[summary.author, typeInfo(summary.type).label].filter(Boolean).join(' · ')}
            {summary.started ? ` · started ${formatShort(summary.started)}` : ''}
            {summary.finished && summary.status === 'finished' ? ` · finished ${formatShort(summary.finished)}` : ''}
          </span>
          {summary.rating ? <span className="stars">{starText(summary.rating)}</span> : null}
        </div>
      </div>

      <button className="btn primary" onClick={() => openLog({ source: id })}>
        Log a learning from this
      </button>

      <div className="chips" role="group" aria-label="Change status">
        {STATUSES.map((s) => (
          <button key={s} className="chip" disabled={!file || saving} aria-pressed={summary.status === s && form === null ? true : form === s} onClick={() => setStatus(s)}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {(form === 'finished' || form === 'abandoned') && (
        <div className="card stack">
          <h2>{form === 'finished' ? `Finished ${summary.title}` : 'Stopping here'}</h2>
          {form === 'finished' && (
            <div className="field">
              <span className="label">Your rating</span>
              <RatingInput value={rating} onChange={setRating} />
            </div>
          )}
          <label className="field">
            <span className="label">{form === 'finished' ? 'What I took from this' : 'Why I stopped, and what I got anyway'}</span>
            <textarea id="takeaway" className="textarea short" value={takeaway} onChange={(e) => setTakeaway(e.target.value)} placeholder={form === 'finished' ? 'One paragraph, in your own words.' : 'e.g. Lovely photos, but I wanted the physics.'} />
          </label>
          <div className="row">
            <button
              className="btn primary"
              disabled={saving}
              onClick={() =>
                save(
                  { status: form, rating: form === 'finished' ? rating : file?.source.rating, takeaway: takeaway.trim() || undefined, finished: form === 'finished' ? (file?.source.finished ?? today) : undefined },
                  form === 'finished' ? `Finished ${summary.title}` : `Stopped ${summary.title}`,
                )
              }
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {summary.takeaway && form === null && (
        <div className="card stack" style={{ gap: 6 }}>
          <div className="spread">
            <span className="section-label">{summary.status === 'abandoned' ? 'Why I stopped' : 'What I took from this'}</span>
            <button className="link" onClick={() => setForm(summary.status === 'abandoned' ? 'abandoned' : 'finished')}>
              Edit
            </button>
          </div>
          <p className="pre" style={{ margin: 0 }}>
            {summary.takeaway}
          </p>
        </div>
      )}

      <section className="stack" style={{ gap: 6 }}>
        <h2 className="section-label">{entries.length === 1 ? '1 learning' : `${entries.length} learnings`}</h2>
        {entries.length ? (
          <div className="timeline">
            {entries.map((e) => (
              <article key={e.key} className="tl-item">
                <div className="tl-head spread">
                  <span>{formatDay(e.date)}</span>
                  <button className="link" style={{ textTransform: 'none', letterSpacing: 0 }} onClick={() => openLog({ date: e.date, source: e.source })}>
                    Edit
                  </button>
                </div>
                <p className="learned">{e.learned}</p>
                <Csd e={e} />
              </article>
            ))}
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Nothing logged from this yet.
          </p>
        )}
      </section>

      {followUps.length > 0 && (
        <section className="stack" style={{ gap: 6 }}>
          <h2 className="section-label">What you tried</h2>
          {followUps.map((f) => (
            <div key={f.id} className="spread small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <span style={{ overflowWrap: 'anywhere' }}>
                {f.text}
                {f.outcome ? <span className="muted"> · {f.outcome}</span> : null}
              </span>
              <span className={`status status-${f.status}`}>{f.status === 'open' ? `ask ${formatDay(f.due)}` : FU_STATUS[f.status]}</span>
            </div>
          ))}
        </section>
      )}

      {form === 'details' ? (
        <div className="card stack">
          <label className="field">
            <span className="label">Title</span>
            <input id="edit-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Author</span>
            <input id="edit-author" className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <p className="tiny muted" style={{ margin: 0 }}>
            The file name stays <span className="path">{sourcePath(id)}</span> so links keep working.
          </p>
          <div className="row">
            <button className="btn primary" disabled={!title.trim() || saving} onClick={() => save({ title: title.trim(), author: author.trim() || undefined }, 'Saved')}>
              Save
            </button>
            <button className="btn ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="link" disabled={!file} onClick={() => setForm('details')}>
            Edit title or author
          </button>
          <ExternalLink href={journal.fileUrl(sourcePath(id))}>Open on GitHub ↗</ExternalLink>
        </div>
      )}
    </div>
  );
}

export function Csd({ e }: { e: { continue?: string; stop?: string; start?: string } }) {
  if (!e.continue && !e.stop && !e.start) return null;
  return (
    <dl className="csd">
      {e.continue && (
        <>
          <dt>Continue</dt>
          <dd>{e.continue}</dd>
        </>
      )}
      {e.stop && (
        <>
          <dt>Stop</dt>
          <dd>{e.stop}</dd>
        </>
      )}
      {e.start && (
        <>
          <dt>Start</dt>
          <dd>{e.start}</dd>
        </>
      )}
    </dl>
  );
}
