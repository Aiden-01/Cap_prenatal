// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet } from 'react-router-dom';
import Dashboard from '../src/pages/Dashboard';
import Sidebar from '../src/components/Sidebar';
import App from '../src/App';
import api from '../src/api/axios';
import { ACCESS, availableModules, canAccess } from '../src/utils/accessRules';

const auth = vi.hoisted(() => ({ usuario: null }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ usuario: auth.usuario }) }));
vi.mock('../src/components/Layout', () => ({ default: () => <Outlet /> }));
vi.mock('../src/pages/Reportes', () => ({ default: () => <h1>Reportes autorizados</h1> }));
vi.mock('../src/pages/MapaRiesgo', () => ({ default: () => <h1>Mapa autorizado</h1> }));
vi.mock('../src/pages/Pacientes', () => ({ default: () => <h1>Pacientes autorizados</h1> }));
vi.mock('../src/pages/NuevaPaciente', () => ({ default: () => <h1>Formulario autorizado</h1> }));
vi.mock('../src/pages/NuevoControl', () => ({ default: ({ consultationOnly }) => <h1>{consultationOnly ? 'Consulta autorizada' : 'Edición autorizada'}</h1> }));
vi.mock('../src/pages/Usuarios', () => ({ default: () => <h1>Usuarios autorizados</h1> }));
vi.mock('../src/pages/Comunidades', () => ({ default: () => <h1>Comunidades autorizadas</h1> }));
vi.mock('../src/pages/Historial', () => ({ default: () => <h1>Historial autorizado</h1> }));

