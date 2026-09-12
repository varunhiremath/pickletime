import { CONNECTION } from '../../sync/backend.js';
import { CloudOff, Wifi } from 'lucide-react';

/**
 * Connection state, shown as broadcast furniture.
 *
 * The pulse is a genuine indicator, not decoration: it only animates while the
 * realtime connection is actually up. A steady dot means "not receiving
 * updates", so a glance at the header answers "am I seeing everyone's scores?"
 *
 * It says "Synced", not "Live". "Live" was read as the session — reasonably,
 * since the club card labels a running session exactly that — and a badge that
 * kept pulsing "Live" over a finished session looked like a bug rather than a
 * connection indicator. Nothing about this badge has ever concerned the
 * session; see utils/sessionState.js for the thing that does.
 */
export default function LiveBadge({ connection, pending = 0 }) {
  if (connection === CONNECTION.OFFLINE) {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-sans text-[11px] font-bold uppercase tracking-wider"
        style={{
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          background: 'color-mix(in srgb, var(--clay) 16%, transparent)',
          color: 'var(--clay)',
        }}
      >
        <CloudOff size={12} />
        Offline
        {pending > 0 && <span className="num">· {pending}</span>}
      </span>
    );
  }

  if (connection === CONNECTION.LOCAL) {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-sans text-[11px] font-bold uppercase tracking-wider"
        style={{
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--bg-raised)',
          color: 'var(--text-lo)',
        }}
      >
        <Wifi size={12} />
        This device
      </span>
    );
  }

  const synced = connection === CONNECTION.LIVE;

  return (
    <span
      className="inline-flex items-center gap-1.5 font-sans text-[11px] font-bold uppercase tracking-wider"
      style={{
        padding: '4px 10px',
        borderRadius: 'var(--radius-full)',
        background: synced ? 'color-mix(in srgb, var(--optic) 16%, transparent)' : 'var(--bg-raised)',
        color: synced ? 'var(--optic-ink)' : 'var(--text-lo)',
      }}
    >
      <span
        className={synced ? 'a-pulse' : ''}
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: synced ? 'var(--optic)' : 'var(--text-lo)',
        }}
      />
      {synced ? 'Synced' : 'Connecting'}
    </span>
  );
}
