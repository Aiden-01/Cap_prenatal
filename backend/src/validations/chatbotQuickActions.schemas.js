const { z } = require('./common.schemas');
const { CHATBOT_QUICK_ACTION_TARGETS } = require('../config/chatbotQuickActions');

const quickActionIdSchema = z.string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/);
const quickActionLabelSchema = z.string().trim().min(1).max(60);

const chatbotMessageQuickActionSchema = z.object({
  id: quickActionIdSchema,
  label: quickActionLabelSchema,
  type: z.literal('message'),
  message: z.string().trim().min(1).max(160),
}).strict();

const chatbotNavigateQuickActionSchema = z.object({
  id: quickActionIdSchema,
  label: quickActionLabelSchema,
  type: z.literal('navigate'),
  target: z.enum(CHATBOT_QUICK_ACTION_TARGETS),
}).strict();

const chatbotQuickActionSchema = z.discriminatedUnion('type', [
  chatbotMessageQuickActionSchema,
  chatbotNavigateQuickActionSchema,
]);

const chatbotQuickActionsSchema = z.array(chatbotQuickActionSchema)
  .max(4)
  .superRefine((actions, refinement) => {
    const uniquenessFields = [
      ['id', (action) => action.id],
      ['label', (action) => action.label],
      ['message', (action) => (action.type === 'message' ? action.message : null)],
      ['target', (action) => (action.type === 'navigate' ? action.target : null)],
    ];

    for (const [field, valueFor] of uniquenessFields) {
      const values = actions.map(valueFor).filter(Boolean);
      if (new Set(values).size !== values.length) {
        refinement.addIssue({
          code: 'custom',
          message: `Las acciones no deben repetir ${field}`,
        });
      }
    }
  });

module.exports = {
  chatbotMessageQuickActionSchema,
  chatbotNavigateQuickActionSchema,
  chatbotQuickActionSchema,
  chatbotQuickActionsSchema,
};
