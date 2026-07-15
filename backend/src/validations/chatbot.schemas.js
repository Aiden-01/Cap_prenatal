const { z } = require('./common.schemas');
const {
  CHATBOT_CONTEXT_MODULES,
  CHATBOT_CONTEXT_ROUTES,
  CHATBOT_MAX_PERMISSIONS,
  CHATBOT_ROUTE_MODULES,
} = require('../config/chatbotContext');
const { chatbotKnowledge } = require('../config/chatbotKnowledge');
const {
  CHATBOT_GUIDE_IDS,
  CHATBOT_MAX_GUIDE_STEPS,
  chatbotGuides,
} = require('../config/chatbotGuides');

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

const knownIntentIds = Object.freeze(chatbotKnowledge.map((item) => item.id));

const chatbotConversationSchema = z.object({
  lastIntent: z.enum(knownIntentIds, { error: 'Ultima intencion invalida' }).nullable(),
  activeGuide: z.enum(CHATBOT_GUIDE_IDS, { error: 'Guia activa invalida' }).nullable(),
  currentStep: z.number({ error: 'Paso actual invalido' })
    .int('Paso actual invalido')
    .min(1, 'El paso actual debe ser positivo')
    .max(CHATBOT_MAX_GUIDE_STEPS, 'Paso actual fuera del limite')
    .nullable(),
  totalSteps: z.number({ error: 'Total de pasos invalido' })
    .int('Total de pasos invalido')
    .min(1, 'Total de pasos invalido')
    .max(CHATBOT_MAX_GUIDE_STEPS, 'Total de pasos fuera del limite')
    .nullable()
    .optional(),
}).strict().superRefine((conversation, refinement) => {
  if (conversation.activeGuide === null) {
    if (conversation.currentStep !== null) {
      refinement.addIssue({
        code: 'custom',
        path: ['currentStep'],
        message: 'No puede existir un paso sin guia activa',
      });
    }
    if (conversation.totalSteps !== undefined && conversation.totalSteps !== null) {
      refinement.addIssue({
        code: 'custom',
        path: ['totalSteps'],
        message: 'No puede existir total de pasos sin guia activa',
      });
    }
    return;
  }

  const guide = chatbotGuides[conversation.activeGuide];
  if (conversation.currentStep === null) {
    refinement.addIssue({
      code: 'custom',
      path: ['currentStep'],
      message: 'Una guia activa requiere paso actual',
    });
  } else if (conversation.currentStep > guide.steps.length) {
    refinement.addIssue({
      code: 'custom',
      path: ['currentStep'],
      message: 'El paso actual excede la guia',
    });
  }

  if (conversation.lastIntent !== conversation.activeGuide) {
    refinement.addIssue({
      code: 'custom',
      path: ['lastIntent'],
      message: 'La ultima intencion debe corresponder a la guia activa',
    });
  }

  if (
    conversation.totalSteps !== undefined
    && conversation.totalSteps !== guide.steps.length
  ) {
    refinement.addIssue({
      code: 'custom',
      path: ['totalSteps'],
      message: 'El total de pasos no corresponde a la guia',
    });
  }
});

const chatbotMessageSchema = z.object({
  mensaje: z.string({ error: 'Mensaje requerido' })
    .trim()
    .min(1, 'Mensaje requerido')
    .max(500, 'El mensaje debe tener 500 caracteres o menos'),
  context: chatbotContextSchema.optional(),
  conversation: chatbotConversationSchema.optional(),
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
  chatbotConversationSchema,
  chatbotContextSchema,
  chatbotFeedbackSchema,
  chatbotMessageSchema,
};
