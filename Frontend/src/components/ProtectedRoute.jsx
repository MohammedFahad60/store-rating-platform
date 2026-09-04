import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isLoggedIn, getRole, homePathForRole } from "../utils/auth";

/**
 * Route guard used as a layout route element.
 *
 * - No session  -> redirect to /login
 * - Session role not in `roles` -> redirect to that role's home page
 *   (a logged-in OWNER hitting an ADMIN route never sees admin UI).
 */
export default function ProtectedRoute({ roles = [] }) {
  const location = useLocation();

  if (!isLoggedIn()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const role = getRole();
  if (roles.length > 0 && !roles.includes(role)) {
    return <Navigate to={homePathForRole(role)} replace />;
  }

  return <Outlet />;
}
