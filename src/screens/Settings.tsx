import { useState } from 'react';
import type { UpdateOverview } from '../App';
import { ConfirmButton, ExternalLink, type ToastState } from '../components/ui';
import { CONFIG_PATH } from '../lib/entries';
import { explainError } from '../lib/github';
import type { Journal, Overview } from '../lib/journal';
import { gapLabel } from '../lib/recall';
import type { Settings as SettingsT } from '../lib/store';

interface Props {
  settings: SettingsT;
  journal: Journal;
  overview: Overview;
  update: UpdateOverview;
  onDisconnect: () => void;
  toast: (t: ToastState) => void;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Settings({ settings, journal, overview, update, onDisconnect, toast }: Props) {
  const [busy, setBusy] = useState(false);
  const { config, index } = overview;
  const entries = Object.keys(index.entries).length;
  const sources = Object.keys(index.sources).length;

  async function rebuild() {
    setBusy(true);
    try {
      const r = await journal.rebuild(config);
      update((o) => ({ ...o, index: r.index, recall: r.recall }));
      toast({ text: `Rebuilt from ${Object.keys(r.index.entries).length} learnings and ${Object.keys(r.index.sources).length} sources` });
    } catch (e) {
      toast({ text: explainError(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow stack" style={{ gap: 16 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <a href="#today" className="back">
          ‹ Today
        </a>
        <h1 className="title">Settings</h1>
      </div>

      <div className="card stack">
        <div>
          <span className="label">Connected to</span>
          <div style={{ fontWeight: 650, wordBreak: 'break-all' }}>
            {settings.owner}/{settings.repo}
          </div>
          <div className="small muted">
            branch {settings.branch} · {entries} learnings from {sources} sources
          </div>
        </div>
        <div className="row">
          <ExternalLink href={journal.repoUrl}>Open repo on GitHub ↗</ExternalLink>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h2>Your settings</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Recall after {config.recallIntervals.map(gapLabel).join(', ')} · at most {config.recallPerDay} a day · weekly review on {DAYS[config.weeklyDay]} · follow-ups after{' '}
            {gapLabel(config.followUpDays)} · {config.weeklyQuestions.length} weekly questions of your own.
          </p>
        </div>
        <ExternalLink href={journal.editUrl(CONFIG_PATH)} className="btn ghost">
          Edit settings on GitHub ↗
        </ExternalLink>
        <p className="tiny muted" style={{ margin: 0 }}>
          Opens <span className="path">{CONFIG_PATH}</span>. Reopen the app after committing to pick up the change.
        </p>
      </div>

      <div className="card stack">
        <div>
          <h2>Rebuild</h2>
          <p className="small muted" style={{ margin: 0 }}>
            The library, search and recall read <span className="path">.journal/index.json</span> and <span className="path">recall.json</span>. If you edit or add files directly
            on GitHub, rebuild them from your Markdown files.
          </p>
        </div>
        <button className="btn" onClick={rebuild} disabled={busy}>
          {busy ? 'Rebuilding…' : 'Rebuild from my files'}
        </button>
      </div>

      <div className="card stack">
        <div>
          <h2>This device</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Your token and any unsaved drafts are stored only in this browser. Disconnecting removes them here. Nothing on GitHub changes.
          </p>
        </div>
        <ConfirmButton label="Disconnect this device" confirm="Yes, disconnect" onConfirm={onDisconnect} />
      </div>

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        bookjournal · your learnings are Markdown files you own
      </p>
    </div>
  );
}
