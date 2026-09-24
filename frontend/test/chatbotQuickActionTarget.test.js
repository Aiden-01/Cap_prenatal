import assert from "node:assert/strict";
import test from "node:test";
import { buildChatbotContext } from "../src/utils/chatbotContext.js";
import { resolveQuickActionTarget } from "../src/utils/chatbotQuickActions.js";

const action = { id: "open-current-record", label: "Ir al expediente actual", type: "navigate", target: "expediente_actual" };
const usuario = { permisos: ["pacientes.ver"] };

test("Abrir expediente actual sale de formularios dedicados y conserva embarazo seleccionado", () => {
  for (const pathname of [
    "/pacientes/12/plan-parto", "/pacientes/12/morbilidad/nuevo",
    "/pacientes/12/morbilidad/8/editar", "/pacientes/12/vacunas/nuevo",
    "/pacientes/12/vacunas/8/editar", "/pacientes/12/puerperio/nuevo",
    "/pacientes/12/puerperio/8/editar", "/pacientes/12/riesgo",
    "/pacientes/12/controles/nuevo", "/pacientes/12/controles/8/editar",
    "/pacientes/12/editar",
  ]) {
    const search = "?embarazo_id=4";
    const context = buildChatbotContext({ pathname, search, usuario });
    assert.equal(resolveQuickActionTarget(action, { pathname, search }, context), "/pacientes/12?embarazo_id=4", pathname);
  }
});

test("destino se deriva solo de ruta de paciente válida y query de embarazo válida", () => {
  const pathname = "/pacientes/12/plan-parto";
  const context = buildChatbotContext({ pathname, usuario });
  assert.equal(resolveQuickActionTarget(action, { pathname, search: "?embarazo_id=malicioso&tab=plan" }, context), "/pacientes/12");
  assert.equal(resolveQuickActionTarget(action, { pathname: "/pacientes/12/inexistente" }, context), null);
  assert.equal(resolveQuickActionTarget(action, { pathname: "/pacientes/no-valido/plan-parto" }, context), null);
  assert.equal(resolveQuickActionTarget(action, { pathname }, { ...context, hasPatientContext: false }), null);
  assert.equal(resolveQuickActionTarget(action, { pathname }, { ...context, module: "reportes" }), null);
});
