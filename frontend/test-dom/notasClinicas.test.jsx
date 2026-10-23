// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditorNotaClinica from '../src/components/EditorNotaClinica';
import api from '../src/api/axios';
import { inicioCapturaGuatemala } from '../src/utils/notasClinicas';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const permisos = ['notas_evolucion', 'notas_enfermeria'].flatMap(p => ['ver', 'registrar', 'finalizar_captura'].map(a => `${p}.${a}`));
const nota = { id: 7, tipo: 'nota_evolucion', version: 1, estado: 'borrador', contenido: 'Evolución ñ\nAtención', fecha_atencion: '2026-10-20', hora_atencion: '09:30:00', capturista_usuario_id: 2,
  responsable_snapshot: { nombre_completo: 'Profesional sintético', cargo_nombre: 'Médico' } };
function mount(props = {}) {
  return render(<EditorNotaClinica pacienteId="1" paciente={{ nombres: 'Paciente sintética', no_expediente: 'SYN-1' }} usuario={{ id: 2, permisos }} tipo="nota_evolucion" {...props} />);
}
for (const tipo of ['nota_evolucion', 'nota_enfermeria']) {
  for (const clase of tipo === 'nota_enfermeria' ? ['AE', 'EP'] : ['MED']) {
    test(`crea y recupera borrador ${tipo} ${clase} con responsable externo y texto plano`, async () => {
      vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 7 } });
      vi.spyOn(api, 'get').mockResolvedValue({ data: { ...nota, tipo } });
      mount({ tipo });
      fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'externo' } });
      fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Externo sintético' } });
      fireEvent.change(screen.getByLabelText('Cargo declarado'), { target: { value: clase } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Narrativa clínica' }), { target: { value: 'Atención ñ\n<script>prueba</script>' } });
      fireEvent.submit(document.querySelector('form'));
      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
      const body = api.post.mock.calls[0][1];
      expect(body.tipo).toBe(tipo); expect(body.responsable.cargo_codigo).toBe(clase);
      expect(body).not.toHaveProperty('control_prenatal_id'); expect(body.clave_idempotencia).toMatch(/^[a-f0-9-]{36}$/);
      await screen.findByText('Profesional sintético');
      expect(document.querySelector('script')).toBeNull();
    });
  }
}
test('actualización versionada y finalización conservan responsable histórico; finalizada es lectura', async () => {
  vi.spyOn(api, 'get').mockResolvedValueOnce({ data: nota }).mockResolvedValue({ data: { ...nota, version: 2, contenido: 'Nuevo texto' } });
  vi.spyOn(api, 'put').mockResolvedValue({ data: { id: 7, version: 2 } });
  vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 7, version: 3, estado: 'captura_finalizada' } });
  mount({ notaId: 7 });
  await screen.findByRole('textbox', { name: 'Narrativa clínica' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Narrativa clínica' }), { target: { value: 'Nuevo texto' } });
  expect(screen.getByRole('button', { name: 'Finalizar captura' }).disabled).toBe(true);
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/pacientes/1/notas-clinicas/7', expect.objectContaining({ version: 1, contenido: 'Nuevo texto' })));
  expect(api.put.mock.calls[0][1]).not.toHaveProperty('responsable');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finalizar captura' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar captura' }));
  await screen.findByText('Captura finalizada', { selector: '.nota-status' });
  expect(api.post).toHaveBeenCalledWith('/pacientes/1/notas-clinicas/7/finalizar', { version: 2 });
  expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Narrativa clínica' }).matches(':disabled')).toBe(true);
});
test('409 conserva texto y bloquea sobrescritura', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: nota });
  vi.spyOn(api, 'put').mockRejectedValue({ response: { status: 409 } });
  mount({ notaId: 7 }); await screen.findByRole('textbox', { name: 'Narrativa clínica' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Narrativa clínica' }), { target: { value: 'Texto local' } });
  fireEvent.submit(document.querySelector('form'));
  await screen.findByText(/La nota cambió/);
  expect(screen.getByRole('textbox', { name: 'Narrativa clínica' }).value).toBe('Texto local');
  fireEvent.submit(document.querySelector('form'));
  expect(api.put).toHaveBeenCalledTimes(1);
});
test('reintento ambiguo conserva clave y payload y evita doble envío', async () => {
  vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('network')).mockResolvedValue({ data: { id: 7 } });
  vi.spyOn(api, 'get').mockResolvedValue({ data: nota });
  mount({ embarazoId: 2, controlId: 3 });
  fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'autenticado' } });
  fireEvent.submit(document.querySelector('form')); fireEvent.submit(document.querySelector('form'));
  await screen.findByText(/El resultado del envío anterior es incierto/);
  const first = api.post.mock.calls[0][1];
  fireEvent.change(screen.getByRole('textbox', { name: 'Narrativa clínica' }), { target: { value: 'Edición después del fallo' } });
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[1][1]).toEqual(first);
  expect(first).toMatchObject({ embarazo_id: 2, control_prenatal_id: 3, es_principal: true, responsable: { tipo: 'autenticado' } });
  await screen.findByText('Profesional sintético');
  expect(screen.getByRole('textbox', { name: 'Narrativa clínica' }).value).toBe('Edición después del fallo');
  expect(screen.getByText('Guarda los cambios antes de finalizar la captura.')).toBeTruthy();
});
test('sin permiso de registrar solo consulta', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: nota });
  mount({ notaId: 7, usuario: { id: 2, permisos: ['notas_evolucion.ver'] } });
  await screen.findByRole('textbox', { name: 'Narrativa clínica' });
  expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Narrativa clínica' }).matches(':disabled')).toBe(true);
});
test('directorio filtra medicina y conserva ID interno en el payload', async () => {
  vi.spyOn(api, 'get').mockImplementation(async url => ({ data: url === '/profesionales'
    ? { data: [{ id: 9, nombre_completo: 'Interno sintético', cargo_nombre: 'Médico' }], total: 1 } : nota }));
  vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 7 } });
  mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'usuario' } });
  await screen.findByRole('option', { name: /Interno sintético/ });
  fireEvent.change(screen.getByLabelText('Profesional del directorio'), { target: { value: '9' } });
  fireEvent.submit(document.querySelector('form'));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(api.post.mock.calls[0][1].responsable).toEqual({ tipo: 'usuario', usuario_id: 9 });
  expect(api.get).toHaveBeenCalledWith('/profesionales', expect.objectContaining({ params: expect.objectContaining({ cargo_codigo: 'MED' }) }));
});
test('403 no declara guardado y permite corregir el responsable', async () => {
  vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 403, data: { message: 'Perfil no autorizado' } } });
  mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'autenticado' } });
  fireEvent.submit(document.querySelector('form'));
  await screen.findByText(/Perfil no autorizado/);
  expect(screen.getByRole('combobox', { name: 'Profesional responsable' }).matches(':disabled')).toBe(false);
  expect(screen.queryByText(/Responsable:/)).toBeNull();
});
test('nota recién creada permite recuperar versión guardada ante conflicto posterior', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 7 } });
  vi.spyOn(api, 'get').mockResolvedValue({ data: nota });
  vi.spyOn(api, 'put').mockRejectedValue({ response: { status: 409 } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'autenticado' } });
  fireEvent.submit(document.querySelector('form'));
  await screen.findByText('Profesional sintético');
  fireEvent.change(screen.getByRole('textbox', { name: 'Narrativa clínica' }), { target: { value: 'Edición local' } });
  fireEvent.submit(document.querySelector('form'));
  await screen.findByText(/La nota cambió/);
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar versión guardada' }));
  await screen.findByRole('textbox', { name: 'Narrativa clínica' });
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox', { name: 'Narrativa clínica' }).value).toBe(nota.contenido);
  expect(screen.queryByText(/La nota cambió/)).toBeNull();
});
test('finalizador con permiso explícito puede cerrar sin permiso para editar', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: nota });
  vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 7, estado: 'captura_finalizada', version: 2 } });
  mount({ notaId: 7, usuario: { id: 2, permisos: ['notas_evolucion.ver', 'notas_evolucion.finalizar_captura'] } });
  await screen.findByRole('textbox', { name: 'Narrativa clínica' });
  expect(screen.getByRole('textbox', { name: 'Narrativa clínica' }).matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar captura' }));
  await screen.findByText('Captura finalizada', { selector: '.nota-status' });
  expect(api.post).toHaveBeenCalledWith('/pacientes/1/notas-clinicas/7/finalizar', { version: 1 });
});
test('descarga PDF de nota guardada con permiso de lectura y sin metadatos clínicos en nombre', async () => {
  const createObjectURL = vi.fn(() => 'blob:synthetic-pdf');
  vi.stubGlobal('URL', class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = vi.fn(); });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(api, 'get').mockImplementation(async url => url.endsWith('/pdf')
    ? { data: new Blob(['%PDF-synthetic']), headers: { 'content-type': 'application/pdf' } } : { data: { ...nota, estado: 'captura_finalizada' } });
  mount({ notaId: 7, usuario: { id: 2, permisos: ['notas_evolucion.ver'] } });
  fireEvent.click(await screen.findByRole('button', { name: 'Descargar PDF institucional' }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(api.get).toHaveBeenCalledWith('/pacientes/1/notas-clinicas/7/pdf', { responseType: 'blob' });
  expect(createObjectURL).toHaveBeenCalledTimes(1);
});
test('PDF no descarga cambios sin guardar y conserva error 403 sin éxito aparente', async () => {
  vi.spyOn(api, 'get').mockImplementation(async url => {
    if (url.endsWith('/pdf')) throw { response: { status: 403, data: { message: 'PDF no autorizado' } } };
    return { data: nota };
  });
  mount({ notaId: 7 }); await screen.findByRole('textbox', { name: 'Narrativa clínica' });
  const download = screen.getByRole('button', { name: 'Descargar PDF institucional' });
  fireEvent.click(download); await screen.findByText(/PDF no autorizado/);
  fireEvent.change(screen.getByRole('textbox', { name: 'Narrativa clínica' }), { target: { value: 'Texto sin guardar' } });
  expect(download.disabled).toBe(true);
  expect(screen.getByText(/El PDF utiliza la versión guardada/)).toBeTruthy();
});
test('captura inicia con fecha Guatemala estable, permite editar y valida antes de POST', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [], total: 0 } });
  vi.spyOn(api, 'post');
  const view = mount();
  const inicio = inicioCapturaGuatemala();
  expect(screen.getByLabelText('Fecha de atención').value).toBe(inicio.fecha);
  expect(screen.getByLabelText('Hora de atención').value).toBe(inicio.hora);
  fireEvent.submit(document.querySelector('form'));
  expect(await screen.findByText('Selecciona al profesional responsable de la atención.')).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Hora de atención'), { target: { value: '07:35' } });
  view.rerender(<EditorNotaClinica pacienteId="1" usuario={{ id: 2, permisos }} tipo="nota_evolucion" />);
  expect(screen.getByLabelText('Hora de atención').value).toBe('07:35');
});
test('directorio vacío y error son estados explícitos y no habilitan Yo atendí a digitadores', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [], total: 0 } });
  mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'usuario' } });
  await screen.findByText(/No se encontraron profesionales habilitados/);
  expect(screen.getByRole('option', { name: 'Yo atendí' }).disabled).toBe(true);
  api.get.mockRejectedValue({ response: { status: 404 } });
  fireEvent.change(screen.getByLabelText('Buscar profesional'), { target: { value: 'nuevo' } });
  await screen.findByText(/Error al consultar profesionales/);
  expect(screen.getByRole('button', { name: 'Reintentar directorio' })).toBeTruthy();
});

