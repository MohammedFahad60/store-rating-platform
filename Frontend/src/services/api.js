import axios from "axios";
import { getToken, clearSession } from "../utils/auth";

// API base URL is environment-driven.
// - Set VITE_API_URL at build time to the deployed backend (e.g.
//   https://store-api.example.com/api) in static hosting setups.
// - When unset, the app uses the relative "/api" origin. In development the
//   Vite dev server proxies /api to the backend (see vite.config.js); in
//   production this requires the frontend and API to share an origin (or a
//   reverse proxy routing /api to the backend).
const baseURL = (
  import.meta.env.VITE_API_URL ||
  "https://store-rating-platform-v34v.onrender.com/api"
).replace(/\/$/, "");

const api = axios.create({
  baseURL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Centralized 401 handling: an expired/invalid session is cleared and the user
// is sent back to the login page. Login attempts themselves (no stored token)
// must not trigger a redirect - the Login page renders its own error.
api.interceptors.response.use(
  (response) => {
    // After any mutating API call, announce the change so always-mounted
    // widgets (e.g. the notification bell badge) can refresh cheaply.
    const method = String(response.config?.method || "").toLowerCase();
    if (["post", "put", "patch", "delete"].includes(method)) {
      window.dispatchEvent(new Event("store-rating:data-changed"));
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const hadSession = Boolean(getToken());

    if (status === 401 && hadSession && !window.location.pathname.startsWith("/login")) {
      clearSession();
      window.location.assign("/login");
    }

    return Promise.reject(error);
  }
);

export default api;
