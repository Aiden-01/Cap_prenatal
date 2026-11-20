import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EllipsisVertical } from 'lucide-react';

const margin = 8;
const gap = 6;

export default function UserActionsMenu({ name, actions }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const menu = useRef(null);
  const initial = useRef(0);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = trigger.current;
    const panel = menu.current;
    const place = () => {
      const box = anchor.getBoundingClientRect();
      const { clientWidth, clientHeight } = document.documentElement;
      if (box.bottom < 0 || box.top > clientHeight) { setOpen(false); return; }
      const below = Math.max(0, clientHeight - box.bottom - margin - gap);
      const above = Math.max(0, box.top - margin - gap);
      const up = panel.scrollHeight > below && above > below;
      const height = Math.min(panel.scrollHeight + 2, up ? above : below);
      panel.style.maxHeight = `${height}px`;
      panel.style.left = `${Math.max(margin, Math.min(box.right - panel.offsetWidth, clientWidth - panel.offsetWidth - margin))}px`;
      panel.style.top = `${up ? box.top - gap - height : box.bottom + gap}px`;
    };
    const dismissOutside = event => {
      if (!anchor.contains(event.target) && !panel.contains(event.target)) setOpen(false);
    };
    place();
    [...panel.querySelectorAll('[role="menuitem"]')].at(initial.current)?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function menuKeys(event) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...menu.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Home') items[0]?.focus();
    else if (event.key === 'End') items.at(-1)?.focus();
    else items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }

  const normal = actions.filter(action => !action.danger);
  const danger = actions.filter(action => action.danger);
  const renderAction = ({ label, Icon, run, disabledReason }) => (
    <button key={label} type="button" role="menuitem" tabIndex={-1} aria-disabled={disabledReason ? true : undefined}
      title={disabledReason} onClick={() => { if (!disabledReason) { close(); run(); } }}>
      <Icon size={16} aria-hidden="true" /><span>{label}</span>
    </button>
  );

  return <>
    <button ref={trigger} id={`${id}-trigger`} type="button" className="user-actions-trigger" aria-label={`Acciones de ${name}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { initial.current = 0; setOpen(value => !value); }}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        initial.current = event.key === 'ArrowDown' ? 0 : -1;
        if (open) [...menu.current.querySelectorAll('[role="menuitem"]')].at(initial.current)?.focus();
        else setOpen(true);
      }}><EllipsisVertical size={20} aria-hidden="true" /></button>
    {open && createPortal(<div ref={menu} id={id} className="user-actions-menu" role="menu" aria-labelledby={`${id}-trigger`} onKeyDown={menuKeys}>
      {normal.map(renderAction)}
      {danger.length > 0 && <><div role="separator" /><div className="user-actions-danger" role="group">{danger.map(renderAction)}</div></>}
    </div>, document.body)}
  </>;
}
