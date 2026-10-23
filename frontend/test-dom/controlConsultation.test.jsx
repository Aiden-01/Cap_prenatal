// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
function mount(permissions, state = 'activo', edit = false, entry = 'detail', options = {}) {
  auth.usuario = { id: 1, rol: 'medico', permisos: ['pacientes.ver', ...permissions] };
  const allowed = permissions.includes('controles.ver_vih');
  const control = { id: 3, numero_control: 1, fecha: '2026-01-15', motivo_consulta: 'Dato sintético',
    impresion_clinica: 'Impresión histórica sintética', tratamiento: 'Tratamiento histórico sintético',
    ...(allowed ? { vih_realizado: true, vih_resultado: 'negativo' } : {}), ...options.control };
  vi.spyOn(api, 'get').mockImplementation(async url => ({ data: url.endsWith('/expediente') ? {
    paciente: { id: 1, nombres: 'Sintética', apellidos: 'Prueba' }, is_read_only: state === 'cerrado',
    embarazo_seleccionado: { id: 2, estado: state, fur: '2026-01-01' },
  } : url.endsWith('/controles') ? [] : control }));
  for (const method of ['post', 'put', 'delete', 'patch']) vi.spyOn(api, method).mockResolvedValue({ data: {} });
  return render(<ToastContext.Provider value={toast}><ChatbotScreenProvider>
    <MemoryRouter initialEntries={[entry === 'timeline' ? '/pacientes/1' : entry === 'new' ? '/pacientes/1/controles/nuevo?embarazo_id=2' : `/pacientes/1/controles/3${edit ? '/editar' : ''}?embarazo_id=2`]}>
      <Location /><Routes>
        <Route path="/pacientes/:id" element={<TimelineControles pacienteId={1} embarazoId={2} controles={[control]} puedeConsultar puedeEditar={permissions.includes('controles.editar')} estadoEmbarazo={state} isReadOnly={state === 'cerrado'} {...options.timeline} />} />
        <Route path="/pacientes/:id/controles/nuevo" element={<AccessRoute access={ACCESS.newControl}><NuevoControl /></AccessRoute>} />
        <Route path="/pacientes/:id/controles/:controlId" element={<AccessRoute access={ACCESS.patients}><NuevoControl consultationOnly /></AccessRoute>} />
        <Route path="/pacientes/:id/controles/:controlId/editar" element={<AccessRoute access={ACCESS.editControl}><NuevoControl /></AccessRoute>} />
        <Route path="/dashboard" element={<h1>Inicio</h1>} />
      </Routes>
    </MemoryRouter></ChatbotScreenProvider></ToastContext.Provider>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); toast.mockClear(); });

