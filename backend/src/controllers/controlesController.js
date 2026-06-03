const controlesPrenatalesController = require('./controlesPrenatalesController');
const planPartoController = require('./planPartoController');
const puerperioController = require('./puerperioController');

module.exports = {
  ...controlesPrenatalesController,
  ...planPartoController,
  ...puerperioController,
};
