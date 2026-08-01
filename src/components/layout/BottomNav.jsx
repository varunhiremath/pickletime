import { NavLink } from 'react-router-dom';
import { Home, ListOrdered, Trophy, Users } from 'lucide-react';
import BallIcon from '../icons/BallIcon.jsx';
import { useHaptics } from '../../hooks/useHaptics.js';

// Sports-app vocabulary, not fitness-app vocabulary. Score sits in the middle as
// the emphasised action because during a session it is by far the most frequent
// thing anyone does.
const TABS = [
  { to: '/today', label: 'Today', Icon: Home },
  { to: '/matches', label: 'Matches', Icon: ListOrdered },
  { to: '/score', label: 'Score', Icon: BallIcon, primary: true },
  { to: '/standings', label: 'Standings', Icon: Trophy },
  { to: '/club', label: 'Club', Icon: Users },
];

export default function BottomNav() {
  const haptic = useHaptics();

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 items-start justify-around"
      style={{
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--line)',
        paddingTop: 'var(--space-2)',
        paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))',
        borderTopLeftRadius: 'var(--radius-xl)',
        borderTopRightRadius: 'var(--radius-xl)',
      }}
    >
      {TABS.map(({ to, label, Icon, primary }) => (
        <NavLink
          key={to}
          to={to}
          aria-label={label}
          onClick={() => haptic('tap')}
          className="flex flex-col items-center gap-1"
          style={{ minWidth: 56 }}
        >
          {({ isActive }) => (
            <>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{
                  background: primary ? 'var(--optic)' : 'transparent',
                  boxShadow: primary ? 'var(--optic-glow)' : 'none',
                  color: primary
                    ? 'var(--text-on-accent)'
                    : isActive
                      ? 'var(--optic-ink)'
                      : 'var(--text-lo)',
                  transform: !primary && isActive ? 'translateY(-1px) scale(1.1)' : 'none',
                  transition:
                    'transform var(--dur-standard) var(--ease-out), color var(--dur-standard)',
                }}
              >
                <Icon size={primary ? 21 : 22} strokeWidth={primary ? 2.4 : 2} />
              </span>
              <span
                className="font-sans text-[10px]"
                style={{
                  color: isActive ? 'var(--text-hi)' : 'var(--text-lo)',
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
