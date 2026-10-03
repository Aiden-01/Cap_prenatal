// @vitest-environment jsdom
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastContext } from '../src/context/ToastContext.js';
import { ChatbotScreenProvider } from '../src/context/ChatbotScreenContext.jsx';
import api from '../src/api/axios.js';
import NuevaPaciente from '../src/pages/NuevaPaciente.jsx';

const CATALOGS = {
  'Nombre del Establecimiento': ['CAP El Chal', 'P/S Colpetén', 'C/C Nuevas Delicias', 'P/S Las Flores', 'P/S Santa Amelia'],
  Distrito: ['El Chal', 'Santa Ana', 'Dolores', 'Poptún', 'San Luis', 'Chacté'],
  'Área de Salud': ['Petén Sur Oriente'],
};
const SYNTHETIC = { id: 41, no_expediente: 'SYN-UI-001', nombres: 'Sintetica', apellidos: 'Catalogo', pueblo: 'mestizo' };
const toast = () => {};

function renderForm(edit = false) {
  return render(<ToastContext.Provider value={toast}><MemoryRouter initialEntries={[edit ? '/pacientes/41/editar' : '/nuevo']}>
    <Routes><Route path={edit ? '/pacientes/:id/editar' : '/nuevo'} element={<ChatbotScreenProvider><NuevaPaciente /></ChatbotScreenProvider>} />
      <Route path='/pacientes/:id' element={<div>Expediente sintético</div>} /></Routes>
  </MemoryRouter></ToastContext.Provider>);
}

async function finish(container, edit = false) {
  if (!edit) {
    fireEvent.change(container.querySelector('[name="no_expediente"]'), { target: { value: SYNTHETIC.no_expediente } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
  if (!edit) {
    fireEvent.change(container.querySelector('[name="nombres"]'), { target: { value: SYNTHETIC.nombres } });
    fireEvent.change(container.querySelector('[name="apellidos"]'), { target: { value: SYNTHETIC.apellidos } });
  }
  for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
  fireEvent.click(screen.getByRole('button', { name: edit ? /Guardar cambios/ : /Registrar paciente/ }));
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({ data: url === '/comunidades/activas' ? [] : SYNTHETIC }));
  vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 41 }, status: 201 });
  vi.spyOn(api, 'put').mockResolvedValue({ data: {}, status: 200 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('renderiza tres selects con labels, opciones exactas y defaults en el estado/payload', async () => {
  const { container } = renderForm();
  for (const [label, values] of Object.entries(CATALOGS)) {
    const select = screen.getByLabelText(label);
    assert.equal(select.tagName, 'SELECT');
    assert.deepEqual(Array.from(select.options, (option) => option.value), values);
    assert.equal(select.value, values[0]);
    assert.equal(select.id, select.name);
    assert.equal(container.querySelector(`input[name="${select.name}"]`), null);
  }
  await finish(container);
  await waitFor(() => assert.equal(api.post.mock.calls.length, 1));
  const payload = api.post.mock.calls[0][1];
  assert.equal(payload.nombre_establecimiento, 'CAP El Chal');
  assert.equal(payload.distrito, 'El Chal');
  assert.equal(payload.area_salud, 'Petén Sur Oriente');
});

test('selecciona todos los establecimientos, cambia distrito y conserva al avanzar/regresar', async () => {
  const user = userEvent.setup();
  const { container } = renderForm();
  for (const value of CATALOGS['Nombre del Establecimiento']) {
    await user.selectOptions(screen.getByLabelText('Nombre del Establecimiento'), value);
    assert.equal(screen.getByLabelText('Nombre del Establecimiento').value, value);
  }
  await user.selectOptions(screen.getByLabelText('Distrito'), 'Poptún');
  screen.getByLabelText('Distrito').focus();
  await user.keyboard('{Tab}');
  assert.equal(document.activeElement, screen.getByLabelText('Área de Salud'));
  await user.click(screen.getByRole('button', { name: /Siguiente/ }));
  await user.click(screen.getByRole('button', { name: /Atrás/ }));
  assert.equal(screen.getByLabelText('Nombre del Establecimiento').value, 'P/S Santa Amelia');
  assert.equal(screen.getByLabelText('Distrito').value, 'Poptún');
  assert.equal(screen.getByLabelText('Área de Salud').value, 'Petén Sur Oriente');
  await finish(container);
  await waitFor(() => assert.equal(api.post.mock.calls.length, 1));
  assert.equal(api.post.mock.calls[0][1].nombre_establecimiento, 'P/S Santa Amelia');
  assert.equal(api.post.mock.calls[0][1].distrito, 'Poptún');
});

test('edición muestra legacy sin input libre y omite los tres valores si no cambian', async () => {
  const legacy = { ...SYNTHETIC, nombre_establecimiento: 'Unidad histórica ', distrito: 'Distrito Sur Oriente', area_salud: 'Peten, Area Sur Oriente' };
  api.get.mockImplementation(async (url) => ({ data: url === '/comunidades/activas' ? [] : legacy }));
  const { container } = renderForm(true);
  await waitFor(() => assert.equal(screen.getByLabelText('Distrito').value, legacy.distrito));
  for (const label of Object.keys(CATALOGS)) {
    const select = screen.getByLabelText(label);
    assert.equal(select.tagName, 'SELECT');
    assert.equal(select.selectedOptions[0].disabled, true);
  }
  await finish(container, true);
  await waitFor(() => assert.equal(api.put.mock.calls.length, 1));
  for (const field of ['nombre_establecimiento', 'distrito', 'area_salud']) assert.equal(Object.hasOwn(api.put.mock.calls[0][1], field), false);
});

test('edición permite sustituir legacy intencionalmente con valor canónico', async () => {
  api.get.mockImplementation(async (url) => ({ data: url === '/comunidades/activas' ? [] : { ...SYNTHETIC, distrito: 'Distrito Sur Oriente', area_salud: null, nombre_establecimiento: null } }));
  const { container } = renderForm(true);
  await waitFor(() => assert.equal(screen.getByLabelText('Distrito').value, 'Distrito Sur Oriente'));
  assert.equal(screen.getByLabelText('Área de Salud').value, '');
  fireEvent.change(screen.getByLabelText('Distrito'), { target: { value: 'Chacté' } });
  await finish(container, true);
  await waitFor(() => assert.equal(api.put.mock.calls.length, 1));
  assert.equal(api.put.mock.calls[0][1].distrito, 'Chacté');
  assert.equal(Object.hasOwn(api.put.mock.calls[0][1], 'area_salud'), false);
  assert.equal(Object.hasOwn(api.put.mock.calls[0][1], 'nombre_establecimiento'), false);
});
