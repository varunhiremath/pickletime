import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Sheet-style modal, portalled to document.body.
 *
 * Portalling matters: any ancestor with a transform becomes the containing block
 * for fixed children, which silently traps a full-screen overlay inside a card.
 * Going straight to body avoids that class of bug entirely.
 */
export default function Modal({ open, onClose, title, children, footer, danger = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    // Stop the page behind the sheet from scrolling with it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full"
        style={{ background: 'rgba(3, 7, 15, 0.66)', backdropFilter: 'blur(2px)' }}
      />
      <div
        className="a-fade-up relative flex w-full max-w-md flex-col"
        style={{
          maxHeight: '90vh',
          background: 'var(--bg-surface)',
          borderTopLeftRadius: 'var(--radius-2xl)',
          borderTopRightRadius: 'var(--radius-2xl)',
          borderBottomLeftRadius: 'var(--radius-2xl)',
          borderBottomRightRadius: 'var(--radius-2xl)',
          boxShadow: 'var(--shadow-pop)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <h2
            className="font-display text-lg font-bold"
            style={{ color: danger ? 'var(--clay)' : 'var(--text-hi)' }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="shrink-0 px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
