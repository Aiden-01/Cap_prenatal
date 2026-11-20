// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Usuarios from '../src/pages/Usuarios';
import api from '../src/api/axios';

const toast = vi.hoisted(() => vi.fn());
vi.mock('../src/api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ usuario: { id: 1, rol: 'director' }, refreshUsuario: vi.fn() }) }));
vi.mock('../src/context/ToastContext', () => ({ useGlobalToast: () => toast }));
let target;
beforeEach(() => {
  vi.clearAllMocks();
  target = { id: 2, rol: 'personal_salud', nombre_completo: 'Usuario sintético', username: 'synthetic', activo: true, cargo_id: 4, cargo_nombre: 'Cargo sintético', email: null };
  api.get.mockImplementation(async url => ({ data: url === '/usuarios' ? [target] : { data: [{ id: 4, nombre: 'Cargo sintético', activo: true }], total: 1 } }));
  api.post.mockResolvedValue({ data: { id: 3 } });
  api.put.mockResolvedValue({ data: { id: 2 } });
});
afterEach(cleanup);

async function crearForm() {
  render(<Usuarios />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
  await screen.findByRole('option', { name: 'Cargo sintético' });
  fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Persona nueva' } });
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'new_synthetic' } });
  fireEvent.change(screen.getByLabelText('Contraseña temporal'), { target: { value: 'Test-only-password9!' } });
  fireEvent.change(screen.getByLabelText('Cargo laboral *'), { target: { value: '4' } });
  return screen.getByLabelText('Correo electrónico *');
}

test.each([['', 'Ingresa un correo electrónico.'], ['correo inválido', 'Ingresa un correo electrónico válido.']])('creación bloquea correo %j con error accesible', async (value, message) => {
  const email = await crearForm();
  fireEvent.change(email, { target: { value } });
  fireEvent.submit(email.closest('form'));
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain(message);
  expect(email.getAttribute('aria-invalid')).toBe('true');
  await waitFor(() => expect(document.activeElement).toBe(email));
  expect(email.getAttribute('aria-describedby')).toContain('usuario-create-email-error');
});

test('nuevo usuario respeta orden, normaliza correo y no envía datos de especialidad ni permisos', async () => {
  const email = await crearForm();
  const fields = [...email.closest('form').querySelectorAll('input,select')];
  expect(fields.map(input => input.name || input.id)).toEqual(['nombre_completo', 'username', 'email', 'password', 'rol', expect.stringMatching(/cargo$/)]);
  fireEvent.change(email, { target: { value: '  CORREO@EXAMPLE.TEST  ' } });
  expect(screen.getByText('Correo electrónico válido')).toBeTruthy();
  fireEvent.submit(email.closest('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/usuarios', { nombre_completo: 'Persona nueva', username: 'new_synthetic', email: 'correo@example.test', password: 'Test-only-password9!', rol: 'personal_salud', cargo_id: 4 }));
  expect(api.get.mock.calls.every(([url]) => url === '/usuarios' || url === '/catalogos/cargos')).toBe(true);
});

test('duplicado de backend conserva correo y otros datos sin mostrar éxito', async () => {
  api.post.mockRejectedValue({ response: { status: 409, data: { code: 'EMAIL_DUPLICADO', message: 'El correo electrónico ya está registrado' } } });
  const email = await crearForm();
  fireEvent.change(email, { target: { value: 'duplicate@example.test' } });
  fireEvent.submit(email.closest('form'));
  await screen.findByText('El correo electrónico ya está registrado');
  expect(email.value).toBe('duplicate@example.test');
  expect(email.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByLabelText('Nombre completo').value).toBe('Persona nueva');
  expect(screen.queryByText('Usuario creado exitosamente')).toBeNull();
});

test('tabla y perfil administrativo excluyen estados de correo y acciones sobre credenciales', async () => {
  target.email = 'private@example.test';
  render(<Usuarios />);
  await screen.findByText('Usuario sintético');
  expect(screen.queryByText(target.email)).toBeNull();
  expect(screen.queryByText(/correo pendiente|correo sin verificar|correo verificado/i)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Restablecer contraseña' })).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Acciones de Usuario sintético' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Editar perfil' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).queryByLabelText('Correo electrónico')).toBeNull();
  expect(within(dialog).queryByLabelText(/contraseña/i)).toBeNull();
});

test('el indicador de correo es neutro, rojo o verde mientras se escribe', async () => {
  const email = await crearForm();
  const hint = document.getElementById('usuario-create-email-format');
  expect(hint.textContent).toBe('');
  fireEvent.change(email, { target: { value: 'a..b@example.test' } });
  expect(hint.classList.contains('email-format-invalid')).toBe(true);
  expect(hint.textContent).toBe('Formato de correo inválido');
  fireEvent.change(email, { target: { value: 'válido' } });
  expect(hint.classList.contains('email-format-invalid')).toBe(true);
  fireEvent.change(email, { target: { value: 'persona@example.test' } });
  expect(hint.classList.contains('email-format-valid')).toBe(true);
  expect(hint.textContent).toBe('Correo electrónico válido');
});

test('perfil administrativo edita nombre y username conservando correo y cargo',async()=>{
 render(<Usuarios/>);fireEvent.click(await screen.findByRole('button', { name: 'Acciones de Usuario sintético' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Editar perfil' }));
 await screen.findByRole('option',{name:'Cargo sintético'});
 fireEvent.change(screen.getByLabelText('Nombre completo'),{target:{value:'Nombre sintético editado'}});
 fireEvent.change(screen.getByLabelText('Nombre de usuario'),{target:{value:'renamed_synthetic'}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar perfil'}));
 await waitFor(()=>expect(api.put).toHaveBeenCalledWith('/usuarios/2',{cargo_id:4,nombre_completo:'Nombre sintético editado',username:'renamed_synthetic'}));
});
