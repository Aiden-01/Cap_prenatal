// Exact route allowlist: no query, fragment, patient identifiers or credentials.
const ALLOWED = new Set(['/dashboard', '/pacientes', '/reportes', '/mapa-riesgo', '/nuevo', '/comunidades', '/usuarios', '/historial']);
export function safeReturn(value) {
  return typeof value === 'string' && ALLOWED.has(value) ? value : '/dashboard';
}
