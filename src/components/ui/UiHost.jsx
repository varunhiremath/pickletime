import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import useUIStore from '../../store/uiStore.js';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

// Renders whatever uiStore is holding: toasts, a confirm, a prompt.
// Mounted once in AppLayout so any code can raise a dialog without prop drilling.

function Toasts() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;

  const icons = {
    success: <CheckCircle2 size={17} style={{ color: 'var(--optic-ink)' }} />,
    error: <AlertTriangle size={17} style={{ color: 'var(--clay)' }} />,
    info: <Info size={17} style={{ color: 'var(--court)' }} />,
  };

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="a-fade-up pointer-events-auto flex w-full max-w-md items-start gap-3 text-left"
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-raised)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-pop)',
            color: 'var(--text-hi)',
          }}
        >
          <span className="mt-0.5 shrink-0">{icons[t.type] ?? icons.info}</span>
          <span className="font-sans text-sm leading-snug">{t.message}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

function ConfirmHost() {
  const state = useUIStore((s) => s.confirmState);
  const resolve = useUIStore((s) => s.resolveConfirm);
  if (!state) return null;

  return (
    <Modal
      open
      onClose={() => resolve(false)}
      title={state.title ?? 'Are you sure?'}
      danger={state.danger}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" full onClick={() => resolve(false)}>
            {state.cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant={state.danger ? 'danger' : 'primary'} full onClick={() => resolve(true)}>
            {state.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      }
    >
      <p className="font-sans text-sm leading-relaxed" style={{ color: 'var(--text-lo)' }}>
        {state.message}
      </p>
    </Modal>
  );
}

function PromptHost() {
  const state = useUIStore((s) => s.promptState);
  const resolve = useUIStore((s) => s.resolvePrompt);
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(state?.defaultValue ?? '');
  }, [state]);

  if (!state) return null;

  const submit = (e) => {
    e?.preventDefault();
    resolve(value.trim() || null);
  };

  return (
    <Modal
      open
      onClose={() => resolve(null)}
      title={state.title ?? 'Enter a value'}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" full onClick={() => resolve(null)}>
            Cancel
          </Button>
          <Button variant="primary" full onClick={submit}>
            {state.confirmLabel ?? 'Save'}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit}>
        {state.message && (
          <p className="mb-3 font-sans text-sm" style={{ color: 'var(--text-lo)' }}>
            {state.message}
          </p>
        )}
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={state.placeholder}
          className="w-full font-sans text-base outline-none"
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-raised)',
            border: '1px solid var(--line)',
            color: 'var(--text-hi)',
          }}
        />
      </form>
    </Modal>
  );
}

export default function UiHost() {
  return (
    <>
      <Toasts />
      <ConfirmHost />
      <PromptHost />
    </>
  );
}
