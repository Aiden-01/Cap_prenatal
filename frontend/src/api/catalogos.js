import api from './axios';

export async function listarCargos(params, signal) {
  const { data } = await api.get('/catalogos/cargos', { params, signal });
  if (!Array.isArray(data?.data) || !Number.isInteger(data.total)) throw new Error('Respuesta de catálogo inválida');
  return data;
}

export async function cargarCargosActivos(signal) {
  const opciones = [];
  let pagina = 1;
  let total;
  do {
    const result = await listarCargos({ estado: 'activos', pagina, limite: 100 }, signal);
    opciones.push(...result.data);
    total = result.total;
    if (!result.data.length && opciones.length < total) throw new Error('El catálogo cambió; vuelve a cargarlo');
    pagina++;
  } while (opciones.length < total);
  return opciones;
}
