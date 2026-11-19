// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import api from '../src/api/axios';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.classList.remove('dark');
});

const loginButton = () => screen.findByRole('button', { name: 'Ingresar al sistema' });
const isDark = () => document.documentElement.classList.contains('dark');

function startSession(metadata = {}, path = '/dashboard') {
  const usuario = {
    id: 601, username: 'tema_sintetico', nombre_completo: 'Tema sintético',
    rol: 'personal_salud', permisos: [], lastActivityAt: new Date().toISOString(), ...metadata,
  };
  localStorage.setItem('usuario', JSON.stringify(usuario));
  localStorage.setItem('theme:tema_sintetico', 'dark');
  localStorage.setItem('theme:otra_cuenta', 'light');
  window.history.replaceState(null, '', path);
  vi.spyOn(api, 'get').mockResolvedValue({ data: usuario });
  vi.spyOn(api, 'post').mockImplementation(async url => ({ data: url === '/auth/login' ? { usuario } : {} }));
  return render(<App />);
}

test('cierre manual y recarga muestran login claro, y volver a entrar recupera el tema de la cuenta', async () => {
  const view = startSession();
  const salir = await screen.findByRole('button', { name: 'Cerrar sesión' });
  expect(isDark()).toBe(true);
  fireEvent.click(salir);
  await loginButton();
  expect(isDark()).toBe(false);
  expect(localStorage.getItem('theme:tema_sintetico')).toBe('dark');
  expect(localStorage.getItem('theme:otra_cuenta')).toBe('light');
  expect(localStorage.getItem('theme')).toBe('dark');

  view.unmount();
  render(<App />);
  const ingresar = await loginButton();
  expect(isDark()).toBe(false);
  fireEvent.change(screen.getByPlaceholderText('Ingresa tu usuario'), { target: { value: 'tema_sintetico' } });
  fireEvent.change(screen.getByPlaceholderText('Ingresa tu contraseña'), { target: { value: 'Sintetica9!' } });
  fireEvent.click(ingresar);
  await screen.findByRole('button', { name: 'Cerrar sesión' });
  expect(isDark()).toBe(true);
});

test('expiración por inactividad aplica el mismo login claro y conserva el tema guardado', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  startSession({ idleTimeoutSeconds: 900, warningAfterSeconds: 780 });
  expect(isDark()).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(900_000); });
  expect(screen.getByText('La sesión se cerró por inactividad.')).toBeTruthy();
  expect(await loginButton()).toBeTruthy();
  expect(isDark()).toBe(false);
  expect(localStorage.getItem('theme:tema_sintetico')).toBe('dark');
});

test('el cambio obligatorio mantiene su selector y al salir deja el login claro', async () => {
  startSession({ requiere_cambio_password: true }, '/cambiar-password-obligatorio');
  expect(screen.getByRole('button', { name: 'Usar tema oscuro', pressed: true })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Usar tema claro' }));
  expect(isDark()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Usar tema oscuro' }));
  expect(isDark()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await loginButton();
  expect(isDark()).toBe(false);
  expect(localStorage.getItem('theme:tema_sintetico')).toBe('dark');
  expect(localStorage.getItem('theme:default')).toBeNull();
});
