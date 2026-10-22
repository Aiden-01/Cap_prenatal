// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Usuarios from '../src/pages/Usuarios';
import CatalogosProfesionales from '../src/components/usuarios/CatalogosProfesionales';
import PerfilProfesionalFields from '../src/components/usuarios/PerfilProfesionalFields';
import { cargarOpcionesActivas } from '../src/api/catalogos';
import api from '../src/api/axios';

const toast = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ usuario: { id: 1, rol: 'director', permisos: ['catalogos_profesionales.gestionar'] }, refreshUsuario: vi.fn() }));
vi.mock('../src/api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../src/context/ToastContext', () => ({ useGlobalToast: () => toast }));
const target = { id: 4, nombre_completo: 'Persona sintética', username: 'fixture', rol: 'personal_salud', activo: true,
  cargo_id: 1, cargo_nombre: 'Cargo histórico', cargo_activo: false,
  especialidad_id: 5, especialidad_nombre: 'Especialidad histórica', especialidad_activa: false, puede_eliminarse: false };
const cargos = [{ id: 2, nombre: 'Cargo CAP activo', activo: true }];
const especialidades = [{ id: 6, nombre: 'Especialidad CAP activa', activo: true }];
beforeEach(() => {
  vi.clearAllMocks();
  auth.usuario = { id: 1, rol: 'director', permisos: ['catalogos_profesionales.gestionar'] };
  api.get.mockImplementation(async url => ({ data: url === '/usuarios' ? [target]
    : { data: url.endsWith('cargos') ? cargos : especialidades, total: 1 } }));
  for (const method of ['put', 'post', 'patch']) api[method].mockResolvedValue({ data: {} });
});
afterEach(cleanup);

test('crear cuenta exige cargo visual y especialidad opcional; payload sin permisos nuevos', async () => {
  render(<Usuarios />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
  await screen.findByRole('option', { name: 'Cargo CAP activo' });
  const cargo = screen.getByLabelText('Cargo laboral *');
  expect(cargo.required).toBe(true);
  expect(screen.getByLabelText('Especialidad (opcional)').required).toBe(false);
  fireEvent.change(screen.getByPlaceholderText('Nombre completo'), { target: { value: 'Nueva sintética' } });
  fireEvent.change(screen.getByPlaceholderText('nombre_usuario'), { target: { value: 'nueva_fixture' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'test-only' } });
  fireEvent.submit(cargo.closest('form'));
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(cargo, { target: { value: '2' } });
  fireEvent.submit(cargo.closest('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/usuarios', {
    nombre_completo: 'Nueva sintética', username: 'nueva_fixture', password: 'test-only', rol: 'personal_salud', cargo_id: 2, especialidad_id: null,
  }));
});

test('listado y edición conservan opciones históricas; quitar especialidad envía solo el perfil', async () => {
  render(<Usuarios />);
  expect(await screen.findByText(/Cargo histórico/)).toBeTruthy();
  fireEvent.click(screen.getByTitle('Editar perfil profesional de Persona sintética'));
  const dialog = screen.getByRole('dialog', { name: 'Perfil profesional' });
  await within(dialog).findByRole('option', { name: 'Cargo histórico (inactivo, asignado)' });
  expect(within(dialog).getByLabelText('Cargo laboral').value).toBe('1');
  fireEvent.change(within(dialog).getByLabelText('Especialidad (opcional)'), { target: { value: '' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar perfil' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/usuarios/4', { cargo_id: 1, especialidad_id: null }));
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('rol');
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('activo');
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('password');
});

test('selectores recuperan todas las páginas activas y nunca ofrecen inactivos ajenos', async () => {
  api.get.mockImplementation(async (_url, { params }) => ({ data: params.pagina === 1
    ? { data: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, nombre: `Cargo ${i}`, activo: true })), total: 101 }
    : { data: [{ id: 101, nombre: 'Último cargo', activo: true }], total: 101 } }));
  const result = await cargarOpcionesActivas('cargos');
  expect(result).toHaveLength(101);
  expect(api.get.mock.calls.map(call => call[1].params.pagina)).toEqual([1, 2]);
  expect(api.get.mock.calls.every(call => call[1].params.estado === 'activos')).toBe(true);
});

