// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatbotScreenProvider } from '../src/context/ChatbotScreenContext.jsx';
import { ToastContext } from '../src/context/ToastContext.js';
import api from '../src/api/axios.js';
import ExpedientePaciente from '../src/pages/ExpedientePaciente.jsx';

const auth = vi.hoisted(() => ({ usuario: null }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => auth }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test.each([[], ['controles.crear'], ['controles.editar'], ['controles.crear', 'controles.editar']])(
  'acciones del expediente respetan permisos independientes: %j', async (...permissions) => {
    // test.each spreads array rows into arguments, including the empty row.
    auth.usuario = { id: 1, rol: 'medico', permisos: ['pacientes.ver', ...permissions] };
    const pregnancy = { id: 2, estado: 'activo', fur: '2026-01-01', fpp: '2026-10-08' };
    vi.spyOn(api, 'get').mockResolvedValue({ data: {
      paciente: { id: 1, nombres: 'Sintética', apellidos: 'Prueba', version: 1 },
      embarazo_actual: pregnancy, embarazo_seleccionado: pregnancy, embarazos: [pregnancy],
    } });
    render(<ToastContext.Provider value={vi.fn()}><MemoryRouter initialEntries={['/pacientes/1']}>
      <Routes><Route path="/pacientes/:id" element={<ChatbotScreenProvider><ExpedientePaciente /></ChatbotScreenProvider>} /></Routes>
    </MemoryRouter></ToastContext.Provider>);
    await screen.findByRole('heading', { name: /Sintética Prueba/ });
    for (const [tab, action, allowed] of [
      ['Riesgo obstétrico', 'Registrar ficha de riesgo', permissions.includes('controles.crear')],
      [/Morbilidad/, 'Registrar morbilidad', permissions.includes('controles.crear')],
      ['Plan de parto', 'Registrar plan de parto', permissions.includes('controles.crear') && permissions.includes('controles.editar')],
      [/Puerperio/, 'Registrar puerperio', permissions.includes('controles.crear') && permissions.includes('controles.editar')],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      expect(screen.queryAllByRole('button', { name: action }).length > 0).toBe(allowed);
    }
  },
);
