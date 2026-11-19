import { useEffect, useState, type ReactNode } from 'react';
import { typeInfo, type SourceType } from '../lib/entries';

export type ToastState = { text: string; error?: boolean } | null;

export function Toast({ toast, onDone }: { toast: ToastState; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, toast.error ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  if (!toast) return null;
  return (
    <div className={`toast${toast.error ? ' error' : ''}`} role="status" onClick={onDone}>
      {toast.text}
    </div>
  );
}

export function Loading({ children = 'Loading…' }: { children?: ReactNode }) {
  return <div className="center muted">{children}</div>;
}

/** Inline "are you sure" without browser dialogs. */
export function ConfirmButton({ label, confirm, onConfirm, className = 'btn ghost' }: { label: string; confirm: string; onConfirm: () => void; className?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <div className="row">
      <button type="button" className="btn danger" onClick={onConfirm}>
        {confirm}
      </button>
      <button type="button" className="btn ghost" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </div>
  );
}

export function ExternalLink({ href, children, className = 'small muted' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
      {children}
    </a>
  );
}

/** Two-letter badge for a source type: Bk, Vd, Ar … */
const BADGE: Record<SourceType, string> = { book: 'Bk', video: 'Vd', article: 'Ar', podcast: 'Pc', course: 'Co', conversation: 'Ta', other: '··' };

export function TypeBadge({ type }: { type: SourceType }) {
  return (
    <span className="type-dot" title={typeInfo(type).label} aria-hidden="true">
      {BADGE[type]}
    </span>
  );
}

export const starText = (n: number | null | undefined) => (n ? `${'★'.repeat(n)}${'☆'.repeat(5 - n)}` : '');

export function RatingInput({ value, onChange }: { value: number | null | undefined; onChange: (n: number | null) => void }) {
  return (
    <div className="rating" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={!!value && n <= value} onClick={() => onChange(value === n ? null : n)}>
          {value && n <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}

/** Wrap matches of `query` in <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

const ICONS: Record<string, ReactNode> = {
  today: <path d="M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4" />,
  library: (
    <>
      <path d="M5 4v16M9 4v16" />
      <path d="m13.5 5.2 3.9-1 3.4 14.6-3.9 1z" />
    </>
  ),
  review: (
    <>
      <path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </>
  ),
  history: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
};

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