function user(permisos = [], rol = 'medico') {
  return { id: 'synthetic', nombre_completo: 'Usuario de prueba', rol, permisos };
}
let get;
beforeEach(() => {
  auth.usuario = user();
  get = vi.spyOn(api, 'get').mockImplementation(async url => {
    if (url === '/reportes/estadisticas') return { data: { embarazos_activos: 7 } };
    if (url.startsWith('/reportes/')) return { data: [] };
    if (url === '/mapa/riesgo') return { data: [] };
    return { data: { items: [] } };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

const profiles = [
  ['mínimo', [], 'medico'],
  ['pacientes', ['pacientes.ver'], 'medico'],
  ['reportes', ['reportes.ver'], 'medico'],
  ['solo exportar', ['reportes.exportar'], 'medico'],
  ['mapa', ['mapa_riesgo.ver'], 'medico'],
  ['solo crear', ['pacientes.crear'], 'medico'],
  ['crear y mapa', ['pacientes.crear', 'mapa_riesgo.ver'], 'medico'],
  ['pacientes y mapa', ['pacientes.ver', 'mapa_riesgo.ver'], 'medico'],
  ['admin mínimo', [], 'admin'],
  ['director parcial', ['pacientes.ver', 'auditoria.ver'], 'director'],
  ['completo', ['pacientes.ver', 'pacientes.crear', 'controles.editar', 'reportes.ver', 'reportes.exportar', 'mapa_riesgo.ver', 'auditoria.ver'], 'admin'],
];

for (const [name, permissions, role] of profiles) {
  for (const isMobile of [false, true]) {
    test(`menú ${name}, ${isMobile ? 'móvil' : 'escritorio'}: solo módulos efectivos`, () => {
      auth.usuario = user(permissions, role);
      render(<MemoryRouter><Sidebar usuario={auth.usuario} menuOpen setMenuOpen={() => {}} isMobile={isMobile} collapsed={false} setCollapsed={() => {}} /></MemoryRouter>);
      const expected = availableModules(auth.usuario).map(module => module.label);
      for (const label of ['Inicio','Pacientes','Nueva','Reportes','Mapa de Riesgo','Usuarios','Comunidades','Historial']) {
        expect(Boolean(screen.queryByRole('button', { name: label, exact: true }))).toBe(expected.includes(label));
      }
    });
  }
  test(`dashboard ${name}: cero GET prohibidos y secciones acordes`, async () => {
    auth.usuario = user(permissions, role);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    const urls = get.mock.calls.map(([url]) => url);
    for (const url of urls) {
      expect(permissions.includes(url.startsWith('/reportes/') ? 'reportes.ver' : url === '/mapa/riesgo' ? 'mapa_riesgo.ver' : 'pacientes.ver')).toBe(true);
    }
    expect(Boolean(screen.queryByText('Embarazos activos'))).toBe(permissions.includes('reportes.ver'));
    expect(Boolean(screen.queryByRole('button', { name: 'Calendario de citas' }))).toBe(permissions.includes('pacientes.ver'));
    expect(screen.queryByText('Funciones disponibles')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(Boolean(screen.queryByRole('button', { name: 'Abrir mapa completo' }))).toBe(permissions.includes('mapa_riesgo.ver'));
    expect(Boolean(screen.queryByRole('button', { name: 'Registrar paciente', exact: true }))).toBe(permissions.includes('pacientes.crear') && !permissions.includes('pacientes.ver'));
    if (!permissions.includes('reportes.ver') && !permissions.includes('pacientes.ver') && !permissions.includes('mapa_riesgo.ver')) expect(urls).toEqual([]);
    if (permissions.includes('reportes.ver')) expect(urls).toEqual(expect.arrayContaining(['/reportes/estadisticas','/reportes/proximas-a-parir','/reportes/sin-control-reciente']));
  });
}

for (const [path, permission, allowedTitle] of [
  ['/reportes', 'reportes.ver', 'Reportes autorizados'],
  ['/mapa-riesgo', 'mapa_riesgo.ver', 'Mapa autorizado'],
  ['/pacientes', 'pacientes.ver', 'Pacientes autorizados'],
  ['/nuevo', 'pacientes.crear', 'Formulario autorizado'],
  ['/pacientes/test/editar', 'pacientes.editar', 'Formulario autorizado'],
  ['/pacientes/1/controles/3?embarazo_id=2', 'pacientes.ver', 'Consulta autorizada'],
  ['/pacientes/1/controles/3/editar?embarazo_id=2', 'controles.editar', 'Edición autorizada'],
]) {
  test(`URL ${path}: bloqueada antes de montar módulo; permiso efectivo permite entrar`, async () => {
    window.history.replaceState({}, '', path);
    const view = render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    expect(screen.queryByText(allowedTitle)).toBeNull();
    expect(get.mock.calls).toEqual([]);
    view.unmount();
    auth.usuario = user([permission, ...(path.includes('/editar') ? ['pacientes.ver'] : [])]);
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(await screen.findByText(allowedTitle)).toBeTruthy();
  });
}

test('roles admin/director respetan restricciones propias sin bypass de permisos', async () => {
  expect(canAccess(user([], 'admin'), ACCESS.reports)).toBe(false);
  expect(canAccess(user([], 'director'), ACCESS.riskMap)).toBe(false);
  expect(canAccess(user([], 'admin'), ACCESS.communities)).toBe(false);
  expect(canAccess(user([], 'director'), ACCESS.communities)).toBe(true);
  expect(canAccess(user(['auditoria.ver'], 'medico'), ACCESS.history)).toBe(false);
  for (const role of ['admin', 'director']) {
    auth.usuario = user([], role);
    window.history.replaceState({}, '', '/usuarios');
    const view=render(<App />);
    expect(await screen.findByText('Usuarios autorizados')).toBeTruthy();
    view.unmount();
  }
});

test.each([
  [['mapa_riesgo.ver'], 'medico'],
  [['pacientes.crear', 'mapa_riesgo.ver'], 'medico'],
  [[], 'admin'],
  [[], 'director'],
])('Inicio mínimo %j permanece en Dashboard con su acceso específico', async (permissions, role) => {
  auth.usuario = user(permissions, role);
  window.history.replaceState({}, '', '/dashboard');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Inicio', exact: true })).toBeTruthy();
  expect(window.location.pathname).toBe('/dashboard');
  expect(get.mock.calls.every(([url]) => url === '/mapa/riesgo')).toBe(true);
  expect(availableModules(auth.usuario).some(m => m.path === '/dashboard')).toBe(true);
  expect(screen.queryByText('Funciones disponibles')).toBeNull();
});

test('sin módulos: bienvenida neutral sin tarjeta genérica, pestañas ni peticiones', () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByText(/Tu cuenta no tiene módulos asignados/)).toBeTruthy();
  expect(document.querySelector('.content-tabs')).toBeNull();
  expect(screen.queryByText('Funciones disponibles')).toBeNull();
  expect(get.mock.calls).toEqual([]);
});

test('resumen mapa usa su GET autorizado, muestra agregados y CTA sin exponer filas', async () => {
  auth.usuario = user(['mapa_riesgo.ver']);
  get.mockResolvedValue({ data: [{ total_riesgo: 2, pacientes_riesgo: [{ nombre: 'CANARIO-OCULTO' }] }, { total_riesgo: 1 }] });
  window.history.replaceState({}, '', '/dashboard');
  render(<App />);
  expect(await screen.findByText('2 comunidades · 3 pacientes con riesgo en el mapa')).toBeTruthy();
  expect(screen.queryByText('CANARIO-OCULTO')).toBeNull();
  expect(document.querySelector('.content-tabs')).toBeNull();
  expect(get.mock.calls.map(([url]) => url)).toEqual(['/mapa/riesgo']);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir mapa completo' }));
  expect(await screen.findByText('Mapa autorizado')).toBeTruthy();
  expect(window.location.pathname).toBe('/mapa-riesgo');
});

test('error genuino de resumen mapa conserva error y reintento; no presenta ceros ficticios', async () => {
  auth.usuario = user(['mapa_riesgo.ver']);
  get.mockRejectedValueOnce(new Error('Resumen no disponible')).mockResolvedValue({ data: [] });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(await screen.findByText('Resumen no disponible')).toBeTruthy();
  expect(screen.queryByText(/0 comunidades/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar resumen del mapa' }));
  expect(await screen.findByText('0 comunidades · 0 pacientes con riesgo en el mapa')).toBeTruthy();
  expect(get.mock.calls.map(([url]) => url)).toEqual(['/mapa/riesgo', '/mapa/riesgo']);
});

test('revocar mapa aborta resumen pendiente y descarta respuesta tardía sin perder Inicio', async () => {
  let resolveMap;
  auth.usuario = user(['mapa_riesgo.ver']);
  get.mockImplementation(() => new Promise(resolve => { resolveMap = resolve; }));
  const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await waitFor(() => expect(resolveMap).toBeTypeOf('function'));
  const signal = get.mock.calls[0][1].signal;
  auth.usuario = user([]);
  view.rerender(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(signal.aborted).toBe(true);
  await act(async () => resolveMap({ data: [{ total_riesgo: 999 }] }));
  expect(screen.queryByText(/999/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Abrir mapa completo' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Inicio', exact: true })).toBeTruthy();
});

test('errores genuinos de módulos autorizados siguen visibles y no esconden la sección independiente', async () => {
  auth.usuario=user(['reportes.ver']);
  get.mockImplementation(async url => {
    if (url === '/reportes/estadisticas') throw new Error('Estadísticas no disponibles');
    if (url === '/reportes/proximas-a-parir') throw new Error('Partos no disponibles');
    return {data:[]};
  });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(await screen.findByText('Estadísticas no disponibles')).toBeTruthy();
  expect(await screen.findByText('Partos no disponibles')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Sin control (0)'}));
  expect(screen.getByText('Todas las pacientes tienen controles recientes.')).toBeTruthy();
  expect(get.mock.calls.every(([url])=>url.startsWith('/reportes/'))).toBe(true);
});

test('renovación con permisos retirados: aborta GET, descarta respuesta tardía, oculta datos; permisos otorgados se aplican', async () => {
  let resolveStats;
  auth.usuario=user(['reportes.ver']);
  get.mockImplementation(url=>url==='/reportes/estadisticas' ? new Promise(resolve=>{resolveStats=resolve;}) : Promise.resolve({data:[]}));
  const view=render(<MemoryRouter><Dashboard /><Sidebar usuario={auth.usuario} menuOpen isMobile collapsed={false} setCollapsed={()=>{}} /></MemoryRouter>);
  await waitFor(()=>expect(resolveStats).toBeTypeOf('function'));
  const signal=get.mock.calls.find(([url])=>url==='/reportes/estadisticas')[1].signal;
  auth.usuario=user([]);
  view.rerender(<MemoryRouter><Dashboard /><Sidebar usuario={auth.usuario} menuOpen isMobile collapsed={false} setCollapsed={()=>{}} /></MemoryRouter>);
  expect(signal.aborted).toBe(true);
  await act(async()=>resolveStats({data:{embarazos_activos:999}}));
  expect(screen.queryByText('999')).toBeNull();
  expect(screen.queryByText('Embarazos activos')).toBeNull();
  expect(screen.queryByRole('button',{name:'Reportes'})).toBeNull();
  get.mockResolvedValue({data:[]});
  auth.usuario=user(['reportes.ver']);
  view.rerender(<MemoryRouter><Dashboard /><Sidebar usuario={auth.usuario} menuOpen isMobile collapsed={false} setCollapsed={()=>{}} /></MemoryRouter>);
  expect(await screen.findByText('Embarazos activos')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Reportes'})).toBeTruthy();
});
