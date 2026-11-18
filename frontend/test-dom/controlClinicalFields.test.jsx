// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NuevoControl from '../src/pages/NuevoControl';
import { ToastContext } from '../src/context/ToastContext';
import { ChatbotScreenProvider } from '../src/context/ChatbotScreenContext';
import { prepareControlClinicalPayload } from '../src/utils/controlClinicalFields';
import api from '../src/api/axios';
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ usuario: { id: 1, permisos: ['pacientes.ver', 'controles.crear', 'controles.editar'] } }) }));
const cargos = [
  { id: 1, nombre: 'Auxiliar de enfermería', codigo: 'AE', activo: true },
  { id: 2, nombre: 'Enfermería profesional', codigo: 'EP', activo: true },
  { id: 3, nombre: 'Médico/a', codigo: 'MED', activo: true },
  { id: 4, nombre: 'Nutricionista', codigo: null, activo: true },
];
const toast = vi.fn();
function mount({ control = null, consultationOnly = false, failCatalog = false } = {}) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  let failure = failCatalog;
  vi.spyOn(api, 'get').mockImplementation(async url => {
    if (url === '/catalogos/cargos') {
      if (failure) { failure = false; throw Error('catalogo'); }
      return { data: { data: cargos, total: cargos.length } };
    }
    if (url.endsWith('/expediente')) return { data: { paciente: { id: 1, nombres: 'Paciente', apellidos: 'sintética' }, embarazo_seleccionado: { id: 2, estado: 'activo', fur: '2026-01-01' }, is_read_only: false } };
    return { data: control || [] };
  });
  vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 9 } });
  vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
  const route = control ? `/pacientes/1/controles/3${consultationOnly ? '' : '/editar'}?embarazo_id=2` : '/pacientes/1/controles/nuevo?embarazo_id=2';
  render(<ToastContext.Provider value={toast}><ChatbotScreenProvider><MemoryRouter initialEntries={[route]}><Routes>
    <Route path="/pacientes/:id/controles/nuevo" element={<NuevoControl />} />
    <Route path="/pacientes/:id/controles/:controlId/editar" element={<NuevoControl />} />
    <Route path="/pacientes/:id/controles/:controlId" element={<NuevoControl consultationOnly={consultationOnly} />} />
  </Routes></MemoryRouter></ChatbotScreenProvider></ToastContext.Provider>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); toast.mockClear(); });

