import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { canAccess } from '../utils/accessRules';

export default function AccessRoute({ access, children }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (access && !canAccess(usuario, access)) return <Navigate to="/dashboard" replace />;
  return children;
}
