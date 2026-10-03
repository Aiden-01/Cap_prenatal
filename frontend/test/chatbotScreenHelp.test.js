import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatbotContext, normalizeChatbotLocation } from '../src/utils/chatbotContext.js';

test('contexto minimizado conserva categoría funcional y excluye todos los canarios del formulario', () => {
  const privateValues = { cui: 'CUI_CANARIO', nombres: 'NOMBRE_CANARIO', expediente: 'EXP_CANARIO', fecha_nacimiento: 'NAC_CANARIO', telefono: 'TEL_CANARIO', direccion: 'DIR_CANARIO', vih: 'VIH_CANARIO', diagnosticos: 'DX_CANARIO', notas: 'NOTAS_CANARIO' };
  const result = buildChatbotContext({
    pathname: '/pacientes/998877/vacunas/nuevo', search: '?embarazo_id=776655&fecha=FECHA_CANARIO',
    usuario: { ...privateValues, permisos: ['controles.crear'] }, formState: privateValues,
    vaccineType: 'tdap', focusedField: 'vacuna_fecha_dosis',
  });
  assert.equal(result.route, '/pacientes/:id/vacunas/nuevo');
  assert.equal(result.vaccineType, 'tdap');
  for (const value of [...Object.values(privateValues), '998877', '776655', 'FECHA_CANARIO']) {
    assert.equal(JSON.stringify(result).includes(value), false, value);
  }
  assert.deepEqual(Object.keys(result).sort(), ['route', 'module', 'hasPatientContext', 'hasPregnancyContext', 'pregnancyStatus', 'permissions', 'section', 'tab', 'form', 'focusedField', 'vaccineType'].sort());
});

test('categoría se descarta al salir de vacunas o recibir texto libre/objeto', () => {
  for (const vaccineType of ['CANARIO', 'Tdap', { tipo_vacuna: 'tdap', fecha: 'CANARIO' }]) {
    assert.equal(buildChatbotContext({ pathname: '/pacientes/7/vacunas/nuevo', vaccineType }).vaccineType, null);
  }
  for (const pathname of ['/dashboard', '/pacientes/7/riesgo', '/desconocida']) {
    assert.equal('vaccineType' in buildChatbotContext({ pathname, vaccineType: 'tdap' }), false);
  }
});

test('rutas dinámicas de alta y edición conservan plantilla sin IDs ni query', () => {
  for (const [pathname, route] of [
    ['/pacientes/7/vacunas/91/editar', '/pacientes/:id/vacunas/:id/editar'],
    ['/pacientes/7/controles/42/editar', '/pacientes/:id/controles/:id/editar'],
    ['/pacientes/7/riesgo', '/pacientes/:id/riesgo'],
    ['/pacientes/7/plan-parto', '/pacientes/:id/plan-parto'],
  ]) assert.equal(normalizeChatbotLocation(pathname).route, route);
});
