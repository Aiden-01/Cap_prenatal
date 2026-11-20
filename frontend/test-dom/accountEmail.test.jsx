// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AccountEmailDialog from '../src/components/AccountEmailDialog';
import api from '../src/api/axios';

vi.mock('../src/api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

test('recuperación muestra contador, admite código pegado y usa el CSRF solo para restablecer', async () => {
  api.post.mockResolvedValueOnce({ data: { resend_after: 60, expires_in: 900 } })
    .mockResolvedValueOnce({ data: { csrf: 'simulado-en-memoria' } })
    .mockResolvedValueOnce({ data: { ok: true } });
  const onClose = vi.fn();
  render(<AccountEmailDialog onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: '  CUENTA@EXAMPLE.INVALID ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
  await screen.findByRole('heading', { name: 'Ingresa tu código' });
  expect(screen.getByText(/Vence en/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /Reenviar en/ }).disabled).toBe(true);
  expect(api.post).toHaveBeenNthCalledWith(1, '/auth/recuperacion/solicitar', { email: 'cuenta@example.invalid' },
    { skipAuthRefresh: true, skipAuthRedirect: true, headers: { 'X-CAP-Recovery': '1' } });
  fireEvent.change(screen.getByLabelText('Código de ocho dígitos'), { target: { value: '0000 1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Validar código' }));
  await screen.findByRole('heading', { name: 'Establece una nueva contraseña' });
  expect(api.post.mock.calls[1][1]).toEqual({ email: 'cuenta@example.invalid', code: '00001234' });
  expect(screen.queryByLabelText('Contraseña temporal')).toBeNull();
  const password = 'Personal8!Seguro';
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: password } });
  expect(screen.getByRole('button', { name: 'Guardar contraseña' }).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar nueva contraseña' }));
  expect(screen.getByLabelText('Nueva contraseña').type).toBe('text');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
  await screen.findByRole('heading', { name: 'Contraseña actualizada' });
  expect(api.post.mock.calls[2][2].headers['X-Recovery-CSRF']).toBe('simulado-en-memoria');
  expect(Object.values(localStorage).join('')).not.toContain('simulado-en-memoria');
  fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio de sesión' }));
  expect(onClose).toHaveBeenCalledOnce();
});
