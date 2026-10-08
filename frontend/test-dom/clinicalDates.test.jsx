// @vitest-environment jsdom
import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastContext } from '../src/context/ToastContext.js';
import { ChatbotScreenProvider } from '../src/context/ChatbotScreenContext.jsx';
import api from '../src/api/axios.js';
import Pacientes from '../src/pages/Pacientes.jsx';
import ExpedientePaciente from '../src/pages/ExpedientePaciente.jsx';
import NuevaPaciente from '../src/pages/NuevaPaciente.jsx';
import Dashboard from '../src/pages/Dashboard.jsx';
import Reportes from '../src/pages/Reportes.jsx';

const auth = vi.hoisted(() => ({ usuario: { id: 73, permisos: ['pacientes.editar'] } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
const PATIENT = { id: 41, version: 7, no_expediente: 'SYN-DATE', nombres: 'Sintetica', apellidos: 'Prueba', pueblo: 'mestizo' };
const toast = vi.fn();
function mount(Component, path, route) {
  return render(<ToastContext.Provider value={toast}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path={route} element={<ChatbotScreenProvider><Component /></ChatbotScreenProvider>} />
  </Routes></MemoryRouter></ToastContext.Provider>);
}
function install(fur, fpp = fur) {
  const pregnancy = { id: 91, paciente_id: 41, numero_embarazo: 1, estado: 'activo', fur, fpp };
  const patient = { ...PATIENT, fur, fpp };
  vi.spyOn(api, 'get').mockImplementation(async url => ({ data:
    url === '/pacientes' ? { data: [{ ...patient, embarazo_id: 91, embarazo_fur: fur, embarazo_fpp: fpp }], total: 1 }
      : url.endsWith('/expediente') ? { paciente: patient, embarazo_seleccionado: pregnancy, embarazo_actual: pregnancy, embarazos: [pregnancy] }
        : url === '/pacientes/41' ? patient : [] }));
  vi.spyOn(api, 'put').mockResolvedValue({ data: { version: 7 } });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

for (const date of ['2026-01-15', '2026-01-31', '2026-12-31', '2026-02-28', '2024-02-29', null]) {
  for (const legacyIso of [false, true]) {
    test(`listado, expediente y edición conservan ${date} (${legacyIso ? 'ISO anterior' : 'DATE'}) sin PUT falso`, async () => {
      const wire = date && legacyIso ? `${date}T00:00:00.000Z` : date;
      const display = date ? `${Number(date.slice(8))}/${Number(date.slice(5, 7))}/${date.slice(0, 4)}` : '—';
      install(wire);
      mount(Pacientes, '/pacientes', '/pacientes');
      await screen.findByRole('button', { name: 'Abrir expediente de Sintetica Prueba' });
      assert.equal(document.querySelector('.patient-orbit-card').textContent.includes(display), true);
      // Both FUR and FPP cells must show the civil day.
      if (date) assert.equal(screen.getAllByText(display).length, 2);
      cleanup();
      mount(ExpedientePaciente, '/pacientes/41', '/pacientes/:id');
      await screen.findByRole('heading', { name: /Sintetica Prueba/ });
      if (date) {
        assert.ok(screen.getByText(`FUR: ${display}`));
        assert.ok(screen.getByText(`FPP: ${display}`));
      } else {
        assert.equal(screen.queryByText(/^FUR:/), null);
        assert.equal(screen.queryByText(/^FPP:/), null);
      }
      cleanup();
      mount(NuevaPaciente, '/pacientes/41/editar', '/pacientes/:id/editar');
      await waitFor(() => assert.equal(document.querySelector('[name="no_expediente"]').value, PATIENT.no_expediente));
      fireEvent.click(screen.getByRole('tab', { name: /Gestación/ }));
      assert.equal(document.querySelector('[name="fur"]').value, date || '');
      assert.equal(document.querySelector('[name="fpp"]').value, date || '');
      fireEvent.click(screen.getByRole('tab', { name: /Confirmar/ }));
      fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
      await waitFor(() => assert.equal(api.put.mock.calls.length, 1));
      assert.deepEqual(api.put.mock.calls[0][1], { version: 7 });
    });
  }
}

test('FPP derivada suma 280 días; urgencia usa día de Guatemala', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2025-12-06T01:00:00Z')); // Guatemala aún 5/12.
  install('2025-02-28', null); // +280 días = 5/12/2025.
  mount(Pacientes, '/pacientes', '/pacientes');
  const label = await screen.findByText('5/12/2025');
  assert.equal(label.closest('[title]').title, '0 semanas para la fecha probable de parto');
});

test.each([
  ['2024-02-29', '5/12/2024'],
  ['2026-03-27', '1/1/2027'],
])('FPP derivada de %s preserva bisiesto y cambio de año', async (fur, expected) => {
  install(fur, null);
  mount(Pacientes, '/pacientes', '/pacientes');
  assert.ok(await screen.findByText(expected));
});

test('reporte muestra FUR/FPP y primer control con el mismo día civil', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { total: 1, indicadores: {}, pacientes: [{
    id: 41, nombre_completo: 'Sintetica Prueba', fur: '2024-02-29', fpp: '2024-12-05', fecha_primer_control: '2024-03-01',
  }] } });
  mount(Reportes, '/reportes', '/reportes');
  fireEvent.click(screen.getByRole('button', { name: /Generar reporte/ }));
  assert.ok(await screen.findByText('29/2/2024'));
  assert.ok(screen.getByText('5/12/2024'));
  assert.ok(screen.getByText('1/3/2024'));
});