test('selectores fallidos bloquean guardado y permiten reintentar', async () => {
  api.get.mockRejectedValue(new Error('network'));
  const ready = vi.fn();
  render(<PerfilProfesionalFields value={{}} onChange={vi.fn()} onReady={ready} required />);
  expect(screen.getByRole('status').textContent).toContain('Cargando');
  await screen.findByRole('alert'); expect(ready).toHaveBeenLastCalledWith(false);
  expect(screen.getByLabelText('Cargo laboral *').disabled).toBe(true);
  api.get.mockResolvedValue({ data: { data: cargos, total: 1 } });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
});

test('catálogos: paginación real, búsqueda global y cambio de catálogo reinician página', async () => {
  api.get.mockImplementation(async (_url, { params }) => ({ data: { data: [{ id: params.pagina, nombre: `Página ${params.pagina}`, activo: true }], total: 21 } }));
  render(<CatalogosProfesionales onClose={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('Cargando');
  await screen.findByText('Página 1 de 2 · 21 elementos');
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await screen.findByText('Página 2 de 2 · 21 elementos');
  fireEvent.change(screen.getByLabelText('Buscar en catálogo'), { target: { value: 'búsqueda' } });
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/catalogos/cargos', expect.objectContaining({ params: expect.objectContaining({ pagina: 1, buscar: 'búsqueda', limite: 20 }) })));
  fireEvent.change(screen.getByLabelText('Catálogo'), { target: { value: 'especialidades' } });
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/catalogos/especialidades', expect.objectContaining({ params: expect.objectContaining({ pagina: 1, buscar: '' }) })));
});

test.each(['cargos', 'especialidades'])('gestionar %s: crear, duplicado, editar y confirmar desactivación', async tipo => {
  render(<CatalogosProfesionales onClose={vi.fn()} />);
  if (tipo === 'especialidades') fireEvent.change(screen.getByLabelText('Catálogo'), { target: { value: tipo } });
  const nombre = tipo === 'cargos' ? 'Cargo CAP activo' : 'Especialidad CAP activa';
  const id = tipo === 'cargos' ? 2 : 6;
  await screen.findByText(nombre);
  fireEvent.click(screen.getByRole('button', { name: tipo === 'cargos' ? 'Crear cargo' : 'Crear especialidad' }));
  const modal = screen.getByRole('dialog');
  fireEvent.change(within(modal).getByLabelText('Nombre'), { target: { value: 'Nuevo elemento' } });
  api.post.mockRejectedValueOnce({ response: { data: { message: 'Ya existe un elemento con ese nombre', code: 'CATALOGO_DUPLICADO' } } });
  fireEvent.submit(within(modal).getByLabelText('Nombre').closest('form'));
  await within(modal).findByRole('alert'); expect(toast).toHaveBeenCalledWith(expect.stringContaining('Ya existe'), 'error');
  fireEvent.click(within(modal).getByRole('button', { name: 'Guardar catálogo' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(await screen.findByRole('button', { name: `Editar ${nombre}` }));
  fireEvent.change(screen.getByLabelText('Código (opcional)'), { target: { value: 'CAP' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar catálogo' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith(`/catalogos/${tipo}/${id}`, expect.objectContaining({ codigo: 'CAP' })));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(await screen.findByRole('button', { name: `Desactivar ${nombre}` }));
  expect(api.patch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); expect(api.patch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: `Desactivar ${nombre}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/catalogos/${tipo}/${id}/desactivar`));
  expect(api.delete).not.toHaveBeenCalled();
});

test('doble envío bloqueado; error de edición mantiene formulario y datos', async () => {
  let reject;
  api.put.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  render(<Usuarios />);
  fireEvent.click(await screen.findByTitle('Editar perfil profesional de Persona sintética'));
  await screen.findByRole('option', { name: 'Cargo CAP activo' });
  const save = screen.getByRole('button', { name: 'Guardar perfil' });
  fireEvent.click(save); fireEvent.click(save);
  expect(api.put).toHaveBeenCalledTimes(1); expect(save.disabled).toBe(true);
  reject(new Error('network'));
  await screen.findByRole('alert'); expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByLabelText('Cargo laboral').value).toBe('1');
});

test('reactivación y fallo de carga de catálogos son recuperables', async () => {
  api.get.mockRejectedValueOnce(new Error('network'));
  render(<CatalogosProfesionales onClose={vi.fn()} />);
  await screen.findByRole('alert');
  api.get.mockResolvedValue({ data: { data: [{ id: 7, nombre: 'Inactivo', activo: false }], total: 1 } });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reactivar Inactivo' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/catalogos/cargos/7/reactivar'));
});

test.each([
  ['director', ['catalogos_profesionales.gestionar'], true],
  ['admin', ['catalogos_profesionales.gestionar'], true],
  ['director', [], false],
  ['admin', [], false],
  ['personal_salud', ['catalogos_profesionales.gestionar'], false],
])('gestión de catálogos exige rol y permiso: %s / %j', async (rol, permisos, visible) => {
  auth.usuario = { id: 1, rol, permisos };
  render(<Usuarios />);
  await screen.findByText('Persona sintética');
  expect(Boolean(screen.queryByRole('button', { name: 'Catálogos profesionales' }))).toBe(visible);
});

test('clasificación de cargos es controlada, no se deduce del nombre y se conserva al editar', async () => {
  api.get.mockResolvedValue({ data: { data: [{ id: 7, nombre: 'Médico con nombre editable', activo: true }], total: 1 } });
  render(<CatalogosProfesionales onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar Médico con nombre editable' }));
  const select = screen.getByLabelText('Clasificación profesional');
  expect(select.value).toBe('sin_clasificar');
  expect(within(select).getAllByRole('option').map(option => option.value)).toEqual(['sin_clasificar', 'medico', 'enfermeria_ae', 'enfermeria_ep', 'no_clinico']);
  expect(screen.getByText(/No acredita colegiación ni habilitación legal y no concede permisos/)).toBeTruthy();
  fireEvent.change(select, { target: { value: 'enfermeria_ae' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar catálogo' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/catalogos/cargos/7', expect.objectContaining({ clasificacion_profesional: 'enfermeria_ae' })));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  api.get.mockResolvedValue({ data: { data: [{ id: 7, nombre: 'Nombre cambiado', activo: true, clasificacion_profesional: 'enfermeria_ep' }], total: 1 } });
  fireEvent.change(screen.getByLabelText('Buscar en catálogo'), { target: { value: 'Nombre cambiado' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Editar Nombre cambiado' }));
  expect(screen.getByLabelText('Clasificación profesional').value).toBe('enfermeria_ep');
});

test.each(['cargos', 'especialidades'])('crear %s envía clasificación solo para cargos', async tipo => {
  render(<CatalogosProfesionales onClose={vi.fn()} />);
  if (tipo === 'especialidades') fireEvent.change(screen.getByLabelText('Catálogo'), { target: { value: tipo } });
  await screen.findByText(tipo === 'cargos' ? 'Cargo CAP activo' : 'Especialidad CAP activa');
  fireEvent.click(screen.getByRole('button', { name: tipo === 'cargos' ? 'Crear cargo' : 'Crear especialidad' }));
  const select = screen.queryByLabelText('Clasificación profesional');
  expect(Boolean(select)).toBe(tipo === 'cargos');
  if (select) expect(select.value).toBe('sin_clasificar');
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Elemento nuevo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar catálogo' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(api.post.mock.calls[0][0]).toBe(`/catalogos/${tipo}`);
  if (tipo === 'cargos') expect(api.post.mock.calls[0][1].clasificacion_profesional).toBe('sin_clasificar');
  else expect(api.post.mock.calls[0][1]).not.toHaveProperty('clasificacion_profesional');
});
