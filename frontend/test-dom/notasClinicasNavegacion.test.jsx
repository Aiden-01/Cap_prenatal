// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NotasClinicas from '../src/pages/NotasClinicas';
import api from '../src/api/axios';
const auth = vi.hoisted(() => ({ usuario: { id: 2, permisos: ['pacientes.ver', 'notas_evolucion.ver', 'notas_evolucion.registrar'] } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const nota = { id: 7, tipo: 'nota_evolucion', version: 1, estado: 'captura_finalizada', es_principal: true,
  contenido: 'Histórica sintética ñ', responsable_snapshot: { nombre_completo: 'Responsable histórico' } };
function mount(entry) {
  return render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/pacientes/:id/notas" element={<NotasClinicas />} /></Routes></MemoryRouter>);
}
test('desde seguimiento recupera principal de página posterior y nunca crea al navegar', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url.endsWith('/expediente')) return { data: { paciente: { nombres: 'Sintética' }, embarazo_seleccionado: { estado: 'activo' } } };
    if (url.endsWith('/7')) return { data: nota };
    if (config.params.tipo) return { data: { data: config.params.pagina === 1 ? [{ id: 8, es_principal: false }] : [nota], total: 51, limite: 50 } };
    return { data: { data: [nota], total: 1, limite: 20 } };
  });
  vi.spyOn(api, 'post');
  mount('/pacientes/1/notas?embarazo_id=2&control_id=3&tipo=nota_evolucion');
  await screen.findByRole('textbox', { name: 'Narrativa clínica' });
  expect(screen.getByRole('textbox', { name: 'Narrativa clínica' }).value).toBe(nota.contenido);
  expect(screen.getByRole('textbox', { name: 'Narrativa clínica' }).matches(':disabled')).toBe(true);
  expect(api.get).toHaveBeenCalledWith('/pacientes/1/notas-clinicas', expect.objectContaining({ params: expect.objectContaining({ pagina: 2, tipo: 'nota_evolucion' }) }));
  expect(api.post).not.toHaveBeenCalled();
});
test('historial sin embarazo permite nota independiente y filtra botones por permiso explícito', async () => {
  vi.spyOn(api, 'get').mockImplementation(async url => ({ data: url.endsWith('/expediente') ? { paciente: { nombres: 'Sintética', no_expediente: 'SYN' } }
    : { data: [], total: 0, limite: 20 } }));
  mount('/pacientes/1/notas');
  await screen.findByText('Aún no hay notas clínicas');
  const create = await screen.findByRole('button', { name: 'Nueva nota' });
  expect(screen.queryByRole('button', { name: /Nueva nota de evolución de enfermería/ })).toBeNull();
  fireEvent.click(create);
  fireEvent.change(screen.getByLabelText('Tipo de nota'), { target: { value: 'nota_evolucion' } });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir editor' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Narrativa clínica' })).toBeTruthy());
  expect(screen.getByText('Sin control asociado')).toBeTruthy();
});
test('fallo de contexto permanece visible aunque el historial cargue; reintentar recupera expediente', async () => {
  let failures = 1;
  vi.spyOn(api, 'get').mockImplementation(async url => {
    if (url.endsWith('/expediente')) {
      if (failures-- > 0) throw new Error('Contexto no disponible');
      return { data: { paciente: { nombres: 'Sintética' } } };
    }
    return { data: { data: [], total: 0, limite: 20 } };
  });
  mount('/pacientes/1/notas');
  await screen.findByText(/Contexto no disponible/);
  expect(screen.queryByRole('button', { name: 'Nueva nota' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByRole('button', { name: 'Nueva nota' });
  expect(screen.queryByText(/Contexto no disponible/)).toBeNull();
});
