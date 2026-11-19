// History (prototype A's structure): a month calendar and follow-ups on the
// left; search and the timeline of everything you've learned on the right.

import { useMemo, useState } from 'react';
import type { Go } from '../App';
import { ExternalLink, Highlight } from '../components/ui';
import { dateKey, formatDay, formatLong, formatMonth, isDateKey, monthGrid } from '../lib/dates';
import { learningPath } from '../lib/entries';
import { dueFollowUps, upcomingFollowUps } from '../lib/followups';
import type { Journal, Overview } from '../lib/journal';
import { daysWritten, entriesNewestFirst, searchIndex, streaks, type EntrySummary } from '../lib/journalIndex';
import { Csd } from './Library';
import type { LogTarget } from './Log';

const PAGE = 20;

export function History({ journal, overview, day, go, openLog }: { journal: Journal; overview: Overview; day: string; go: Go; openLog: (t?: LogTarget) => void }) {
  const today = dateKey();
  const { index } = overview;
  const selected = isDateKey(day) ? day : '';
  const [month, setMonth] = useState(() => (selected || today).slice(0, 7));
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const written = useMemo(() => daysWritten(index), [index]);
  const { current, best } = streaks(written, today);
  const all = useMemo(() => entriesNewestFirst(index), [index]);
  const hits = useMemo(() => searchIndex(index, query), [index, query]);
  const open = dueFollowUps(overview.followUps, today).length + upcomingFollowUps(overview.followUps, today).length;

  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const grid = monthGrid(year, mon);
  const shift = (n: number) => {
    const d = new Date(year, mon - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const inMonth = [...written].filter((d) => d.startsWith(month)).length;

  let list: (EntrySummary & { key: string })[];
  let heading: string;
  if (query.trim()) {
    const keys = new Set(hits.map((h) => h.key));
    list = all.filter((e) => keys.has(e.key));
    heading = list.length ? `${list.length} ${list.length === 1 ? 'match' : 'matches'}` : 'No matches';
  } else if (selected) {
    list = all.filter((e) => e.date === selected);
    heading = formatLong(selected);
  } else {
    list = all;
    heading = 'Everything, newest first';
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <span className="kicker">History</span>
          <h1 className="title">Everything you've learned</h1>
        </div>
        <span className="streak">
          <b>{current}</b> day streak · best {best}
        </span>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: undefined }}>
        <section className="stack sticky-col" style={{ gap: 16 }}>
          <div className="card stack" style={{ gap: 10 }}>
            <div className="spread" style={{ flexWrap: 'nowrap' }}>
              <button className="iconbtn" aria-label="Previous month" onClick={() => shift(-1)}>
                ‹
              </button>
              <div style={{ textAlign: 'center' }}>
                <b>{formatMonth(year, mon)}</b>
                <div className="tiny muted">{inMonth === 1 ? '1 day logged' : `${inMonth} days logged`}</div>
              </div>
              <button className="iconbtn" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => shift(1)}>
                ›
              </button>
            </div>
            <div className="cal" role="grid" aria-label={formatMonth(year, mon)}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((h, i) => (
                <span key={i} className="h" aria-hidden="true">
                  {h}
                </span>
              ))}
              {grid.map((d, i) =>
                d ? (
                  <button
                    key={d}
                    className={d === today ? 'today' : undefined}
                    aria-pressed={d === selected}
                    aria-label={`${formatDay(d)}${written.has(d) ? ', logged' : ''}`}
                    disabled={d > today}
                    onClick={() => {
                      setQuery('');
                      go('history', d === selected ? '' : d);
                    }}
                  >
                    {Number(d.slice(8))}
                    <i className={written.has(d) ? undefined : 'none'} />
                  </button>
                ) : (
                  <span key={`x${i}`} />
                ),
              )}
            </div>
          </div>
          <a className="card todo" href="#followups" style={{ padding: 14 }}>
            <span className="todo-text">
              <b>Follow-ups</b>
              <span className="small muted">{open ? `${open} open · what you said you'd start or stop` : 'Everything you said you’d start or stop, and how it went'}</span>
            </span>
            <span className="link accent" style={{ marginLeft: 'auto' }}>
              Open
            </span>
          </a>
        </section>

        <section className="stack" style={{ gap: 12 }}>
          <input
            id="search"
            className="input"
            type="search"
            placeholder="Search learnings, sources, stop / start…"
            aria-label="Search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
          <div className="spread">
            <h2 className="section-label">{heading}</h2>
            {selected && !query && (
              <button className="link" onClick={() => go('history')}>
                Show all
              </button>
            )}
          </div>
          {selected && !query && list.length === 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <p className="small muted" style={{ margin: 0 }}>
                Nothing logged on this day.
              </p>
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => openLog({ date: selected })}>
                Log a learning for {formatDay(selected)}
              </button>
            </div>
          )}
          {!selected && !query && list.length === 0 && <p className="small muted">Your learnings will appear here.</p>}
          <div className="timeline">
            {list.slice(0, limit).map((e) => {
              const src = index.sources[e.source];
              return (
                <article key={e.key} className="tl-item">
                  <div className="tl-head">
                    {formatDay(e.date)} ·{' '}
                    <a href={`#library/${e.source}`}>
                      <Highlight text={src?.title ?? e.source} query={query} />
                    </a>
                  </div>
                  <p className="learned">
                    <Highlight text={e.learned} query={query} />
                  </p>
                  <Csd e={e} />
                  <div className="actions">
                    <button className="link" onClick={() => openLog({ date: e.date, source: e.source })}>
                      Edit
                    </button>
                    <ExternalLink href={journal.fileUrl(learningPath(e.date, e.source))} className="link">
                      Open on GitHub ↗
                    </ExternalLink>
                  </div>
                </article>
              );
            })}
          </div>
          {list.length > limit && (
            <button className="btn ghost" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({list.length - limit} older)
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