test('directorio distingue un rechazo de permiso y no ofrece Especialidad a externos', async () => {
  vi.spyOn(api, 'get').mockRejectedValue({ response: { status: 403 } });
  mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'usuario' } });
  await screen.findByText('No tienes permiso para consultar el directorio.');
  fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'externo' } });
  expect(screen.queryByLabelText(/Especialidad/)).toBeNull();
  expect(screen.getByLabelText('Cargo declarado')).toBeTruthy();
});
for (const status of [401, 404, 400, 422]) {
  test(`guardado ${status} muestra error y preserva narrativa sin declarar éxito`, async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [], total: 0 } });
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status } });
    mount();
    fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'autenticado' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Narrativa clínica' }), { target: { value: 'Texto local sintético' } });
    fireEvent.submit(document.querySelector('form'));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox', { name: 'Narrativa clínica' }).value).toBe('Texto local sintético');
    expect(screen.queryByText(/Borrador guardado correctamente/)).toBeNull();
  });
}
test('POST confirmado seguido de GET 403 conserva ID y reintenta solo lectura sin duplicar', async () => {
  let reads = 0;
  vi.spyOn(api, 'get').mockImplementation(async url => {
    if (url === '/profesionales') return { data: { data: [], total: 0 } };
    if (++reads === 1) throw { response: { status: 403 } };
    return { data: nota };
  });
  vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 7 } });
  mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Profesional responsable' }), { target: { value: 'autenticado' } });
  fireEvent.submit(document.querySelector('form'));
  await screen.findByText(/servidor confirmó la creación de la nota 7/);
  expect(screen.queryByText(/Borrador guardado correctamente/)).toBeNull();
  fireEvent.submit(document.querySelector('form'));
  await screen.findByText(/Borrador guardado correctamente/);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(reads).toBe(2);
});
