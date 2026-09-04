// Central auth helpers - single source of truth for session storage.

const KEYS = {
  token: "token",
  id: "id",
  name: "name",
  email: "email",
  role: "role",
};

export function getToken() {
  return localStorage.getItem(KEYS.token);
}

export function getRole() {
  return localStorage.getItem(KEYS.role);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

export function getUser() {
  return {
    id: localStorage.getItem(KEYS.id),
    name: localStorage.getItem(KEYS.name),
    email: localStorage.getItem(KEYS.email),
    role: localStorage.getItem(KEYS.role),
  };
}

// Saves the session returned by POST /auth/login (token, id, name, email, role)
export function saveSession({ token, id, name, email, role }) {
  if (token) localStorage.setItem(KEYS.token, token);
  if (id !== undefined && id !== null) localStorage.setItem(KEYS.id, String(id));
  if (name) localStorage.setItem(KEYS.name, name);
  if (email) localStorage.setItem(KEYS.email, email);
  if (role) localStorage.setItem(KEYS.role, role);
}

export function clearSession() {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
}

// Where each role lands after login / on protected-route denial
export function homePathForRole(role) {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "OWNER":
      return "/owner";
    default:
      return "/stores";
  }
}
