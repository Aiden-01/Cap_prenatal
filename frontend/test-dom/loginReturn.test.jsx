// @vitest-environment jsdom
import { test, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
const state = vi.hoisted(() => ({ user: null, post: vi.fn() }));
vi.mock('../src/api/axios', () => ({ default: { post: state.post } }));
vi.mock('../src/hooks/useAuth', () => ({ consumeAuthNotice: () => '', useAuth: () => ({ usuario: state.user, login: user => { state.user = user; } }) }));
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from '../src/pages/Login';
import AccessRoute from '../src/components/AccessRoute';
afterEach(() => { cleanup(); state.user = null; state.post.mockReset(); });
const target = '/pacientes';
for (const destination of [target, undefined, 'https://evil.invalid', '/reportes?token=fiction']) {
  test(`login validates return destination: ${destination || 'default'}`, async () => {
    state.post.mockResolvedValue({ data: { usuario: { id: 1, permisos: ['pacientes.ver'] } } });
    const entry = destination === target ? target : { pathname: '/login', state: { returnTo: destination } };
    render(<MemoryRouter initialEntries={[entry]}><Routes>
      <Route path={target} element={<AccessRoute access={{ all: ['pacientes.ver'] }}><p>Seguimiento autorizado</p></AccessRoute>} />
      <Route path="/login" element={<Login />} /><Route path="/dashboard" element={<p>Inicio autorizado</p>} />
    </Routes></MemoryRouter>);
    const input = await screen.findByPlaceholderText('Ingresa tu usuario');
    fireEvent.change(input, { target: { value: 'ficticio' } });
    fireEvent.change(screen.getByPlaceholderText('Ingresa tu contraseña'), { target: { value: 'clave-ficticia' } });
    fireEvent.submit(input.closest('form'));
    await screen.findByText(destination === target ? 'Seguimiento autorizado' : 'Inicio autorizado');
    assert.equal(state.post.mock.calls[0][0], '/auth/login');
  });
}
