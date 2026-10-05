// @vitest-environment jsdom
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastContext } from '../src/context/ToastContext.js';
import { ChatbotScreenProvider } from '../src/context/ChatbotScreenContext.jsx';
import api from '../src/api/axios.js';
import NuevaPaciente from '../src/pages/NuevaPaciente.jsx';

const PATIENT = { version: 7, id: 41, no_expediente: 'SYN-VERSION', nombres: 'Sintetica', apellidos: 'Prueba', pueblo: 'mestizo', telefono: '11111111' };
const toast = vi.fn();
function mount() {
  return render(<ToastContext.Provider value={toast}><MemoryRouter initialEntries={['/pacientes/41/editar']}>
    <Routes><Route path='/pacientes/:id/editar' element={<ChatbotScreenProvider><NuevaPaciente /></ChatbotScreenProvider>} />
      <Route path='/pacientes/:id' element={<div>Expediente</div>} /></Routes>
  </MemoryRouter></ToastContext.Provider>);
}
async function ready() {
  await waitFor(() => assert.equal(document.querySelector('[name="no_expediente"]').value, PATIENT.no_expediente));
}
function finish() {
  for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
  fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
}
function editPhone(value) {
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
  fireEvent.change(document.querySelector('[name="telefono"]'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /Atrás/ }));
}
beforeEach(() => {
  toast.mockClear();
  vi.spyOn(api, 'get').mockImplementation(async url => ({ data: url === '/comunidades/activas' ? [] : PATIENT }));
  vi.spyOn(api, 'put').mockResolvedValue({ data: { version: 8 }, status: 200 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('conserva versión cargada y la envía como entero al PUT', async () => {
  mount(); await ready(); editPhone('22222222'); finish();
  await waitFor(() => assert.equal(api.put.mock.calls.length, 1));
  assert.equal(api.put.mock.calls[0][0], '/pacientes/41');
  assert.equal(api.put.mock.calls[0][1].version, 7);
  assert.equal(api.put.mock.calls[0][1].telefono, '22222222');
});

test('guardar sin editar envía solo versión sin persistir defaults ni cálculos de presentación', async () => {
  mount(); await ready(); finish();
  await waitFor(() => assert.equal(api.put.mock.calls.length, 1));
  assert.deepEqual(api.put.mock.calls[0][1], { version: 7 });
});

test('FUR modificada conserva FPP manual aunque coincida con el valor original', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/comunidades/activas' ? [] : { ...PATIENT, fur: '2026-01-01', fpp: '2026-10-08' } }));
  mount(); await ready();
  fireEvent.click(screen.getByRole('tab', { name: /Gestación/ }));
  fireEvent.change(document.querySelector('[name="fur"]'), { target: { value: '2026-02-01' } });
  fireEvent.change(document.querySelector('[name="fpp"]'), { target: { value: '2026-10-08' } });
  fireEvent.click(screen.getByRole('tab', { name: /Confirmar/ }));
  fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
  await waitFor(() => assert.equal(api.put.mock.calls.length, 1));
  assert.equal(api.put.mock.calls[0][1].fur, '2026-02-01');
  assert.equal(api.put.mock.calls[0][1].fpp, '2026-10-08');
});

test('conflicto conserva borrador, enfoca explicación, confirma recarga y envía nueva versión', async () => {
  api.put.mockRejectedValueOnce({ response: { status: 409, data: { code: 'PATIENT_VERSION_CONFLICT' } } });
  mount(); await ready(); editPhone('22222222'); finish();
  const heading = await screen.findByRole('heading', { name: /El expediente cambió/ });
  assert.ok(document.activeElement === heading);
  assert.equal(toast.mock.calls.length, 0);
  assert.equal(screen.getByRole('button', { name: /Guardar cambios/ }).disabled, true);
  // Cambiar de paso permite revisar/copiar el borrador sin guardarlo sobre datos ajenos.
  fireEvent.click(screen.getByRole('tab', { name: /Paciente/ }));
  assert.equal(document.querySelector('[name="telefono"]').value, '22222222');
  const getCount = api.get.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: /Cargar versión más reciente/ }));
  assert.ok(screen.getByText(/Los cambios que no haya guardado se descartarán/));
  assert.equal(api.get.mock.calls.length, getCount);
  fireEvent.click(screen.getByRole('button', { name: /Conservar mi formulario/ }));
  assert.equal(document.querySelector('[name="telefono"]').value, '22222222');
  fireEvent.click(screen.getByRole('button', { name: /Cargar versión más reciente/ }));
  api.get.mockResolvedValueOnce({ data: { ...PATIENT, version: 8, telefono: '33333333' } });
  fireEvent.click(screen.getByRole('button', { name: /Confirmar y cargar/ }));
  await waitFor(() => assert.ok(screen.queryByRole('heading', { name: /El expediente cambió/ }) === null));
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
  assert.equal(document.querySelector('[name="telefono"]').value, '33333333');
  fireEvent.click(screen.getByRole('button', { name: /Atrás/ }));
  finish();
  await waitFor(() => assert.equal(api.put.mock.calls.length, 2));
  assert.equal(api.put.mock.calls[1][1].version, 8);
  assert.deepEqual(api.put.mock.calls[1][1], { version: 8 });
});

test('recarga fallida conserva formulario y permite reintento sin PUT adicional', async () => {
  api.put.mockRejectedValue({ response: { status: 409, data: { code: 'PATIENT_VERSION_CONFLICT' } } });
  mount(); await ready(); editPhone('22222222'); finish();
  await screen.findByRole('heading', { name: /El expediente cambió/ });
  fireEvent.click(screen.getByRole('button', { name: /Cargar versión más reciente/ }));
  api.get.mockRejectedValueOnce(new Error('synthetic network failure'));
  fireEvent.click(screen.getByRole('button', { name: /Confirmar y cargar/ }));
  await screen.findByText(/Sus datos siguen en el formulario/);
  fireEvent.click(screen.getByRole('tab', { name: /Paciente/ }));
  assert.equal(document.querySelector('[name="telefono"]').value, '22222222');
  assert.equal(api.put.mock.calls.length, 1);
  assert.equal(screen.getByRole('button', { name: /Confirmar y cargar/ }).disabled, false);
});

test('otros conflictos siguen su manejo habitual sin ofrecer recarga por versión', async () => {
  api.put.mockRejectedValue({ response: { status: 409, data: { code: 'DUPLICATE_RESOURCE', message: 'Ya existe una paciente con ese CUI' } } });
  mount(); await ready(); finish();
  await waitFor(() => assert.equal(toast.mock.calls.length, 1));
  assert.equal(screen.queryByRole('heading', { name: /El expediente cambió/ }), null);
});
