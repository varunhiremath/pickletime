import { useState } from 'react';
import { Copy, Check, Share2, KeyRound, Ban } from 'lucide-react';
import Chip from '../ui/Chip.jsx';
import { toast, confirmDialog } from '../../store/uiStore.js';
import { useHaptics } from '../../hooks/useHaptics.js';
import { buildJoinUrl, buildInviteMessage } from '../../utils/inviteLink.js';

/**
 * The invite state for one roster row, admin-only.
 *
 * Three states, and the copy says plainly what each means:
 *   not invited  → mint a code
 *   invited      → show it, copy/share it, or revoke it
 *   joined       → they're on a device; revoking cuts that device off
 *
 * Codes are readable rather than hashed, so a lost code can be re-sent instead
 * of re-minted. Only the admin can see them — RLS blocks every other account
 * from reading the invites table at all.
 */
export default function InviteRow({ member, invite, clubName, onMint, onRevoke }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const haptic = useHaptics();

  const claimed = Boolean(member.userId);

  // A link that opens the app with the code already in the field, so the
  // recipient taps rather than retypes. Sending the bare code — which is all
  // this used to do — left them holding eight characters and no address.
  const joinUrl = invite
    ? buildJoinUrl(invite.code, {
        origin: typeof window === 'undefined' ? '' : window.location.origin,
        base: import.meta.env.BASE_URL,
      })
    : null;

  const writeToClipboard = async (text, note) => {
    try {
      await navigator.clipboard.writeText(text);
      haptic('tap');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      if (note) toast(note, { type: 'success' });
      return true;
    } catch {
      toast('Could not copy — long-press the code to select it.', { type: 'error' });
      return false;
    }
  };

  const copy = () => writeToClipboard(invite.code);

  const share = async () => {
    const text = buildInviteMessage({
      clubName,
      memberName: member.name,
      url: joinUrl,
      code: invite.code,
    });
    try {
      if (navigator.share) await navigator.share({ text });
      // No share sheet (most desktops) — put the whole message on the clipboard
      // rather than just the code, so pasting it is enough.
      else await writeToClipboard(text, 'Invite copied — paste it to them.');
    } catch {
      // The user dismissed the share sheet — not an error worth reporting.
    }
  };

  const mint = async () => {
    setBusy(true);
    try {
      await onMint(member.id);
      haptic('success');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    const ok = await confirmDialog({
      title: `Revoke ${member.name}'s code?`,
      message: claimed
        ? `Their phone loses access on its next request. ${member.name} stays on the roster and keeps their results — you can send them a new code any time.`
        : 'The code stops working. You can mint a new one whenever you like.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onRevoke(member.id);
      toast(`${member.name}'s code revoked.`, { type: 'info' });
    } finally {
      setBusy(false);
    }
  };

  if (claimed) {
    return (
      <div className="flex items-center gap-2">
        <Chip tone="optic">
          <Check size={10} /> Joined
        </Chip>
        <button
          onClick={revoke}
          disabled={busy}
          className="flex items-center gap-1 font-sans text-xs font-semibold disabled:opacity-40"
          style={{ color: 'var(--clay)' }}
        >
          <Ban size={12} /> Revoke
        </button>
      </div>
    );
  }

  if (!invite || invite.revoked) {
    return (
      <button
        onClick={mint}
        disabled={busy}
        className="flex items-center gap-1.5 font-sans text-xs font-semibold disabled:opacity-40"
        style={{ color: 'var(--optic-ink)' }}
      >
        <KeyRound size={13} />
        {invite?.revoked ? 'New code' : 'Invite'}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code
        className="font-display num select-all text-[13px] font-bold"
        style={{
          padding: '4px 9px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-raised)',
          color: 'var(--text-hi)',
          letterSpacing: '0.04em',
        }}
      >
        {invite.code}
      </code>

      <button
        onClick={copy}
        aria-label={`Copy ${member.name}'s code`}
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ background: 'var(--bg-raised)', color: copied ? 'var(--optic-ink)' : 'var(--text-lo)' }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>

      <button
        onClick={share}
        aria-label={`Send ${member.name}'s invite link`}
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
      >
        <Share2 size={13} />
      </button>

      <button
        onClick={revoke}
        disabled={busy}
        aria-label={`Revoke ${member.name}'s code`}
        className="flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-40"
        style={{ background: 'var(--bg-raised)', color: 'var(--clay)' }}
      >
        <Ban size={13} />
      </button>
    </div>
  );
}
