import { useEffect, useRef } from 'react';

export default function AdminDialog({ children, titleId, busy, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector('input, select, button')?.focus();
    return () => previous?.focus();
  }, []);
  const onKeyDown = event => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    if (!focusable.length) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  };
  return <div className="modal-backdrop" onKeyDown={onKeyDown}><div ref={dialog} className="card modal-card perfil-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}>{children}</div></div>;
}
