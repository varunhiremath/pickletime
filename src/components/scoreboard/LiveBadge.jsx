import { CONNECTION } from '../../sync/backend.js';
import { CloudOff, Wifi } from 'lucide-react';

/**
 * The header badge: is a session on, and are my scores reaching everyone?
 *
 * Two facts, one chip, because a phone header at a court has room for one.
 *
 *   the word  →  the SESSION.   "In play" while there are games left,
 *                               "Finished" when there are not.
 *   the dot   →  the CONNECTION. It pulses only while realtime is genuinely
 *                               up, so a glance answers "am I seeing
 *                               everyone's scores?"
 *
 * Offline and Connecting take over the word entirely. Both are rare and both
 * are actionable — "your scores are not going anywhere" outranks anything the
 * badge could say about the session.
 *
 * It used to read "Live" and mean the connection only, which was read as the
 * session — reasonably, since the club card labels a running session exactly
 * that. A badge pulsing "Live" over a session that had plainly ended looked
 * like a bug. Now the word means what people thought it meant.
 */
export default function LiveBadge({ connection, pending = 0, session = null }) {
  if (connection === CONNECTION.OFFLINE) {
    return (
      <Pill background="color-mix(in srgb, var(--clay) 16%, transparent)" color="var(--clay)">
        <CloudOff size={12} />
        Offline
        {pending > 0 && <span className="num">· {pending}</span>}
      </Pill>
    );
  }

  if (connection === CONNECTION.CONNECTING) {
    return (
      <Pill background="var(--bg-raised)" color="var(--text-lo)">
        <Dot />
        Connecting
      </Pill>
    );
  }

  // A shared session that is live gets the pulse; single-device mode says so,
  // because "synced" would be a claim about a server that isn't there.
  const shared = connection === CONNECTION.LIVE;

  if (!session) {
    return shared ? (
      <Pill
        background="color-mix(in srgb, var(--optic) 16%, transparent)"
        color="var(--optic-ink)"
      >
        <Dot live />
        Synced
      </Pill>
    ) : (
      <Pill background="var(--bg-raised)" color="var(--text-lo)">
        <Wifi size={12} />
        This device
      </Pill>
    );
  }

  if (session === 'over') {
    return (
      <Pill background="var(--bg-raised)" color="var(--text-lo)">
        <Dot />
        Finished
      </Pill>
    );
  }

  return (
    <Pill background="color-mix(in srgb, var(--optic) 16%, transparent)" color="var(--optic-ink)">
      <Dot live={shared} />
      In play
    </Pill>
  );
}

function Pill({ background, color, children }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-sans text-[11px] font-bold uppercase tracking-wider"
      style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background, color }}
    >
      {children}
    </span>
  );
}

/** The connection half. Animated only when realtime is actually up. */
function Dot({ live = false }) {
  return (
    <span
      className={live ? 'a-pulse' : ''}
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: live ? 'var(--optic)' : 'currentColor',
        opacity: live ? 1 : 0.55,
      }}
    />
  );
}
