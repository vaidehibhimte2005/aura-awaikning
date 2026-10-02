import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Loader } from './States.jsx';

/**
 * UX guard only — the API enforces every permission server-side.
 * <ProtectedRoute roles={['admin']} />
 */
export function ProtectedRoute({ roles, children }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loader page label="Preparing your space…" />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children || <Outlet />;
}

export function GuestOnly({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <Loader page />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return children;
}
