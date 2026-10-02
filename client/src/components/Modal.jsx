import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';

/** Accessible modal: focus moves in, Escape closes, focus returns on close. */
export function Modal({ open, onClose, title, children, footer, size = '' }) {
  const ref = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const first = ref.current?.querySelector('input, select, textarea, button:not(.icon-btn)');
    (first || ref.current)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const firstEl = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lastFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size ? `modal-${size}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref} tabIndex={-1}>
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog"><LuX /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false, busy, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
          <button type="button" className={`btn btn-sm ${danger ? 'btn-danger' : ''}`} onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner" aria-hidden />} {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}
