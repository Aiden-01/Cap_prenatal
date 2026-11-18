import { Navigate, useLocation } from 'react-router-dom';
import { safeReturn } from '../utils/safeReturn';
import { useAuth } from '../hooks/useAuth';
import { canAccess } from '../utils/accessRules';

export default function AccessRoute({ access, children }) {
  const { usuario } = useAuth();
  const location = useLocation();
  if (!usuario) return <Navigate to="/login" replace state={{ returnTo: safeReturn(location.pathname) }} />;
  if (usuario.requiere_cambio_password) return <Navigate to="/cambiar-password-obligatorio" replace />;
  if (access && !canAccess(usuario, access)) return <Navigate to="/dashboard" replace />;
  return children;
}
