const vacunasService = require('../services/vacunasService');
const { asyncHandler } = require('../middleware/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const vacunas = await vacunasService.listarVacunas(
    req.params.pacienteId,
    req.query.embarazo_id || null
  );
  return res.json(vacunas);
});

const antecedentes = asyncHandler(async (req, res) => {
  const vacunas = await vacunasService.listarAntecedentes({
    pacienteId: req.params.pacienteId,
    excluirEmbarazoId: req.query.excluir_embarazo_id || null,
  });
  return res.json(vacunas);
});

const obtener = asyncHandler(async (req, res) => {
  const vacuna = await vacunasService.obtenerVacuna({
    pacienteId: req.params.pacienteId,
    embarazoId: req.query.embarazo_id || null,
    id: req.params.id,
  });

  return res.json(vacuna);
});

const guardar = asyncHandler(async (req, res) => {
  const vacuna = await vacunasService.guardarVacuna({
    pacienteId: req.params.pacienteId,
    embarazoId: req.query.embarazo_id || null,
    body: req.body,
    req,
  });

  return res.status(201).json(vacuna);
});

const actualizar = asyncHandler(async (req, res) => {
  const vacuna = await vacunasService.actualizarVacuna({
    pacienteId: req.params.pacienteId,
    embarazoId: req.query.embarazo_id || null,
    id: req.params.id,
    body: req.body,
    req,
  });

  return res.json(vacuna);
});

const eliminar = asyncHandler(async (req, res) => {
  const result = await vacunasService.eliminarVacuna({
    pacienteId: req.params.pacienteId,
    embarazoId: req.query.embarazo_id || null,
    id: req.params.id,
    req,
  });

  return res.json(result);
});

module.exports = {
  listar,
  antecedentes,
  obtener,
  guardar,
  actualizar,
  eliminar,
};
