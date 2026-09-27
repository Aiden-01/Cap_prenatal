// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Historial from '../src/pages/Historial';
import Sidebar from '../src/components/Sidebar';
import api from '../src/api/axios';

const auth = vi.hoisted(() => ({ usuario: { id: 2, nombre_completo: 'Operador', permisos: ['auditoria.ver'], rol: 'admin' } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../src/api/axios', () => ({ default: { get: vi.fn() } }));
const activity = (id = '1', overrides = {}) => ({ id, fecha: '2026-09-27T02:42:00.123456Z',
  tipo: 'generar_pdf', modulo: 'documentos', entidad: 'documento',
  usuario: { id: 2, nombre_completo: 'María López', username: 'maria' },
  presentacion: { titulo: 'Generó un documento PDF', modulo: 'Documentos', categoria: 'Documentos y exportaciones' },
  ...overrides });
const page = (items = [activity()], next_cursor = null) => ({ data: { items, next_cursor, has_more: Boolean(next_cursor) } });
function install(read = () => Promise.resolve(page())) {
  api.get.mockImplementation((url, config) => url === '/auditoria/usuarios'
    ? Promise.resolve({ data: [{ id: 2, nombre_completo: 'María López', username: 'maria' }] }) : read(config));
}
function mount() {
  return render(<MemoryRouter initialEntries={['/historial']}><Routes>
    <Route path="/historial" element={<Historial />} /><Route path="/dashboard" element={<p>Inicio autorizado</p>} />
  </Routes></MemoryRouter>);
}
beforeEach(() => { auth.usuario = { id: 2, nombre_completo: 'Operador', permisos: ['auditoria.ver'], rol: 'admin' }; vi.clearAllMocks(); install(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mobileViewport(initial = true) {
  let matches = initial;
  const listeners = new Set();
  const media = { get matches() { return matches; }, addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener) };
  vi.stubGlobal('matchMedia', () => media);
  return (value) => act(() => { matches = value; listeners.forEach((listener) => listener()); });
}

test('muestra presentacion directa, fecha Guatemala y detalle seguro accesible', async () => {
  install(() => Promise.resolve(page([activity('1', { datos_nuevos: { diagnostico: 'CLINICO_SECRETO' }, ip: 'IP_SECRETA' })])));
  mount();
  expect(await screen.findByText('Generó un documento PDF')).toBeTruthy();
  expect(screen.getByText('26/09/2026')).toBeTruthy();
  expect(screen.getByText('Completado')).toBeTruthy();
  const trigger = screen.getByRole('button', { name: 'Ver detalles: Generó un documento PDF' });
  fireEvent.click(trigger);
  const detail = screen.getByRole('complementary', { name: 'Detalle de actividad' });
  expect(within(detail).getByText('Documentos y exportaciones')).toBeTruthy();
  expect(screen.queryByText('CLINICO_SECRETO')).toBeNull();
  expect(screen.queryByText('IP_SECRETA')).toBeNull();
  expect(screen.queryByText('generar_pdf')).toBeNull();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('complementary')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
test('permiso protege pagina y sidebar, sin peticiones para acceso denegado', async () => {
  auth.usuario = { id: 2, rol: 'director', permisos: [] };
  mount();
  expect(await screen.findByText('Inicio autorizado')).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
  cleanup();
  const props = { usuario: auth.usuario, menuOpen: false, isMobile: false, collapsed: false,
    setMenuOpen: () => {}, setCollapsed: () => {}, onLogout: () => {}, onChangePassword: () => {} };
  const view = render(<MemoryRouter><Sidebar {...props} /></MemoryRouter>);
  expect(screen.queryByText('Historial')).toBeNull();
  view.rerender(<MemoryRouter><Sidebar {...props} usuario={{ ...auth.usuario, permisos: ['auditoria.ver'] }} /></MemoryRouter>);
  expect(screen.getByText('Historial')).toBeTruthy();
});
test('personal_salud con permiso antiguo no ve pagina ni Sidebar', async () => {
  auth.usuario = { id: 2, rol: 'personal_salud', permisos: ['auditoria.ver'] };
  mount();
  expect(await screen.findByText('Inicio autorizado')).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
  cleanup();
  render(<MemoryRouter><Sidebar usuario={auth.usuario} menuOpen={false} isMobile={false} collapsed={false}
    setMenuOpen={() => {}} setCollapsed={() => {}} onLogout={() => {}} onChangePassword={() => {}} /></MemoryRouter>);
  expect(screen.queryByText('Historial')).toBeNull();
});

test('filtros combinados usan codigos internos sin mostrarlos y reinician cursor', async () => {
  mount(); await screen.findByText('Generó un documento PDF');
  await screen.findByRole('option', { name: 'María López' });
  fireEvent.change(screen.getByLabelText('Buscar actividad'), { target: { value: ' maria ' } });
  fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'generar_pdf' } });
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Módulo'), { target: { value: 'documentos' } });
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-26' } });
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/auditoria', expect.objectContaining({ params: {
    q: 'maria', tipo: 'generar_pdf', usuario_id: '2', modulo: 'documentos', desde: '2026-09-01', hasta: '2026-09-26',
  } })));
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
  await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/auditoria').at(-1)[1].params).toEqual({}));
});
test('navega por cursor, conserva filtros y no muestra totales', async () => {
  install(({ params }) => Promise.resolve(params.cursor ? page([activity('26', { presentacion: { titulo: 'Actividad anterior', modulo: 'Documentos', categoria: 'Documentos y exportaciones' } })])
    : page(Array.from({ length: 25 }, (_, i) => activity(String(i + 1))), 'cursor-seguro')));
  mount(); await screen.findAllByText('Generó un documento PDF');
  expect(screen.getAllByRole('button', { name: /Ver detalles:/ })).toHaveLength(25);
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await screen.findByText('Actividad anterior');
  expect(api.get.mock.calls.filter(([url]) => url === '/auditoria').at(-1)[1].params).toEqual({ cursor: 'cursor-seguro' });
  expect(screen.getByRole('button', { name: 'Siguiente' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
  await screen.findAllByText('Generó un documento PDF');
  expect(screen.getByRole('button', { name: 'Anterior' }).disabled).toBe(true);
  expect(screen.queryByText(/total|mostrando 25/i)).toBeNull();
});
test('carga, vacio, fallo y reintento', async () => {
  let resolve;
  install(() => new Promise((done) => { resolve = done; }));
  mount(); expect(screen.getByText('Cargando actividades…')).toBeTruthy();
  resolve(page([]));
  await screen.findByText('No hay actividades para mostrar');
  install(() => Promise.reject(new Error('mensaje sensible')));
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
  await screen.findByText('No se pudo cargar el historial. Inténtalo de nuevo.');
  expect(screen.queryByText('mensaje sensible')).toBeNull();
  install(); fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Generó un documento PDF');
});
test('descarta respuestas atrasadas al aplicar filtros', async () => {
  let resolveOld;
  install(() => new Promise((done) => { resolveOld = done; }));
  mount();
  install(() => Promise.resolve(page([activity('2', { presentacion: { titulo: 'Resultado vigente', modulo: 'Usuarios', categoria: 'Cambios de información' } })])));
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
  await screen.findByText('Resultado vigente');
  resolveOld(page());
  await waitFor(() => expect(screen.queryByText('Generó un documento PDF')).toBeNull());
});
test('desconocidos y usuario ausente mantienen fallbacks legibles', async () => {
  install(() => Promise.resolve(page([activity('1', { tipo: 'desconocido', fecha: null, usuario: null,
    presentacion: { titulo: 'Realizó una acción no identificada', modulo: 'Módulo no identificado', categoria: 'Otros eventos' } })])));
  mount(); await screen.findByText('Realizó una acción no identificada');
  expect(screen.getByText('No disponible')).toBeTruthy();
  expect(screen.getByText('Usuario no disponible')).toBeTruthy();
  expect(screen.getByText('Fecha no disponible')).toBeTruthy();
});
test('movil muestra tarjetas con campos seguros y reutiliza consulta por cursor', async () => {
  mobileViewport();
  install(({ params }) => Promise.resolve(params.cursor ? page([activity('26')]) : page([activity()], 'siguiente-movil')));
  mount();
  const title = await screen.findByRole('heading', { name: 'Generó un documento PDF' });
  const card = title.closest('article');
  expect(screen.queryByRole('table')).toBeNull();
  expect(within(card).getByText('María López')).toBeTruthy();
  expect(within(card).getByText(/26\/09\/2026/)).toBeTruthy();
  expect(within(card).getByText('Documentos')).toBeTruthy();
  expect(within(card).getByText('Completado')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/auditoria').at(-1)[1].params).toEqual({ cursor: 'siguiente-movil' }));
  await screen.findByRole('heading', { name: 'Generó un documento PDF' });
  expect(screen.getByRole('button', { name: 'Siguiente' }).disabled).toBe(true);
});
test('bottom sheet bloquea fondo, conserva foco y cierra por boton o backdrop', async () => {
  mobileViewport();
  const previousOverflow = document.body.style.overflow;
  mount(); await screen.findByRole('heading', { name: 'Generó un documento PDF' });
  const trigger = screen.getByRole('button', { name: 'Ver detalles: Generó un documento PDF' });
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Detalle de actividad' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(document.body.style.overflow).toBe('hidden');
  const close = within(dialog).getByRole('button', { name: 'Cerrar detalle' });
  expect(document.activeElement).toBe(close);
  expect(fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })).toBe(false);
  expect(document.activeElement).toBe(close);
  fireEvent.click(close);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe(previousOverflow);
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('dialog').parentElement);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe(previousOverflow);
});
test('cambiar ancho mantiene datos y convierte detalle sin repetir peticiones', async () => {
  const resize = mobileViewport(false);
  mount(); await screen.findByText('Generó un documento PDF');
  expect(screen.getByRole('table')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalles: Generó un documento PDF' }));
  expect(screen.getByRole('complementary', { name: 'Detalle de actividad' })).toBeTruthy();
  const calls = api.get.mock.calls.length;
  resize(true);
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Detalle de actividad' })).toBeTruthy();
  resize(false);
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).not.toBe('hidden');
  expect(api.get.mock.calls.length).toBe(calls);
});
