import { Navigate } from "react-router-dom";
import { isLoggedIn, getRole, homePathForRole } from "../utils/auth";

// "/" -> role home when logged in, otherwise the login page.
export default function RootRedirect() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <Navigate to={homePathForRole(getRole())} replace />;
}
