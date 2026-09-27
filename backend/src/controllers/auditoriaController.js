const { asyncHandler } = require('../middleware/asyncHandler');
const { createAuditHistoryService } = require('../services/auditHistoryService');

function createAuditoriaController({ service = createAuditHistoryService() } = {}) {
  return {
    usuarios: asyncHandler(async (_req, res) => {
      res.set('Cache-Control', 'no-store');
      return res.json(await service.listarUsuarios());
    }),
    listar: asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      return res.json(await service.listar(req.query));
    }),
  };
}
module.exports = { ...createAuditoriaController(), createAuditoriaController };
