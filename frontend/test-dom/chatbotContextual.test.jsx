// @vitest-environment jsdom
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatbotScreenProvider } from '../src/context/ChatbotScreenContext.jsx';
import { ToastContext } from '../src/context/ToastContext.js';
import ChatbotWidget from '../src/components/ChatbotWidget.jsx';
import VacunaForm from '../src/pages/VacunaForm.jsx';
import NuevoControl from '../src/pages/NuevoControl.jsx';
import FichaRiesgo from '../src/pages/FichaRiesgo.jsx';
import PlanPartoForm from '../src/pages/PlanPartoForm.jsx';
import api from '../src/api/axios.js';
const user = { id: 999, nombre_completo: 'USUARIO_CANARIO', rol: 'director', permisos: ['pacientes.ver', 'controles.crear', 'controles.editar'] };
const require = createRequire(import.meta.url);
const { answerQuestion } = require('../../backend/src/services/chatbotService');
const { generateQuickActions } = require('../../backend/src/services/chatbotQuickActionsService');
const { chatbotMessageSchema } = require('../../backend/src/validations/chatbot.schemas');

const record = {
  paciente: { id: 777, nombres: 'NOMBRE_CANARIO', apellidos: 'APELLIDO_CANARIO', cui: 'CUI_CANARIO', no_expediente: 'EXP_CANARIO', fecha_nacimiento: '1990-01-01' },
  embarazo_seleccionado: { id: 888, estado: 'activo', fur: '2026-01-01' },
  controles: [], vacunas: [], ficha_riesgo: null, plan_parto: null, is_read_only: false,
};
const toast = () => {};

function mount(path = '/pacientes/777/vacunas/nuevo?embarazo_id=888') {
  return render(<MemoryRouter initialEntries={[path]}><ToastContext.Provider value={toast}><ChatbotScreenProvider>
    <Link to='/pacientes/777/riesgo?embarazo_id=888'>Riesgo local</Link>
    <Link to='/pacientes/777/vacunas/nuevo?embarazo_id=889'>Otro embarazo local</Link>
    <Routes>
      <Route path='/pacientes/:id/vacunas/nuevo' element={<VacunaForm />} />
      <Route path='/pacientes/:id/controles/nuevo' element={<NuevoControl />} />
      <Route path='/pacientes/:id/riesgo' element={<FichaRiesgo />} />
      <Route path='/pacientes/:id/plan-parto' element={<PlanPartoForm />} />
      <Route path='*' element={<div>Pantalla desconocida local</div>} />
    </Routes><ChatbotWidget />
  </ChatbotScreenProvider></ToastContext.Provider></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('usuario', JSON.stringify(user));
  vi.stubGlobal('BroadcastChannel', undefined);
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({ data: url === '/auth/me' ? user : url.endsWith('/expediente') ? record : [] }));
  vi.spyOn(api, 'post').mockImplementation(async (url, body) => {
    assert.equal(url, '/chatbot/mensaje', 'Solo mensajes, no escritura clínica');
    const parsed = chatbotMessageSchema.parse(body);
    const result = answerQuestion(parsed.mensaje, parsed.context, parsed.conversation);
    return { data: { ...result, quickActions: generateQuickActions({ intent: result.intent, conversation: result.conversation, context: parsed.context }) } };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

async function ask(question = '¿Qué debo colocar acá?') {
  if (!document.querySelector('.chatbot-panel')) fireEvent.click(screen.getByTitle('Abrir asistente'));
  const previous = api.post.mock.calls.length;
  fireEvent.change(screen.getByLabelText('Mensaje para el asistente'), { target: { value: question } });
  fireEvent.click(screen.getByTitle('Enviar'));
  await waitFor(() => assert.equal(api.post.mock.calls.length, previous + 1), { timeout: 3000 });
  await waitFor(() => assert.ok(!screen.queryByText('Lia está escribiendo...')), { timeout: 3000 });
  return api.post.mock.calls.at(-1)[1];
}

async function tdapRadio() {
  let tdap;
  await waitFor(() => {
    tdap = [...document.querySelectorAll('[role="radio"][data-chatbot-field="vacuna_tipo_vacuna"]')].find(node => node.textContent.includes('Tdap'));
    assert.ok(tdap);
  });
  return tdap;
}

test('widget real en Tdap publica solo enum, conserva foco y evita PHI en el payload', async () => {
  const { container } = mount();
  const tdap = await tdapRadio();
  tdap.focus(); fireEvent.click(tdap);
  const payload = await ask();
  assert.equal(payload.context.vaccineType, 'tdap');
  assert.equal(payload.context.focusedField, 'vacuna_tipo_vacuna');
  assert.equal(payload.context.route, '/pacientes/:id/vacunas/nuevo');
  const serialized = JSON.stringify(payload);
  for (const canary of ['NOMBRE_CANARIO', 'APELLIDO_CANARIO', 'CUI_CANARIO', 'EXP_CANARIO', 'USUARIO_CANARIO', '1990-01-01', '2026-01-01', '777', '888']) assert.equal(serialized.includes(canary), false, canary);
  assert.match(container.querySelector('.chatbot-message.is-bot:last-of-type').textContent, /registro de Tdap.*Dosis única del embarazo/);
  const date = container.querySelector('#vaccine-application-date');
  date.focus();
  const datePayload = await ask('¿Qué pongo aquí?');
  assert.equal(datePayload.context.focusedField, 'vacuna_fecha_dosis');
  assert.match(container.querySelector('.chatbot-message.is-bot:last-of-type').textContent, /Fecha/);
});

test('navegar descarta vacuna/foco anterior y cambiar embarazo no conserva Tdap', async () => {
  mount();
  fireEvent.click(await tdapRadio());
  await ask();
  fireEvent.click(screen.getByText('Riesgo local'));
  const risk = await ask();
  assert.equal('vaccineType' in risk.context, false);
  assert.equal(risk.context.focusedField, null);
  assert.equal(risk.context.form, 'ficha_riesgo');
  fireEvent.click(screen.getByText('Otro embarazo local'));
  await tdapRadio();
  const other = await ask();
  assert.equal(other.context.vaccineType, null);
  assert.equal(other.context.focusedField, null);
});

for (const [path, expected, form] of [
  ['/pacientes/777/controles/nuevo?embarazo_id=888', /Control prenatal/, 'nuevo_control'],
  ['/pacientes/777/riesgo?embarazo_id=888', /Ficha de riesgo/, 'ficha_riesgo'],
  ['/pacientes/777/plan-parto?embarazo_id=888', /Plan de parto/, 'plan_parto'],
  ['/desconocida', /Dime el nombre/, null],
]) {
  test(`misma pregunta, contexto real de ${path}`, async () => {
    const { container } = mount(path);
    const payload = await ask();
    assert.equal(payload.context.form, form);
    assert.equal('vaccineType' in payload.context, false);
    const answer = container.querySelector('.chatbot-message.is-bot:last-of-type').textContent;
    assert.match(answer, expected);
    assert.doesNotMatch(answer, /Eso no lo manejo|en qué pantalla/i);
  });
}

test('acción rápida sigue enviando mensaje del catálogo desde el widget', async () => {
  mount(); await tdapRadio();
  await ask();
  fireEvent.click(screen.getByText('Registrar control'));
  await waitFor(() => assert.equal(api.post.mock.calls.length, 2), { timeout: 3000 });
  assert.match(api.post.mock.calls[1][1].mensaje, /control/i);
});
