import { useCallback, useEffect, useState } from 'react';
import { Icon, Loading, Toast, type ToastState } from './components/ui';
import { dateKey } from './lib/dates';
import { dueFollowUps } from './lib/followups';
import { GitHub, GitHubError, explainError } from './lib/github';
import { Journal, type Overview } from './lib/journal';
import { recallQueue } from './lib/recall';
import { clearDevice, loadSettings, type Settings as SettingsT } from './lib/store';
import { Connect } from './screens/Connect';
import { FollowUps } from './screens/FollowUps';
import { History } from './screens/History';
import { Library } from './screens/Library';
import { Log, type LogTarget } from './screens/Log';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';

export type Tab = 'today' | 'library' | 'review' | 'history';
type Page = Tab | 'log' | 'weekly' | 'settings' | 'followups';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'library', label: 'Library' },
  { id: 'review', label: 'Review' },
  { id: 'history', label: 'History' },
];
const PAGES: Page[] = ['today', 'library', 'review', 'history', 'log', 'weekly', 'settings', 'followups'];

/** "#library/books/the-patient-mind" → { page: 'library', sub: 'books/the-patient-mind' } */
function routeFromHash(): { page: Page; sub: string } {
  const h = decodeURIComponent(location.hash.slice(1));
  const [page, ...rest] = h.split('/');
  return PAGES.includes(page as Page) ? { page: page as Page, sub: rest.join('/') } : { page: 'today', sub: '' };
}

export type Go = (page: Page, sub?: string) => void;
export type UpdateOverview = (fn: (o: Overview) => Overview) => void;

const makeJournal = (s: SettingsT) => new Journal(new GitHub(s.owner, s.repo, s.token), s.branch, `https://github.com/${s.owner}/${s.repo}`);

export function App() {
  const [settings, setSettings] = useState<SettingsT | null>(loadSettings);
  const [journal, setJournal] = useState<Journal | null>(() => (settings ? makeJournal(settings) : null));
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<{ text: string; auth: boolean } | null>(null);
  const [route, setRoute] = useState(routeFromHash);
  const [logTarget, setLogTarget] = useState<LogTarget>({});
  const [logKey, setLogKey] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const [reload, setReload] = useState(0);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const on = () => {
      setRoute(routeFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    if (!journal) return;
    let live = true;
    setError(null);
    journal
      .overview()
      .then((o) => live && setOverview(o))
      .catch((e) => live && setError({ text: explainError(e), auth: e instanceof GitHubError && (e.status === 401 || e.status === 404) }));
    return () => {
      live = false;
    };
  }, [journal, reload]);

  const go: Go = (page, sub = '') => {
    const hash = sub ? `${page}/${sub}` : page;
    if (decodeURIComponent(location.hash.slice(1)) !== hash) location.hash = hash;
    else setRoute({ page, sub });
    window.scrollTo(0, 0);
  };
  const openLog = (target: LogTarget = {}) => {
    setLogTarget(target);
    setLogKey((k) => k + 1); // a fresh flow every time, even from the Log screen itself
    go('log');
  };
  const update: UpdateOverview = (fn) => setOverview((o) => (o ? fn(o) : o));

  const disconnect = () => {
    clearDevice();
    setSettings(null);
    setJournal(null);
    setOverview(null);
    go('today');
  };

  if (!settings || !journal)
    return (
      <Connect
        onConnected={(s, j) => {
          setSettings(s);
          setJournal(j);
          go('today');
        }}
      />
    );

  const today = dateKey();
  const page = route.page;
  const activeTab: Tab = page === 'weekly' ? 'review' : page === 'followups' || page === 'settings' ? (page === 'followups' ? 'history' : 'today') : page === 'log' ? 'today' : page;
  const dueCount = overview ? dueFollowUps(overview.followUps, today).length + recallQueue(overview.recall, today, overview.config.recallPerDay).due.length : 0;

  const nav = (
    <nav className="tabbar" aria-label="Sections" hidden={page === 'log'}>
      <span className="brand">bookjournal</span>
      {TABS.map((t) => (
        <a key={t.id} href={`#${t.id}`} aria-current={activeTab === t.id ? 'page' : undefined}>
          <span className="tab-icon">
            <Icon name={t.id} />
            {t.id === 'today' && dueCount > 0 && <i className="badge" aria-label={`${dueCount} things due`} />}
          </span>
          {t.label}
        </a>
      ))}
    </nav>
  );

  let body;
  if (error)
    body = (
      <div className="narrow stack">
        <div className="notice danger">{error.text}</div>
        <button className="btn" onClick={() => setReload((r) => r + 1)}>
          Try again
        </button>
        {error.auth && (
          <button className="btn ghost" onClick={disconnect}>
            Connect with a different repo or token
          </button>
        )}
      </div>
    );
  else if (!overview) body = <Loading>Opening your journal…</Loading>;
  else if (page === 'log')
    body = <Log key={logKey} journal={journal} overview={overview} target={logTarget} update={update} toast={setToast} go={go} onAnother={() => openLog({})} />;
  else if (page === 'library') body = <Library journal={journal} overview={overview} selected={route.sub} update={update} toast={setToast} go={go} openLog={openLog} />;
  else if (page === 'review' || page === 'weekly')
    body = <Review journal={journal} overview={overview} tab={page === 'weekly' ? 'weekly' : 'recall'} week={route.sub} update={update} toast={setToast} go={go} />;
  else if (page === 'history') body = <History journal={journal} overview={overview} day={route.sub} go={go} openLog={openLog} />;
  else if (page === 'followups') body = <FollowUps journal={journal} overview={overview} update={update} toast={setToast} />;
  else if (page === 'settings')
    body = <Settings settings={settings} journal={journal} overview={overview} update={update} onDisconnect={disconnect} toast={setToast} />;
  else body = <Today journal={journal} overview={overview} update={update} toast={setToast} go={go} openLog={openLog} />;

  return (
    <>
      {nav}
      <main className="shell" style={page === 'log' ? { paddingBottom: 0 } : undefined}>
        {body}
      </main>
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
}
