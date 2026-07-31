import { Link } from 'react-router-dom';
import { ChevronLeft, Monitor, Moon, Sun } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import useSettingsStore from '../store/settingsStore.js';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { confirmDialog, toast } from '../store/uiStore.js';

function Toggle({ label, hint, checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className="flex w-full items-center gap-3 text-left"
      style={{
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line)',
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
          {label}
        </span>
        {hint && (
          <span className="block font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            {hint}
          </span>
        )}
      </span>
      <span
        className="relative shrink-0"
        style={{
          width: 42,
          height: 24,
          borderRadius: 'var(--radius-full)',
          background: checked ? 'var(--optic)' : 'var(--bg-raised)',
          transition: 'background var(--dur-standard)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: checked ? 'var(--text-on-accent)' : 'var(--text-lo)',
            transition: 'left var(--dur-standard) var(--ease-out)',
          }}
        />
      </span>
    </button>
  );
}

const THEME_OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'light', label: 'Light', Icon: Sun },
];

export default function SettingsPage() {
  const settings = useSettingsStore();
  const refresh = useSessionStore((s) => s.refresh);

  const wipe = async () => {
    const ok = await confirmDialog({
      title: 'Erase everything on this device?',
      message:
        'The club, roster, every session and every score stored on this phone are deleted. This cannot be undone.',
      confirmLabel: 'Erase',
      danger: true,
    });
    if (!ok) return;
    await getBackend().signOut();
    await refresh();
    toast('Local data erased.', { type: 'info' });
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <Link
          to="/club"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
        >
          <ChevronLeft size={18} />
        </Link>
        <h1
          className="font-display text-2xl font-extrabold"
          style={{ letterSpacing: '-0.02em', color: 'var(--text-hi)' }}
        >
          Settings
        </h1>
      </div>

      <div className="flex flex-col gap-5 px-4">
        <section className="flex flex-col gap-2">
          <h2
            className="font-sans text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-lo)' }}
          >
            Appearance
          </h2>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label, Icon }) => {
              const active = settings.theme === value;
              return (
                <button
                  key={value}
                  onClick={() => settings.setTheme(value)}
                  className="flex flex-1 flex-col items-center gap-1.5"
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    border: `1.5px solid ${active ? 'var(--optic)' : 'var(--line)'}`,
                    color: active ? 'var(--optic-ink)' : 'var(--text-lo)',
                  }}
                >
                  <Icon size={18} />
                  <span className="font-sans text-xs font-semibold">{label}</span>
                </button>
              );
            })}
          </div>
          <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--text-lo)' }}>
            Dark is the default. On a sunny court, light mode at full brightness is usually easier to
            read.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2
            className="font-sans text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-lo)' }}
          >
            Feedback
          </h2>
          <Toggle
            label="Animations"
            hint="Standings reordering, score rolls, celebrations"
            checked={settings.effects}
            onChange={() => settings.toggle('effects')}
          />
          <Toggle
            label="Sound"
            hint="Chimes when a score is saved"
            checked={settings.sound}
            onChange={() => settings.toggle('sound')}
          />
          <Toggle
            label="Vibration"
            hint="Taps and confirmations"
            checked={settings.haptics}
            onChange={() => settings.toggle('haptics')}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h2
            className="font-sans text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--clay)' }}
          >
            Danger zone
          </h2>
          <Button variant="danger" full onClick={wipe}>
            Erase all data on this device
          </Button>
        </section>

        <p className="pb-4 text-center font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
          PickleTime · data is stored on this device
        </p>
      </div>
    </>
  );
}
