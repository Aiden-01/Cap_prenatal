const { z } = require('./common.schemas');

const chatbotMessageSchema = z.object({
  mensaje: z.string({ error: 'Mensaje requerido' })
    .trim()
    .min(1, 'Mensaje requerido')
    .max(500, 'El mensaje debe tener 500 caracteres o menos'),
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
  chatbotFeedbackSchema,
  chatbotMessageSchema,
};
