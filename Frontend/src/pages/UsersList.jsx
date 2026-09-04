import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Plus, Search, ShieldBan, ShieldCheck, Users } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDateTime, initials } from "../utils/format";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Pagination,
  Select,
  Spinner,
  Td,
  Th,
} from "../components/ui";

const ROLE_STYLES = {
  ADMIN: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  OWNER: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  USER: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [target, setTarget] = useState(null);

  const fetchUsers = useCallback(async () => {
    const params = { page, limit: 10, sort };
    if (query.trim()) params.search = query.trim();
    if (role) params.role = role;
    const { data } = await api.get("/admin/users", { params });
    return data;
  }, [page, query, role, sort]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchUsers();
        if (!active) return;
        setUsers(data.users || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load users"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fetchUsers]);

  const toggleStatus = async () => {
    const next = target.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    setBusyId(target.id);
    setError("");
    try {
      const { data } = await api.put(`/admin/users/${target.id}/status`, { status: next });
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, status: data.user.status } : u)));
      setNotice(`${target.name} ${next === "DISABLED" ? "disabled" : "activated"}`);
      setTarget(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update the user status"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-sm text-slate-400 mt-1">{pagination.total} registered accounts — password hashes are never exposed</p>
        </div>
        <Link to="/admin/users/new">
          <Button><Plus size={16} /> New user</Button>
        </Link>
      </div>

      <Card className="p-4 mb-5">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search by name, email or phone"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="md:w-40">
            <option value="">All roles</option>
            <option value="ADMIN">Admin</option>
            <option value="OWNER">Owner</option>
            <option value="USER">Customer</option>
          </Select>
          <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="md:w-36">
            <option value="created">Newest</option>
            <option value="name">Name</option>
            <option value="role">Role</option>
          </Select>
        </div>
      </Card>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading users..." />
      ) : users.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No users found">
            Try a different search or filter.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <Th>User</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th>Joined</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className={`hover:bg-slate-800/40 transition ${u.status === "DISABLED" ? "opacity-70" : ""}`}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center shrink-0">
                            {initials(u.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{u.name}</p>
                            <p className="text-xs text-slate-500 truncate">{u.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ROLE_STYLES[u.role] || ROLE_STYLES.USER}`}>
                          {u.role}
                        </span>
                      </Td>
                      <Td>
                        <span className={`text-[11px] font-bold tracking-wider rounded-full px-2.5 py-1 ${u.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                          {u.status}
                        </span>
                      </Td>
                      <Td className="text-slate-500">{formatDateTime(u.createdAt)}</Td>
                      <Td className="text-right">
                        <div className="inline-flex gap-2">
                          <Link to={`/admin/users/${u.id}`}>
                            <Button variant="ghost" size="sm"><Eye size={14} /> View</Button>
                          </Link>
                          {u.role !== "ADMIN" && (
                            u.status === "DISABLED" ? (
                              <Button variant="secondary" size="sm" loading={busyId === u.id} onClick={() => setTarget(u)}>
                                <ShieldCheck size={14} /> Activate
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" loading={busyId === u.id} onClick={() => setTarget(u)}>
                                <ShieldBan size={14} /> Disable
                              </Button>
                            )
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(target)}
        title={target?.status === "DISABLED" ? "Activate this account?" : "Disable this account?"}
        message={
          target?.status === "DISABLED"
            ? `${target?.name} will be able to log in again.`
            : `${target?.name} will be immediately signed out and unable to log in until reactivated.`
        }
        confirmLabel={target?.status === "DISABLED" ? "Activate account" : "Disable account"}
        danger={target?.status !== "DISABLED"}
        loading={busyId === target?.id}
        onConfirm={toggleStatus}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
