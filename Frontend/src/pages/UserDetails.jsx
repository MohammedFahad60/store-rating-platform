import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Globe, Mail, MapPin, Phone, ShieldBan, ShieldCheck, Store, User as UserIcon } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDateTime, initials } from "../utils/format";
import {
  Alert, Button, Card, ConfirmDialog, EmptyState, Spinner, StatusBadge,
} from "../components/ui";

export default function UserDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.get(`/admin/users/${id}`);
        if (active) setUser(data.user);
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load user"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const toggleStatus = async () => {
    const next = user.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    setBusy(true);
    setError("");
    try {
      const { data } = await api.put(`/admin/users/${user.id}/status`, { status: next });
      setUser((prev) => ({ ...prev, status: data.user.status }));
      setNotice(`${user.name} ${next === "DISABLED" ? "disabled" : "activated"}`);
      setConfirmOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update the account status"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading user..." />;

  if (error || !user) {
    return (
      <Card>
        <EmptyState icon={UserIcon} title="User not found">
          <p className="mb-4">{error || "This user does not exist."}</p>
          <button onClick={() => navigate(-1)} className="text-blue-400 hover:text-blue-300 text-sm font-medium">
            ← Go back
          </button>
        </EmptyState>
      </Card>
    );
  }

  const stores = user.Stores || [];

  return (
    <div className="max-w-3xl">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-5 transition">
        <ArrowLeft size={15} /> Back to users
      </Link>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      <Card className="p-6 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-300 text-lg font-bold flex items-center justify-center">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white">{user.name}</h1>
            <p className="text-sm text-slate-400 truncate">{user.email}</p>
            <p className="text-xs text-slate-500 mt-1">Member since {formatDateTime(user.createdAt)}</p>
          </div>
          <div className="ml-auto flex flex-col items-end gap-2">
            <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/15 text-blue-300 px-3 py-1 text-xs font-semibold">
              {user.role}
            </span>
            <StatusBadge status={user.status} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-5 text-sm text-slate-400">
          {user.phone && <p className="flex items-center gap-2"><Phone size={14} className="text-slate-500 shrink-0" /> {user.phone}</p>}
          <p className="flex items-center gap-2"><Globe size={14} className="text-slate-500 shrink-0" /> {user.role === "ADMIN" ? "Platform administrator" : user.role === "OWNER" ? "Store owner" : "Customer"}</p>
          {user.address && <p className="sm:col-span-2 flex items-center gap-2"><MapPin size={14} className="text-slate-500 shrink-0" /> {user.address}</p>}
        </div>

        {user.role !== "ADMIN" && (
          <div className="mt-5 border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {user.status === "DISABLED"
                ? "Disabled accounts are signed out immediately and cannot log in until reactivated."
                : "Disabling an account signs the user out immediately and blocks new logins."}
            </p>
            {user.status === "DISABLED" ? (
              <Button variant="secondary" loading={busy} onClick={() => setConfirmOpen(true)}>
                <ShieldCheck size={15} /> Activate account
              </Button>
            ) : (
              <Button variant="outline" loading={busy} onClick={() => setConfirmOpen(true)}>
                <ShieldBan size={15} /> Disable account
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Activity summary */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Mail size={15} className="text-blue-400" /> Contact
          </h2>
          <p className="text-sm text-slate-300">{user.email}</p>
          <p className="text-sm text-slate-500 mt-1">{user.phone || "No phone on file"}</p>
          <p className="text-xs text-slate-600 mt-3">
            Account created {formatDateTime(user.createdAt)}
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Store size={15} className="text-violet-400" /> Relationship
          </h2>
          {user.role === "OWNER" ? (
            <p className="text-sm text-slate-300">
              {stores.length > 0 ? `Manages ${stores.length} store${stores.length === 1 ? "" : "s"}` : "No store assigned yet"}
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              {user.role === "ADMIN" ? "Platform-level administrator account." : "Customer account - bookings, reviews and favorites."}
            </p>
          )}
          <p className="text-xs text-slate-600 mt-3">
            Role is managed by the platform only — it cannot be changed through the UI.
          </p>
        </Card>
      </div>

      {user.role === "OWNER" && (
        <Card>
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-semibold text-white">Managed store</h2>
            <Link to="/admin/stores" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
              Manage stores →
            </Link>
          </div>
          {stores.length === 0 ? (
            <p className="text-sm text-slate-500 px-5 py-8 text-center">
              This owner does not manage a store yet.{" "}
              <Link to="/admin/stores/new" className="text-blue-400 hover:text-blue-300">Assign one now</Link>.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {stores.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Store #{s.id}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={user.status === "DISABLED" ? "Activate this account?" : "Disable this account?"}
        message={
          user.status === "DISABLED"
            ? `${user.name} will be able to log in again.`
            : `${user.name} will be signed out immediately and unable to log in until reactivated.`
        }
        confirmLabel={user.status === "DISABLED" ? "Activate account" : "Disable account"}
        danger={user.status !== "DISABLED"}
        loading={busy}
        onConfirm={toggleStatus}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
