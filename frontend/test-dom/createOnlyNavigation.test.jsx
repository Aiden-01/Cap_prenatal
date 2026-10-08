// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from '../src/pages/Dashboard.jsx';
import NuevaPaciente from '../src/pages/NuevaPaciente.jsx';
import AccessRoute from '../src/components/AccessRoute.jsx';
import Sidebar from '../src/components/Sidebar.jsx';
import { ACCESS } from '../src/utils/accessRules.js';
import { ToastContext } from '../src/context/ToastContext.js';
import { ChatbotScreenProvider } from '../src/context/ChatbotScreenContext.jsx';
import api from '../src/api/axios.js';
const auth = vi.hoisted(() => ({ usuario: null }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
const visits = [];
function Navigation() {
  const location = useLocation();
  useEffect(() => { visits.push(location.pathname); }, [location.pathname]);
  return <output data-testid="path">{location.pathname}</output>;
}
function mount(withMap, initial = '/nuevo', isMobile = false) {
  auth.usuario = { id: 1, rol: 'medico', permisos: ['pacientes.crear', ...(withMap ? ['mapa_riesgo.ver'] : [])] };
  vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
  vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 123 } });
  vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
  return render(<ToastContext.Provider value={vi.fn()}><ChatbotScreenProvider>
    <MemoryRouter initialEntries={[initial]}><Navigation />
      <Sidebar usuario={auth.usuario} isMobile={isMobile} menuOpen setMenuOpen={() => {}} collapsed={false} setCollapsed={() => {}} />
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/nuevo" element={<AccessRoute access={ACCESS.newPatient}><NuevaPaciente /></AccessRoute>} />
        <Route path="/mapa-riesgo" element={<AccessRoute access={ACCESS.riskMap}><h1>Mapa permitido</h1></AccessRoute>} />
      </Routes>
    </MemoryRouter></ChatbotScreenProvider></ToastContext.Provider>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); visits.length = 0; });

for (const isMobile of [false, true]) {
  test(`solo crear: Inicio sencillo y registro explícito (${isMobile ? 'móvil' : 'escritorio'})`, async () => {
    mount(false, '/dashboard', isMobile);
    expect(screen.queryByText('Funciones disponibles')).toBeNull();
    expect(document.querySelector('.content-tabs')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar paciente', exact: true }));
    expect(await screen.findByRole('button', { name: /Volver/ })).toBeTruthy();
    expect(screen.getByTestId('path').textContent).toBe('/nuevo');
    expect(api.get.mock.calls.every(([url]) => url === '/comunidades/activas')).toBe(true);
  });
}
for (const withMap of [false, true]) {
  const destination = '/dashboard';
  test(`Volver real, crear ${withMap ? 'con mapa' : 'solo'}: no retorna a formulario`, async () => {
    mount(withMap);
    fireEvent.click(await screen.findByRole('button', { name: /Volver/ }));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe(destination));
    expect(visits.at(-1)).toBe(destination);
    expect(screen.queryByRole('heading', { name: 'Nueva paciente', exact: true })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
  test(`POST exitoso real, crear ${withMap ? 'con mapa' : 'solo'}: termina fuera del formulario`, async () => {
    mount(withMap);
    await screen.findByRole('button', { name: /Volver/ });
    fireEvent.change(document.querySelector('[name="no_expediente"]'), { target: { value: 'SYN-CREATE' } });
    fireEvent.click(screen.getByRole('tab', { name: /Paciente/ }));
    fireEvent.change(document.querySelector('[name="nombres"]'), { target: { value: 'Sintética' } });
    fireEvent.change(document.querySelector('[name="apellidos"]'), { target: { value: 'Prueba' } });
    fireEvent.click(screen.getByRole('tab', { name: /Confirmar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar paciente', exact: true }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][0]).toBe('/pacientes');
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe(destination), { timeout: 2500 });
    expect(visits.filter(p => p === '/nuevo')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Nueva paciente', exact: true })).toBeNull();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.get.mock.calls.every(([url]) => ['/comunidades/activas', ...(withMap ? ['/mapa/riesgo'] : [])].includes(url))).toBe(true);
  });
}
test('crear con mapa conserva Inicio con ambos bloques, sin redirección', async () => {
  mount(true, '/dashboard');
  expect(await screen.findByRole('button', { name: 'Abrir mapa completo' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Registrar paciente', exact: true })).toBeTruthy();
  expect(visits).toEqual(['/dashboard']);
  expect(screen.getByRole('button', { name: 'Inicio', exact: true })).toBeTruthy();
  expect(api.get.mock.calls.every(([url]) => url === '/mapa/riesgo')).toBe(true);
});
