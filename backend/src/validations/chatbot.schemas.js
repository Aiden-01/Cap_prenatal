const { z } = require('./common.schemas');
const {
  CHATBOT_CONTEXT_MODULES,
  CHATBOT_CONTEXT_ROUTES,
  CHATBOT_MAX_PERMISSIONS,
  CHATBOT_ROUTE_MODULES,
} = require('../config/chatbotContext');

const permissionCodeSchema = z.string({ error: 'Codigo de permiso invalido' })
  .min(3, 'Codigo de permiso invalido')
  .max(80, 'Codigo de permiso demasiado largo')
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/, 'Codigo de permiso invalido');

const chatbotContextSchema = z.object({
  route: z.enum(CHATBOT_CONTEXT_ROUTES, { error: 'Ruta de contexto invalida' }),
  module: z.enum(CHATBOT_CONTEXT_MODULES, { error: 'Modulo de contexto invalido' }),
  hasPatientContext: z.boolean({ error: 'hasPatientContext debe ser booleano' }),
  hasPregnancyContext: z.boolean({ error: 'hasPregnancyContext debe ser booleano' }),
  pregnancyStatus: z.enum(['activo', 'puerperio', 'cerrado'], {
    error: 'Estado de embarazo invalido',
  }).nullable(),
  permissions: z.array(permissionCodeSchema, { error: 'Permisos invalidos' })
    .max(CHATBOT_MAX_PERMISSIONS, `Se permiten hasta ${CHATBOT_MAX_PERMISSIONS} permisos`)
    .refine((permissions) => new Set(permissions).size === permissions.length, {
      message: 'Los permisos no deben repetirse',
    }),
}).strict().superRefine((context, refinement) => {
  const expectedModule = CHATBOT_ROUTE_MODULES[context.route];
  if (expectedModule !== context.module) {
    refinement.addIssue({
      code: 'custom',
      path: ['module'],
      message: 'El modulo no corresponde a la ruta normalizada',
    });
  }

  const expectedPatientContext = expectedModule === 'expediente';
  if (context.hasPatientContext !== expectedPatientContext) {
    refinement.addIssue({
      code: 'custom',
      path: ['hasPatientContext'],
      message: 'El contexto de paciente no corresponde a la ruta',
    });
  }

  if (context.hasPregnancyContext && !context.hasPatientContext) {
    refinement.addIssue({
      code: 'custom',
      path: ['hasPregnancyContext'],
      message: 'Un embarazo requiere contexto de paciente',
    });
  }

  if (context.pregnancyStatus !== null && !context.hasPregnancyContext) {
    refinement.addIssue({
      code: 'custom',
      path: ['pregnancyStatus'],
      message: 'El estado requiere un embarazo seleccionado',
    });
  }
});

const chatbotMessageSchema = z.object({
  mensaje: z.string({ error: 'Mensaje requerido' })
    .trim()
    .min(1, 'Mensaje requerido')
    .max(500, 'El mensaje debe tener 500 caracteres o menos'),
  context: chatbotContextSchema.optional(),
}).strip();

const chatbotFeedbackSchema = z.object({
  helpful: z.boolean({ error: 'helpful debe ser booleano' }),
  intent: z.string({ error: 'Intencion requerida' })
    .trim()
    .min(1, 'Intencion requerida')
    .max(100, 'La intencion debe tener 100 caracteres o menos'),
  // Compatibilidad con el frontend actual. Estos campos se aceptan, pero el
  // controller nunca los entrega al servicio de logging.
  mensaje: z.unknown().optional(),
  message: z.unknown().optional(),
}).strip();

module.exports = {
  chatbotContextSchema,
  chatbotFeedbackSchema,
  chatbotMessageSchema,
};
