import api from './axios';

export async function descargarNotaPdf(pacienteId, notaId) {
  const response = await api.get(`/pacientes/${pacienteId}/notas-clinicas/${notaId}/pdf`, { responseType: 'blob' });
  if (!response.headers?.['content-type']?.includes('application/pdf')) throw new Error('El servidor no devolvió un PDF válido');
  const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const link = document.createElement('a'); link.href = url; link.download = `nota-clinica-${notaId}.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