for (const state of ['activo', 'cerrado', 'puerperio']) {
  for (const permissions of [[], ['controles.crear'], ['controles.editar'], ['controles.editar', 'controles.ver_vih']]) {
    test(`consulta ${state}, ${permissions.join(',') || 'lectura'}: campos bloqueados y cero escrituras`, async () => {
      mount(permissions, state);
      await screen.findByText('Consulta de solo lectura');
      expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Editar', exact: true })).toBeNull();
      expect(screen.queryByText(/de 4 secciones revisadas/)).toBeNull();
      expect(screen.queryByRole('button', { name: /Marcar sección/ })).toBeNull();
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
test('Editar desde historial abre la ruta separada y habilita guardar solo en activo', async () => {
  mount(['controles.editar'], 'activo', false, 'timeline');
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

test('orden, teclado, datos y cita al final de General; campos retirados ausentes en todas las pestañas', async () => {
  mount(['controles.crear'], 'activo', false, 'new');
  await screen.findByRole('button', { name: /Guardar control/ });
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map(t => t.textContent.replace(/Por revisar/g, ''))).toEqual(['General', 'Laboratorios', 'Orientaciones', 'Suplementación']);
  fireEvent.change(screen.getByLabelText('P/A Sistólica'), { target: { value: '118' } });
  const general = screen.getByRole('tabpanel');
  expect(general.querySelectorAll('input,textarea,select')[general.querySelectorAll('input,textarea,select').length - 1].name).toBe('cita_siguiente');
  fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
  expect(screen.getByRole('tabpanel').id).toBe('control-panel-laboratorio');
  fireEvent.click(screen.getByRole('button', { name: 'Hematología' }));
  fireEvent.change(screen.getByLabelText('Hematología: resultado'), { target: { value: 'Resultado sintético' } });
  for (const t of tabs) {
    fireEvent.click(t);
    expect(document.querySelector('[name="impresion_clinica"], [name="tratamiento"]')).toBeNull();
  }
  fireEvent.click(tabs[0]);
  expect(screen.getByLabelText('P/A Sistólica').value).toBe('118');
  fireEvent.click(tabs[1]);
  expect(screen.getByLabelText('Hematología: resultado').value).toBe('Resultado sintético');
  fireEvent.keyDown(tabs[1], { key: 'End' });
  expect(screen.getByRole('tabpanel').id).toBe('control-panel-suplementacion');
  fireEvent.keyDown(tabs[3], { key: 'Home' });
  expect(screen.getByRole('tabpanel').id).toBe('control-panel-general');
});

test('revisión voluntaria 0/4 a 4/4, desmarcar y laboratorios sin resultados', async () => {
  mount(['controles.crear'], 'activo', false, 'new');
  await screen.findByText('0 de 4 secciones revisadas');
  const tabs = screen.getAllByRole('tab');
  for (const [index, t] of tabs.entries()) {
    fireEvent.click(t);
    expect(screen.getByText(`${index} de 4 secciones revisadas`)).toBeTruthy();
    expect(t.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Marcar sección como revisada' }));
    expect(screen.getByText(`${index + 1} de 4 secciones revisadas`)).toBeTruthy();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Volver a revisar sección' }));
  expect(screen.getByText('3 de 4 secciones revisadas')).toBeTruthy();
  fireEvent.click(tabs[1]);
  expect(screen.getByRole('button', { name: 'Volver a revisar sección' }).getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('[name="hematologia_resultado"]')).toBeNull();
});

test.each([
  ['General', 'P/A Sistólica', '120'],
  ['Laboratorios', 'Otros laboratorios', 'Sin resultados disponibles'],
  ['Orientaciones', 'Otras orientaciones', 'Orientación sintética'],
  ['Suplementación', 'Hallazgos', 'Observación sintética'],
])('modificar datos de %s invalida solo su revisión', async (tabName, field, value) => {
  mount(['controles.editar'], 'activo', true);
  await screen.findByText('0 de 4 secciones revisadas');
  for (const t of screen.getAllByRole('tab')) {
    fireEvent.click(t);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar sección como revisada' }));
  }
  fireEvent.click(screen.getByRole('tab', { name: tabName }));
  fireEvent.change(screen.getByLabelText(field), { target: { value } });
  expect(screen.getByText('3 de 4 secciones revisadas')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Marcar sección como revisada' })).toBeTruthy();
});

test('errores reales prevalecen sobre revisada y llevan a la sección afectada', async () => {
  mount(['controles.editar'], 'activo', true);
  await screen.findByText('0 de 4 secciones revisadas');
  fireEvent.click(screen.getByRole('tab', { name: 'Laboratorios' }));
  fireEvent.click(screen.getByRole('button', { name: 'Marcar sección como revisada' }));
  api.put.mockRejectedValueOnce({ response: { data: { message: 'Datos inválidos', details: [
    { campo: 'grupo_rh_resultado', mensaje: 'Grupo RH inválido' },
  ] } } });
  fireEvent.click(screen.getByRole('tab', { name: 'General' }));
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(screen.getByRole('tabpanel').id).toBe('control-panel-laboratorio'));
  expect(screen.getByText('0 de 4 secciones revisadas')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Laboratorios' }).querySelector('.needs-correction')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Volver a revisar sección' }).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Grupo y RH' }));
  fireEvent.change(document.querySelector('[name="grupo_rh_resultado"]'), { target: { value: 'O' } });
  expect(screen.getByRole('tab', { name: 'Laboratorios' }).querySelector('.needs-correction')).toBeNull();
  expect(screen.getByRole('button', { name: 'Marcar sección como revisada' }).disabled).toBe(false);
});

test('validación nativa marca General como requiere corrección', async () => {
  mount(['controles.crear'], 'activo', false, 'new');
  await screen.findByText('0 de 4 secciones revisadas');
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '9999-12-31' } });
  fireEvent.invalid(screen.getByLabelText('Fecha'));
  expect(screen.getByRole('tab', { name: 'General' }).querySelector('.needs-correction')).toBeTruthy();
});

test('edición histórica inicia sin revisiones y omite narrativas antiguas del PUT aunque no revise', async () => {
  mount(['controles.editar'], 'activo', true);
  await screen.findByText('0 de 4 secciones revisadas');
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('impresion_clinica');
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('tratamiento');
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('reviewedSections');
});

test.each(['programada', 'cancelada', 'reprogramada'])('cita estructurada %s permanece de solo lectura y fuera del PUT', async estado => {
  mount(['controles.editar'], 'activo', true, 'detail', { control: {
    cita_siguiente: '2026-02-01', cita_estructurada: { id: 9, estado, fecha_programada: '2026-02-15' },
  } });
  await screen.findByRole('button', { name: /Guardar cambios/ });
  const appointment = screen.getByLabelText('Cita siguiente');
  expect(appointment.value).toBe('2026-02-15');
  expect(appointment.readOnly).toBe(true);
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('cita_siguiente');
});

test('alta permite guardar sin revisión y conserva cita_siguiente en POST', async () => {
  mount(['controles.crear'], 'activo', false, 'new');
  await screen.findByText('0 de 4 secciones revisadas');
  fireEvent.change(screen.getByLabelText('Cita siguiente'), { target: { value: '2026-12-15' } });
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(api.post.mock.calls[0][1].cita_siguiente).toBe('2026-12-15');
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('impresion_clinica');
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('tratamiento');
});

test.each(['activo', 'cerrado', 'puerperio'])('historial %s solo ofrece Editar con consulta y permiso en activo', async state => {
  mount(['controles.editar'], state, false, 'timeline');
  expect(Boolean(screen.queryByRole('button', { name: 'Editar' }))).toBe(state === 'activo');
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  await screen.findByText('Consulta de solo lectura');
  expect(screen.queryByText(/de 4 secciones revisadas/)).toBeNull();
});

test.each([
  [[], {}],
  [['controles.editar'], { puedeConsultar: false }],
  [['controles.editar'], { embarazoId: null }],
  [['controles.editar'], { isReadOnly: true }],
])('historial oculta Editar con restricciones %j %j', (permissions, timeline) => {
  mount(permissions, 'activo', false, 'timeline', { timeline });
  expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
});

test('regreso sticky conserva embarazo y pestaña del expediente', async () => {
  mount(['controles.editar'], 'activo', true);
  await screen.findByText('0 de 4 secciones revisadas');
  const sticky = document.querySelector('.control-sticky-navigation');
  fireEvent.click(within(sticky).getByRole('button', { name: 'Volver al expediente' }));
  expect(screen.getByTestId('location').textContent).toBe('/pacientes/1');
});
