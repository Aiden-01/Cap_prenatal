// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import NuevoControl from '../src/pages/NuevoControl';
import SeguimientoNotasControl from '../src/pages/SeguimientoNotasControl';
import TimelineControles from '../src/components/TimelineControles';
import { ToastContext } from '../src/context/ToastContext';
import { ChatbotScreenProvider } from '../src/context/ChatbotScreenContext';
import api from '../src/api/axios';

const auth = vi.hoisted(() => ({ usuario: null }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
const toast = vi.fn();
const medical = ['notas_evolucion.ver', 'notas_evolucion.registrar'];
const nursing = ['notas_enfermeria.ver', 'notas_enfermeria.registrar'];
const control = { id: 3, numero_control: 1, fecha: '2026-10-20', edad_gestacional_semanas: 20,
  peso_kg: 60, fcf: 140, presentacion_fetal: 'cefálica', nombre_cargo_atiende: 'Médico textual sin confirmar' };
const row = (documentos = [], elegible = true) => ({ control_prenatal_id: 3, elegible, documentos });
const doc = (estado, tipo = 'nota_evolucion') => ({ tipo, estado, nota_id: estado === 'pendiente' ? null : 7,
  responsable_previsto: { nombre_completo: 'Profesional sintético' } });
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function mount({ entry = '/pacientes/1/controles/nuevo?embarazo_id=2', permisos = [...medical, ...nursing],
  estado = 'activo', seguimiento = [row()], reject = false, controls = [control], postData = { id: 3 } } = {}) {
  auth.usuario = { id: 1, rol: 'personal_salud', permisos: ['pacientes.ver', 'controles.crear', 'controles.editar', ...permisos] };
  vi.spyOn(api, 'get').mockImplementation(async url => {
    if (url.endsWith('/seguimiento-notas')) {
      if (reject) throw new Error('synthetic network failure');
      return { data: { data: seguimiento } };
    }
    return { data: url.endsWith('/expediente') ? {
      paciente: { id: 1, nombres: 'Paciente sintética', apellidos: 'Prueba' }, is_read_only: estado === 'cerrado',
      embarazo_seleccionado: { id: 2, estado, fur: '2026-01-01' },
    } : url.endsWith('/controles') ? [] : control };
  });
  vi.spyOn(api, 'post').mockResolvedValue({ data: postData });
  vi.spyOn(api, 'put').mockResolvedValue({ data: control });
  return render(<ToastContext.Provider value={toast}><ChatbotScreenProvider><MemoryRouter initialEntries={[entry]}>
    <Location /><Routes>
      <Route path="/pacientes/:id/controles/nuevo" element={<NuevoControl />} />
      <Route path="/pacientes/:id/controles/:controlId/editar" element={<NuevoControl />} />
      <Route path="/pacientes/:id/controles/:controlId/seguimiento-notas" element={<SeguimientoNotasControl />} />
      <Route path="/pacientes/:id" element={<TimelineControles pacienteId={1} embarazoId={2} controles={controls}
        usuario={auth.usuario} puedeConsultar puedeEditar={auth.usuario.permisos.includes('controles.editar')}
        estadoEmbarazo={estado} isReadOnly={estado === 'cerrado'} />} />
    </Routes>
  </MemoryRouter></ChatbotScreenProvider></ToastContext.Provider>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); toast.mockClear(); });

test('revisión UX voluntaria conserva confirmación, ID real y payload independiente de notas', async () => {
  mount();
  await screen.findByRole('button', { name: /Guardar control/ });
  expect(screen.getAllByRole('tab').map(tab => tab.textContent.replace('Por revisar', '')))
    .toEqual(['General', 'Laboratorios', 'Orientaciones', 'Suplementación']);
  for (const name of ['General', 'Laboratorios', 'Orientaciones', 'Suplementación']) {
    fireEvent.click(screen.getByRole('tab', { name }));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar sección como revisada' }));
  }
  expect(screen.getByText('4 de 4 secciones revisadas')).toBeTruthy();
  fireEvent.submit(document.querySelector('form'));
  await screen.findByRole('heading', { name: 'Control registrado exitosamente' });
  const payload = api.post.mock.calls[0][1];
  for (const field of ['impresion_clinica', 'tratamiento', 'reviewedSections', 'notas']) {
    expect(payload).not.toHaveProperty(field);
  }
  // Main previously navigated after 800 ms; creation must retain its confirmation.
  await new Promise(resolve => setTimeout(resolve, 900));
  expect(screen.getByTestId('location').textContent).toBe('/pacientes/1/controles/nuevo?embarazo_id=2');
  fireEvent.click(screen.getByRole('button', { name: 'Consultar seguimiento de notas' }));
  await screen.findByRole('heading', { name: 'Seguimiento documental del control' });
  expect(api.post).toHaveBeenCalledTimes(1);
});

for (const estado of ['activo', 'cerrado', 'puerperio']) {
  test(`historial con nota pendiente conserva acceso a control y permiso de edición (${estado})`, async () => {
    mount({ entry: '/pacientes/1?embarazo_id=2&tab=controles', estado, seguimiento: [row([doc('pendiente')])] });
    await screen.findByText(/Nota pendiente/);
    expect(screen.getByText('Completo', { exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir', exact: true }).disabled).toBe(false);
    expect(Boolean(screen.queryByRole('button', { name: 'Editar', exact: true }))).toBe(estado === 'activo');
    if (estado === 'activo') {
      fireEvent.click(screen.getByRole('button', { name: 'Editar', exact: true }));
      await screen.findByRole('button', { name: /Guardar cambios/ });
      expect(screen.getByTestId('location').textContent).toBe('/pacientes/1/controles/3/editar?embarazo_id=2');
    }
    expect(api.post).not.toHaveBeenCalled();
  });
}

for (const width of [390, 1366]) {
  test(`control nuevo: confirma ID, evita doble envío y vuelve sin nota (${width}px)`, async () => {
    window.innerWidth = width;
    mount();
    await screen.findByRole('button', { name: /Guardar control/ });
    const form = document.querySelector('form');
    fireEvent.submit(form); fireEvent.submit(form);
    const heading = await screen.findByRole('heading', { name: 'Control registrado exitosamente' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText('Control 3 guardado.')).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe('/pacientes/1/controles');
    expect(screen.queryByRole('button', { name: /Guardar control/ })).toBeNull();
    expect(api.get.mock.calls.some(([url]) => url.endsWith('/seguimiento-notas'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al expediente sin completar una nota' }));
    await screen.findByText('Tipo de nota por definir para los documentos que puedes consultar.');
    expect(screen.getByTestId('location').textContent).toContain('/pacientes/1?embarazo_id=2&tab=controles');
    expect(api.post).toHaveBeenCalledTimes(1);
  });
}
test('ID real lleva a pantalla existente; fallo de seguimiento conserva resultado guardado y permite reintento', async () => {
  mount({ reject: true });
  await screen.findByRole('button', { name: /Guardar control/ });
  fireEvent.submit(document.querySelector('form'));
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar seguimiento de notas' }));
  expect(await screen.findByText(/No se pudo consultar el seguimiento documental/)).toBeTruthy();
  expect(screen.getByTestId('location').textContent).toBe('/pacientes/1/controles/3/seguimiento-notas?embarazo_id=2');
  expect(api.post).toHaveBeenCalledTimes(1);
  api.get.mockResolvedValue({ data: { data: [row()] } });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Tipo de nota por definir para los documentos que puedes consultar.')).toBeTruthy();
});
test('respuesta antigua sin ID no ofrece navegación inválida ni un segundo POST', async () => {
  mount({ postData: {} });
  await screen.findByRole('button', { name: /Guardar control/ }); fireEvent.submit(document.querySelector('form'));
  await screen.findByRole('heading', { name: 'Control registrado exitosamente' });
  expect(screen.queryByRole('button', { name: 'Consultar seguimiento de notas' })).toBeNull();
  expect(screen.getByText(/Recupera su identificación/)).toBeTruthy();
  expect(api.post).toHaveBeenCalledTimes(1);
});
test('editar mantiene flujo previo y no abre confirmación de control nuevo', async () => {
  mount({ entry: '/pacientes/1/controles/3/editar?embarazo_id=2' });
  await screen.findByRole('button', { name: /Guardar cambios/ }); fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('heading', { name: 'Control registrado exitosamente' })).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});
for (const estado of ['pendiente', 'borrador', 'captura_finalizada']) {
  test(`timeline deriva ${estado}, conserva Completo y consulta por lote`, async () => {
    mount({ entry: '/pacientes/1?embarazo_id=2&tab=controles', seguimiento: [row([doc(estado)])] });
    const label = { pendiente: 'Nota pendiente', borrador: 'Nota en borrador', captura_finalizada: 'Captura finalizada' }[estado];
    await screen.findByText(label, { exact: false });
    expect(screen.getByText('Completo', { exact: false })).toBeTruthy();
    expect(api.get.mock.calls.filter(([url]) => url.endsWith('/seguimiento-notas'))).toHaveLength(1);
    expect(api.get.mock.calls[0][1].params.controles_ids).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Seguimiento de notas del control 1' }));
    expect(await screen.findByRole('heading', { name: 'Seguimiento documental del control' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Editar nota|Completar nota|PDF/ })).toBeNull();
  });
}
test('histórico sin nota no muestra pendientes ni acceso engañoso', async () => {
  mount({ entry: '/pacientes/1', seguimiento: [row([], false)] });
  expect(await screen.findByText('Control histórico: sin seguimiento documental automático.')).toBeTruthy();
  expect(screen.queryByText('Nota pendiente')).toBeNull();
  expect(screen.queryByRole('button', { name: /Seguimiento de notas del control/ })).toBeNull();
});
test('sin permisos documentales no consulta ni expone estados', async () => {
  mount({ entry: '/pacientes/1', permisos: [] });
  expect(screen.getByText('Completo', { exact: false })).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Seguimiento documental')).toBeNull();
});
test('403 no se representa como ausencia o finalización; error y reintento no bloquean control', async () => {
  mount({ entry: '/pacientes/1', reject: true });
  expect(await screen.findByText('No se pudo consultar el seguimiento documental.')).toBeTruthy();
  expect(screen.queryByText(/Sin notas|Captura finalizada/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Abrir', exact: true }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Reintentar seguimiento' })).toBeTruthy();
});
test('solo lectura médica no permite confirmar ni revela enfermería', async () => {
  mount({ entry: '/pacientes/1/controles/3/seguimiento-notas?embarazo_id=2', permisos: ['notas_evolucion.ver'], seguimiento: [row([doc('pendiente')])] });
  await screen.findByText(/Profesional sintético/);
  expect(screen.queryByRole('button', { name: 'Confirmar seguimiento' })).toBeNull();
  expect(screen.queryByText(/evolución de enfermería/)).toBeNull();
});
test('confirmación externa explícita no infiere del campo libre ni del rol y no crea notas', async () => {
  mount({ entry: '/pacientes/1/controles/3/seguimiento-notas?embarazo_id=2', permisos: medical });
  const select = await screen.findByLabelText('Profesional que atendió');
  expect(select.value).toBe('');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(select, { target: { value: 'externo' } });
  fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Médico externo sintético' } });
  fireEvent.change(screen.getByLabelText('Cargo declarado'), { target: { value: 'Médico declarado' } });
  const form = select.closest('form'); fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(api.post.mock.calls[0]).toEqual(['/pacientes/1/controles/3/seguimiento-notas', {
    embarazo_id: 2, version: 1, tipo: 'nota_evolucion', responsable: { tipo: 'externo', nombre_completo: 'Médico externo sintético',
      cargo: 'Médico declarado', especialidad: null, clasificacion_profesional: 'medico' },
  }]);
});
test('embarazo cerrado permite consultar sin formulario de confirmación', async () => {
  mount({ entry: '/pacientes/1/controles/3/seguimiento-notas?embarazo_id=2', estado: 'cerrado' });
  await screen.findByText(/Tipo de nota por definir/);
  expect(screen.queryByRole('button', { name: 'Confirmar seguimiento' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Volver al expediente sin completar una nota' })).toBeTruthy();
});
test('varios controles se consultan una vez y presentan estados independientes', async () => {
  mount({ entry: '/pacientes/1', controls: [control, { ...control, id: 4, numero_control: 2 }],
    seguimiento: [row([doc('pendiente')]), { ...row([doc('borrador', 'nota_enfermeria')]), control_prenatal_id: 4 }] });
  await screen.findByText(/Nota pendiente/);
  expect(screen.getByText(/Nota en borrador/)).toBeTruthy();
  const requests = api.get.mock.calls.filter(([url]) => url.endsWith('/seguimiento-notas'));
  expect(requests).toHaveLength(1); expect(requests[0][1].params.controles_ids).toBe('3,4');
  expect(within(screen.getAllByLabelText('Seguimiento documental')[0]).queryByText(/Captura finalizada/)).toBeNull();
});