test('dashboard muestra FPP civil y semanas desde el día de Guatemala', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-02-01T01:00:00Z')); // Guatemala: 31/1.
  vi.spyOn(api, 'get').mockImplementation(async url => ({ data: url === '/reportes/estadisticas' ? {}
    : url === '/reportes/proximas-a-parir' ? [{ id: 41, nombre_completo: 'Sintetica', fpp: '2026-02-01', dias_restantes: 1 }] : [] }));
  mount(Dashboard, '/dashboard', '/dashboard');
  fireEvent.click(await screen.findByRole('button', { name: /Próximas al Parto \(1\)/ }));
  const label = await screen.findByText('1/2/2026');
  assert.equal(label.title, '1 semanas para la fecha probable de parto');
});

test('409 conserva borrador de fechas; recarga explícita recupera día y versión del servidor', async () => {
  install('2026-01-01', '2026-10-08');
  api.put.mockRejectedValueOnce({ response: { status: 409, data: { code: 'PATIENT_VERSION_CONFLICT' } } });
  mount(NuevaPaciente, '/pacientes/41/editar', '/pacientes/:id/editar');
  await waitFor(() => assert.equal(document.querySelector('[name="no_expediente"]').value, PATIENT.no_expediente));
  fireEvent.click(screen.getByRole('tab', { name: /Gestación/ }));
  fireEvent.change(document.querySelector('[name="fur"]'), { target: { value: '2024-02-29' } });
  fireEvent.change(document.querySelector('[name="fpp"]'), { target: { value: '2024-12-05' } });
  fireEvent.click(screen.getByRole('tab', { name: /Confirmar/ }));
  fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
  await screen.findByRole('heading', { name: /El expediente cambió/ });
  fireEvent.click(screen.getByRole('tab', { name: /Gestación/ }));
  assert.equal(document.querySelector('[name="fur"]').value, '2024-02-29');
  assert.equal(document.querySelector('[name="fpp"]').value, '2024-12-05');
  fireEvent.click(screen.getByRole('button', { name: /Cargar versión más reciente/ }));
  api.get.mockResolvedValueOnce({ data: { ...PATIENT, version: 8, fur: '2026-01-31', fpp: '2026-11-07' } });
  fireEvent.click(screen.getByRole('button', { name: /Confirmar y cargar/ }));
  await waitFor(() => assert.ok(screen.queryByRole('heading', { name: /El expediente cambió/ }) === null));
  fireEvent.click(screen.getByRole('tab', { name: /Gestación/ }));
  assert.equal(document.querySelector('[name="fur"]').value, '2026-01-31');
  assert.equal(document.querySelector('[name="fpp"]').value, '2026-11-07');
  api.put.mockResolvedValue({ data: { version: 8 } });
  fireEvent.click(screen.getByRole('tab', { name: /Confirmar/ }));
  fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
  await waitFor(() => assert.equal(api.put.mock.calls.length, 2));
  assert.deepEqual(api.put.mock.calls[1][1], { version: 8 });
});
