// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import NuevoControl from '../src/pages/NuevoControl.jsx';
import TimelineControles from '../src/components/TimelineControles.jsx';
import AccessRoute from '../src/components/AccessRoute.jsx';
import { ACCESS } from '../src/utils/accessRules.js';
import { ToastContext } from '../src/context/ToastContext.js';
import { ChatbotScreenProvider } from '../src/context/ChatbotScreenContext.jsx';
import api from '../src/api/axios.js';
const auth = vi.hoisted(() => ({ usuario: null }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
const toast = vi.fn();
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
function mount(permissions, state = 'activo', edit = false, entry = 'detail') {
  auth.usuario = { id: 1, rol: 'medico', permisos: ['pacientes.ver', ...permissions] };
  const allowed = permissions.includes('controles.ver_vih');
  const control = { id: 3, numero_control: 1, fecha: '2026-01-15', motivo_consulta: 'Dato sintético',
    ...(allowed ? { vih_realizado: true, vih_resultado: 'negativo' } : {}) };
  vi.spyOn(api, 'get').mockImplementation(async url => ({ data: url.endsWith('/expediente') ? {
    paciente: { id: 1, nombres: 'Sintética', apellidos: 'Prueba' }, is_read_only: state === 'cerrado',
    embarazo_seleccionado: { id: 2, estado: state, fur: '2026-01-01' },
  } : url.endsWith('/controles') ? [] : control }));
  for (const method of ['post', 'put', 'delete', 'patch']) vi.spyOn(api, method).mockResolvedValue({ data: {} });
  return render(<ToastContext.Provider value={toast}><ChatbotScreenProvider>
    <MemoryRouter initialEntries={[entry === 'timeline' ? '/pacientes/1' : entry === 'new' ? '/pacientes/1/controles/nuevo?embarazo_id=2' : `/pacientes/1/controles/3${edit ? '/editar' : ''}?embarazo_id=2`]}>
      <Location /><Routes>
        <Route path="/pacientes/:id" element={<TimelineControles pacienteId={1} embarazoId={2} controles={[control]} puedeConsultar estadoEmbarazo={state} isReadOnly={state === 'cerrado'} />} />
        <Route path="/pacientes/:id/controles/nuevo" element={<AccessRoute access={ACCESS.newControl}><NuevoControl /></AccessRoute>} />
        <Route path="/pacientes/:id/controles/:controlId" element={<AccessRoute access={ACCESS.patients}><NuevoControl consultationOnly /></AccessRoute>} />
        <Route path="/pacientes/:id/controles/:controlId/editar" element={<AccessRoute access={ACCESS.editControl}><NuevoControl /></AccessRoute>} />
        <Route path="/dashboard" element={<h1>Inicio</h1>} />
      </Routes>
    </MemoryRouter></ChatbotScreenProvider></ToastContext.Provider>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); toast.mockClear(); });

for (const state of ['activo', 'cerrado']) {
  for (const permissions of [[], ['controles.crear'], ['controles.editar'], ['controles.editar', 'controles.ver_vih']]) {
    test(`consulta ${state}, ${permissions.join(',') || 'lectura'}: campos bloqueados y cero escrituras`, async () => {
      mount(permissions, state);
      await screen.findByText('Consulta de solo lectura');
      expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
      expect(Boolean(screen.queryByRole('button', { name: 'Editar', exact: true }))).toBe(state === 'activo' && permissions.includes('controles.editar'));
      if (state === 'activo' && !permissions.includes('controles.editar')) {
        expect(screen.getByText(/No tienes permiso para editar/)).toBeTruthy();
        expect(screen.queryByText(/Este embarazo está cerrado/)).toBeNull();
      }
      for (const tab of screen.getAllByRole('tab')) {
        fireEvent.click(tab);
        for (const input of document.querySelectorAll('input,select,textarea')) {
          expect(input.disabled || input.readOnly || Boolean(input.closest('fieldset[disabled]'))).toBe(true);
        }
      }
      fireEvent.click(screen.getByRole('tab', { name: 'Laboratorios' }));
      expect(Boolean(document.querySelector('[name="vih_resultado"]'))).toBe(permissions.includes('controles.ver_vih'));
      fireEvent.submit(document.querySelector('form'));
      for (const method of ['post', 'put', 'delete', 'patch']) expect(api[method]).not.toHaveBeenCalled();
      expect(api.get.mock.calls.every(([, config]) => config.params.embarazo_id === '2')).toBe(true);
    });
  }
}
test('crear sin editar no puede acceder a URL de edición', async () => {
  mount(['controles.crear'], 'activo', true);
  expect(await screen.findByText('Inicio')).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
});
test('Editar desde consulta abre la ruta separada y habilita guardar solo en activo', async () => {
  mount(['controles.editar']);
  await screen.findByText('Consulta de solo lectura');
  fireEvent.click(screen.getByRole('button', { name: 'Editar', exact: true }));
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/pacientes/1/controles/3/editar'));
  expect(await screen.findByRole('button', { name: /Guardar cambios/ })).toBeTruthy();
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('vih_resultado');
  expect(api.post).not.toHaveBeenCalled();
});
test('URL de edición con embarazo cerrado permanece en lectura y no escribe', async () => {
  mount(['controles.editar', 'controles.ver_vih'], 'cerrado', true);
  await screen.findByText('Consulta de solo lectura');
  expect(screen.getByText(/Este embarazo está cerrado/)).toBeTruthy();
  fireEvent.submit(document.querySelector('form'));
  expect(api.put).not.toHaveBeenCalled();
});

test.each(['activo', 'cerrado'])('Timeline Abrir llega a consulta del embarazo %s sin permiso de edición', async state => {
  mount([], state, false, 'timeline');
  fireEvent.click(screen.getByRole('button', { name: 'Abrir', exact: true }));
  await screen.findByText('Consulta de solo lectura');
  expect(screen.getByTestId('location').textContent).toBe('/pacientes/1/controles/3');
  fireEvent.submit(document.querySelector('form'));
  expect(api.put).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
});
test('crear sin editar conserva el alta activa separada del detalle', async () => {
  mount(['controles.crear'], 'activo', false, 'new');
  const save = await screen.findByRole('button', { name: /Guardar control/ });
  expect(save.disabled).toBe(false);
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(api.put).not.toHaveBeenCalled();
});
test('edición autorizada con VIH conserva el resultado permitido en el PUT', async () => {
  mount(['controles.editar', 'controles.ver_vih'], 'activo', true);
  await screen.findByRole('button', { name: /Guardar cambios/ });
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  expect(api.put.mock.calls[0][1].vih_resultado).toBe('negativo');
});
