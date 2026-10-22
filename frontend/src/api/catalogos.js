import api from './axios';

export async function listarCatalogo(tipo, params, signal) {
  const { data } = await api.get(`/catalogos/${tipo}`, { params, signal });
  if (!Array.isArray(data?.data) || !Number.isInteger(data.total)) throw new Error('Respuesta de catálogo inválida');
  return data;
}

export async function cargarOpcionesActivas(tipo, signal) {
  const opciones = [];
  let pagina = 1;
  let total;
  do {
    const result = await listarCatalogo(tipo, { estado: 'activos', pagina, limite: 100 }, signal);
    opciones.push(...result.data);
    total = result.total;
    if (!result.data.length && opciones.length < total) throw new Error('El catálogo cambió; vuelve a cargarlo');
    pagina++;
  } while (opciones.length < total);
  return opciones;
}
