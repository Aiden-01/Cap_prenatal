// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../src/hooks/useAuth';
import Sidebar from '../src/components/Sidebar';
import Dashboard from '../src/pages/Dashboard';
import api from '../src/api/axios';

function SessionView() {
  const { usuario, refreshUsuario } = useAuth();
  return <><button onClick={() => refreshUsuario({ force: true })}>Renovar snapshot</button>
    <Sidebar usuario={usuario} menuOpen isMobile collapsed={false} setCollapsed={() => {}} />
    <Dashboard /></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

test('useAuth real aplica permisos de /auth/me después de renovar a menú y Dashboard', async () => {
  let snapshot = { id: 'synthetic-renewal', rol: 'medico', permisos: [], nombre_completo: 'Sintético' };
  localStorage.setItem('usuario', JSON.stringify(snapshot));
  const get = vi.spyOn(api, 'get').mockImplementation(async url => {
    if (url === '/auth/me') return { data: { ...snapshot } };
    if (url === '/reportes/estadisticas') return { data: { embarazos_activos: 3 } };
    if (url.startsWith('/reportes/')) return { data: [] };
    throw new Error('GET no autorizado en esta prueba');
  });
  render(<MemoryRouter><SessionView /></MemoryRouter>);
  await waitFor(() => expect(get).toHaveBeenCalledWith('/auth/me', expect.anything()));
  expect(screen.queryByRole('button', { name: 'Reportes', exact: true })).toBeNull();
  expect(get.mock.calls.every(([url]) => url === '/auth/me')).toBe(true);
  snapshot = { ...snapshot, permisos: ['reportes.ver'] };
  fireEvent.click(screen.getByRole('button', { name: 'Renovar snapshot' }));
  expect(await screen.findByText('Embarazos activos')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reportes', exact: true })).toBeTruthy();
  snapshot = { ...snapshot, permisos: [] };
  fireEvent.click(screen.getByRole('button', { name: 'Renovar snapshot' }));
  await waitFor(() => expect(screen.queryByText('Embarazos activos')).toBeNull());
  expect(screen.queryByRole('button', { name: 'Reportes', exact: true })).toBeNull();
  const before = get.mock.calls.length;
  await new Promise(resolve => setTimeout(resolve, 40));
  expect(get.mock.calls.slice(before).every(([url]) => url === '/auth/me')).toBe(true);
});
