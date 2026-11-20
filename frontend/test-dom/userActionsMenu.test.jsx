// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Pencil, Trash2 } from 'lucide-react';
import UserActionsMenu from '../src/components/usuarios/UserActionsMenu';

it('navega por teclado, respeta restricciones y cierra al salir del menú', () => {
  const edit = vi.fn();
  const remove = vi.fn();
  render(<>
    <UserActionsMenu name="Cuenta sintética" actions={[
      { label: 'Editar perfil', Icon: Pencil, run: edit },
      { label: 'Eliminar usuario', Icon: Trash2, run: remove, danger: true, disabledReason: 'Con historial' },
    ]} />
    <button type="button">Fuera del menú</button>
  </>);
  const trigger = screen.getByRole('button', { name: 'Acciones de Cuenta sintética' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const menu = screen.getByRole('menu');
  const first = within(menu).getByRole('menuitem', { name: 'Editar perfil' });
  const last = within(menu).getByRole('menuitem', { name: 'Eliminar usuario' });
  expect(document.activeElement).toBe(first);
  expect(within(menu).getByRole('separator')).toBeTruthy();
  fireEvent.keyDown(first, { key: 'End' });
  expect(document.activeElement).toBe(last);
  expect(last.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(last);
  expect(remove).not.toHaveBeenCalled();
  fireEvent.keyDown(last, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);

  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Fuera del menú' }));
  expect(screen.queryByRole('menu')).toBeNull();

  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Editar perfil' }));
  expect(edit).toHaveBeenCalledOnce();
});
