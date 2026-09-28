// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Usuarios from '../src/pages/Usuarios';
import api from '../src/api/axios';

const auth = vi.hoisted(() => ({ usuario: { id: 1, rol: 'director' }, refreshUsuario: vi.fn() }));
vi.mock('../src/api/axios', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../src/context/ToastContext', () => ({ useGlobalToast: () => vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); auth.usuario = { id: 1, rol: 'director' }; });
afterEach(cleanup);

function install(rol, actuales = []) {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/usuarios'
    ? [{ id: 2, rol, activo: true, nombre_completo: 'Objetivo', username: 'objetivo' }]
    : url === '/permisos'
      ? [{ codigo: 'auditoria.ver', descripcion: 'Consultar historial', categoria: 'auditoria' },
        { codigo: 'pacientes.ver', descripcion: 'Ver pacientes', categoria: 'pacientes' }]
      : actuales.map((codigo) => ({ codigo })) }));
  api.put.mockResolvedValue({ data: [] });
}

test.each(['admin', 'personal_salud', 'director'])('auditoria visible únicamente para admin: %s', async (rol) => {
  install(rol);
  render(<Usuarios />);
  fireEvent.click(await screen.findByTitle('Gestionar permisos'));
  await screen.findByText('Ver pacientes');
  expect(Boolean(screen.queryByText('Ver historial de actividad'))).toBe(rol === 'admin');
});

test.each([false, true])('director concede o retira auditoria a admin (asignado: %s)', async (asignado) => {
  install('admin', asignado ? ['auditoria.ver'] : []);
  render(<Usuarios />);
  fireEvent.click(await screen.findByTitle('Gestionar permisos'));
  const label = await screen.findByText('Ver historial de actividad');
  const checkbox = label.closest('label').querySelector('input');
  expect(checkbox.checked).toBe(asignado);
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/usuarios/2/permisos', { permisos: asignado ? [] : ['auditoria.ver'] }));
});

test('admin no gestiona permisos', async () => {
  auth.usuario = { id: 1, rol: 'admin' };
  install('admin');
  render(<Usuarios />);
  await screen.findByText('Objetivo');
  expect(screen.queryByTitle('Gestionar permisos')).toBeNull();
});

test('el catálogo conserva los once códigos y guarda los códigos internos', async () => {
  const permisos = [
    ['auditoria.ver', 'Ver historial de actividad', 'Consultar el historial de actividad del sistema.'],
    ['controles.crear', 'Registrar controles prenatales', 'Registrar un nuevo control prenatal.'],
    ['controles.editar', 'Editar controles prenatales', 'Actualizar controles prenatales registrados.'],
    ['controles.ver_vih', 'Ver resultados de VIH', 'Consultar resultados de VIH registrados en los controles prenatales.'],
    ['mapa_riesgo.ver', 'Ver mapa de riesgo', 'Consultar el mapa de riesgo obstétrico.'],
    ['pacientes.crear', 'Registrar pacientes', 'Abrir un expediente para una nueva paciente.'],
    ['pacientes.editar', 'Editar pacientes', 'Actualizar datos generales de las pacientes.'],
    ['pacientes.eliminar', 'Eliminar pacientes', 'Eliminar expedientes de pacientes.'],
    ['pacientes.ver', 'Ver pacientes', 'Consultar expedientes de pacientes.'],
    ['reportes.exportar', 'Exportar reportes', 'Descargar reportes en Excel o PDF.'],
    ['reportes.ver', 'Ver reportes', 'Consultar reportes de atención y seguimiento.'],
  ];
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/usuarios'
    ? [{ id: 2, rol: 'admin', activo: true, nombre_completo: 'Objetivo', username: 'objetivo' }]
    : url === '/permisos'
      ? permisos.map(([codigo]) => ({ codigo, descripcion: 'Texto de base de datos', categoria: 'categoria_db' }))
      : [] }));
  api.put.mockResolvedValue({ data: [] });

  render(<Usuarios />);
  fireEvent.click(await screen.findByTitle('Gestionar permisos'));
  await screen.findByText('Registrar pacientes');
  expect(screen.getAllByRole('checkbox')).toHaveLength(permisos.length);
  for (const [codigo, nombre, descripcion] of permisos) {
    const fila = screen.getByText(nombre).closest('label');
    expect(fila.textContent).toContain(codigo);
    expect(fila.textContent).toContain(descripcion);
  }
  expect(screen.getByRole('heading', { name: 'Historial de actividad' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Resultados de VIH' })).toBeTruthy();

  fireEvent.click(screen.getByText('Registrar pacientes').closest('label').querySelector('input'));
  fireEvent.click(screen.getByText('Ver historial de actividad').closest('label').querySelector('input'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/usuarios/2/permisos', {
    permisos: ['pacientes.crear', 'auditoria.ver'],
  }));
});