test('alta separa texto libre/catálogo y envía valores fetales seleccionados sin snapshot ni legado', async () => {
  mount();
  await screen.findByRole('option', { name: 'Médico/a (MED)' });
  fireEvent.change(screen.getByLabelText('Nombre completo de quien atiende'), { target: { value: 'Profesional declarado sintético' } });
  fireEvent.change(screen.getByLabelText('Cargo de quien atiende'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Situación fetal'), { target: { value: 'Longitudinal' } });
  fireEvent.change(screen.getByLabelText('Presentación fetal'), { target: { value: 'No determinada' } });
  expect(screen.getByRole('option', { name: 'Nutricionista' })).toBeTruthy();
  expect(screen.queryByRole('option', { name: 'Funicular' })).toBeNull();
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
  expect(api.post.mock.calls[0][1]).toMatchObject({ nombre_atiende: 'Profesional declarado sintético', cargo_atiende_id: 3, situacion_fetal: 'Longitudinal', presentacion_fetal: 'No determinada' });
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('cargo_atiende_snapshot');
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('nombre_cargo_atiende');
});

test('sin evaluar y sin cargo no se convierten en opciones clínicas inferidas', async () => {
  mount(); await screen.findByRole('option', { name: 'Médico/a (MED)' });
  expect(screen.getByLabelText('Nombre completo de quien atiende').value).toBe('');
  expect(screen.getByLabelText('Cargo de quien atiende').value).toBe('');
  expect(screen.getByLabelText('Situación fetal').value).toBe('');
  expect(screen.getByLabelText('Presentación fetal').value).toBe('');
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
  expect(api.post.mock.calls[0][1]).toMatchObject({ nombre_atiende: '', cargo_atiende_id: null, situacion_fetal: '', presentacion_fetal: '' });
});

test('legado combinado y valores fetales fuera de catálogo se muestran intactos y no se reescriben', async () => {
  mount({ control: { id: 3, numero_control: 1, fecha: '2026-01-15', nombre_cargo_atiende: 'Texto histórico sin desglose', nombre_atiende: null, cargo_atiende_id: null, cargo_atiende_snapshot: null, situacion_fetal: 'Dato fetal legado', presentacion_fetal: 'Funicular' } });
  await screen.findByRole('option', { name: 'Médico/a (MED)' });
  expect(screen.getByText('Texto histórico sin desglose')).toBeTruthy();
  expect(screen.getByLabelText('Nombre completo de quien atiende').value).toBe('');
  expect(screen.getByLabelText('Cargo de quien atiende').value).toBe('');
  expect(screen.getByRole('option', { name: 'Dato fetal legado (valor histórico)' })).toBeTruthy();
  expect(screen.getByRole('option', { name: 'Funicular (valor histórico)' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Motivo de consulta'), { target: { value: 'Nueva observación sintética' } });
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.put).toHaveBeenCalledOnce());
  for (const name of ['nombre_atiende', 'cargo_atiende_id', 'cargo_atiende_snapshot', 'nombre_cargo_atiende', 'situacion_fetal', 'presentacion_fetal']) expect(api.put.mock.calls[0][1]).not.toHaveProperty(name);
});

test('cargo histórico fuera del catálogo activo se conserva sin asignar su snapshot desde cliente', async () => {
  mount({ control: { id: 3, numero_control: 1, fecha: '2026-01-15', nombre_atiende: 'Nombre capturado', cargo_atiende_id: 8, cargo_atiende_snapshot: { id: 8, nombre: 'Cargo histórico inactivo', codigo: 'TSR' } } });
  await screen.findByRole('option', { name: 'Médico/a (MED)' });
  expect(screen.getByLabelText('Cargo de quien atiende').value).toBe('8');
  expect(screen.getByRole('option', { name: /Cargo histórico inactivo/ })).toBeTruthy();
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.put).toHaveBeenCalledOnce());
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('cargo_atiende_id');
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('cargo_atiende_snapshot');
});

test('consulta conserva controles deshabilitados y no necesita consultar el catálogo', async () => {
  mount({ consultationOnly: true, control: { id: 3, numero_control: 1, fecha: '2026-01-15', nombre_atiende: 'Responsable declarado', cargo_atiende_id: 8, cargo_atiende_snapshot: { id: 8, nombre: 'Cargo histórico', codigo: null }, presentacion_fetal: 'Legado' } });
  await screen.findByText('Consulta de solo lectura');
  expect(screen.getByLabelText('Nombre completo de quien atiende').disabled).toBe(true);
  expect(screen.getByLabelText('Cargo de quien atiende').disabled).toBe(true);
  expect(screen.getByLabelText('Presentación fetal').disabled).toBe(true);
  expect(api.get.mock.calls.some(([url]) => url === '/catalogos/cargos')).toBe(false);
});

test('error de catálogo conserva campos y permite reintentar sin inferir una opción', async () => {
  mount({ failCatalog: true });
  await screen.findByText('No se pudieron cargar los cargos.');
  expect(screen.getByLabelText('Cargo de quien atiende').disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar', exact: true }));
  await screen.findByRole('option', { name: 'Médico/a (MED)' });
  expect(screen.getByLabelText('Cargo de quien atiende').disabled).toBe(false);
  expect(screen.getByLabelText('Cargo de quien atiende').value).toBe('');
});

test('payload excluye snapshots manipulables y preserva los argumentos originales', () => {
  const original = { nombre_cargo_atiende: 'Legado', cargo_atiende_snapshot: { codigo: 'MED' }, nombre_atiende: 'Nuevo nombre', cargo_atiende_id: 3 };
  expect(prepareControlClinicalPayload(original)).toEqual({ nombre_atiende: 'Nuevo nombre', cargo_atiende_id: 3 });
  expect(original.nombre_cargo_atiende).toBe('Legado');
  expect(original.cargo_atiende_snapshot.codigo).toBe('MED');
});
