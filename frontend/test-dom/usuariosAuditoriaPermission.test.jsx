// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Usuarios from '../src/pages/Usuarios';
import api from '../src/api/axios';

const auth = vi.hoisted(() => ({ usuario: { id: 1, rol: 'director' }, refreshUsuario: vi.fn() }));
vi.mock('../src/api/axios', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../src/context/ToastContext', () => ({ useGlobalToast: () => vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); auth.usuario = { id: 1, rol: 'director' }; });
afterEach(cleanup);

function install(rol, actuales = []) {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/usuarios'
    ? [{ id: 2, rol, activo: true, nombre_completo: 'Objetivo', username: 'objetivo' }]
    : url === '/permisos'
      ? [{ codigo: 'auditoria.ver', descripcion: 'Consultar historial', categoria: 'auditoria' },
        { codigo: 'pacientes.ver', descripcion: 'Ver pacientes', categoria: 'pacientes' }]
      : actuales.map((codigo) => ({ codigo })) }));
  api.put.mockResolvedValue({ data: [] });
}

test.each(['admin', 'personal_salud', 'director'])('auditoria visible únicamente para admin: %s', async (rol) => {
  install(rol);
  render(<Usuarios />);
  fireEvent.click(await screen.findByTitle('Gestionar permisos'));
  await screen.findByText('Ver pacientes');
  expect(Boolean(screen.queryByText('Ver historial de actividad'))).toBe(rol === 'admin');
});

test.each([false, true])('director concede o retira auditoria a admin (asignado: %s)', async (asignado) => {
  install('admin', asignado ? ['auditoria.ver'] : []);
  render(<Usuarios />);
  fireEvent.click(await screen.findByTitle('Gestionar permisos'));
  const label = await screen.findByText('Ver historial de actividad');
  const checkbox = label.closest('label').querySelector('input');
  expect(checkbox.checked).toBe(asignado);
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/usuarios/2/permisos', { permisos: asignado ? [] : ['auditoria.ver'] }));
});

test('admin no gestiona permisos', async () => {
  auth.usuario = { id: 1, rol: 'admin' };
  install('admin');
  render(<Usuarios />);
  await screen.findByText('Objetivo');
  expect(screen.queryByTitle('Gestionar permisos')).toBeNull();
});
