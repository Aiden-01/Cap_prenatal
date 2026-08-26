const MUNICIPIO_EL_CHAL = 'el chal';

function normalizarMunicipio(value) {
  return String(value || '').trim().toLowerCase();
}

function esMunicipioElChal(value) {
  return normalizarMunicipio(value) === MUNICIPIO_EL_CHAL;
}

module.exports = {
  MUNICIPIO_EL_CHAL,
  esMunicipioElChal,
  normalizarMunicipio,
};
