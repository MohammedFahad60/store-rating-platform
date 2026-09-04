import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDateTime } from "../utils/format";
import {
  Alert, Card, EmptyState, Field, Input, Pagination, Select, Spinner, Td, Th,
} from "../components/ui";

const ACTIONS = [
  { value: "", label: "All actions" },
  { value: "auth.login", label: "Login" },
  { value: "auth.login_failed", label: "Failed login" },
  { value: "auth.password_change", label: "Password change" },
  { value: "user.create", label: "User created" },
  { value: "user.status", label: "User status" },
  { value: "store.create", label: "Store created" },
  { value: "store.update", label: "Store updated" },
  { value: "store.status", label: "Store suspended/reactivated" },
  { value: "store.hours_update", label: "Store hours updated" },
  { value: "service.create", label: "Service created" },
  { value: "service.update", label: "Service updated" },
  { value: "service.deactivate", label: "Service deactivated" },
  { value: "booking.status", label: "Booking status changed" },
  { value: "rating.moderate", label: "Review moderated" },
];

const ENTITY_TYPES = [
  { value: "", label: "Any entity" },
  { value: "User", label: "User" },
  { value: "Store", label: "Store" },
  { value: "Service", label: "Service" },
  { value: "Booking", label: "Booking" },
  { value: "Rating", label: "Rating" },
];

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actorId, setActorId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const buildParams = useCallback(() => {
    const params = { page, limit: 20 };
    if (action) params.action = action;
    if (entityType) params.entityType = entityType;
    if (actorId.trim()) params.actorId = actorId.trim();
    if (entityId.trim()) params.entityId = entityId.trim();
    if (from) params.from = from;
    if (to) params.to = to;
    return params;
  }, [page, action, entityType, actorId, entityId, from, to]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.get("/admin/audit-logs", { params: buildParams() });
        if (!active) return;
        setLogs(data.logs || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load audit logs"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [buildParams]);

  const reset = () => {
    setAction("");
    setEntityType("");
    setActorId("");
    setEntityId("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Audit logs</h1>
        <p className="text-sm text-slate-400 mt-1">
          Immutable record of administrative actions — passwords, tokens and JWTs are never stored
        </p>
      </div>

      <Card className="p-4 mb-5">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Action">
            <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
              {ACTIONS.map((a) => (<option key={a.value} value={a.value}>{a.label}</option>))}
            </Select>
          </Field>
          <Field label="Entity type">
            <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
              {ENTITY_TYPES.map((e) => (<option key={e.value} value={e.value}>{e.label}</option>))}
            </Select>
          </Field>
          <Field label="Actor user id">
            <Input type="number" placeholder="e.g. 1" value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }} />
          </Field>
          <Field label="Entity id">
            <Input type="number" placeholder="e.g. 5" value={entityId} onChange={(e) => { setEntityId(e.target.value); setPage(1); }} />
          </Field>
          <Field label="From date">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </Field>
          <Field label="To date">
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </Field>
        </div>
        <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300 font-medium mt-2">
          Reset filters
        </button>
      </Card>

      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading audit logs..." />
      ) : logs.length === 0 ? (
        <Card>
          <EmptyState icon={ScrollText} title="No audit entries found">
            Try different filters.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>IP</Th><Th>Metadata</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-800/40 transition align-top">
                      <Td><span className="text-xs text-slate-400 whitespace-nowrap">{formatDateTime(l.createdAt)}</span></Td>
                      <Td>
                        <p className="text-sm font-medium text-white">{l.actorName}</p>
                        <p className="text-xs text-slate-500">{l.actorEmail}</p>
                      </Td>
                      <Td>
                        <span className="text-xs font-mono text-blue-400">{l.action}</span>
                      </Td>
                      <Td>
                        <p className="text-xs text-slate-400">{l.entityType || "—"} #{l.entityId ?? "—"}</p>
                      </Td>
                      <Td><span className="text-xs font-mono text-slate-500">{l.ipAddress || "—"}</span></Td>
                      <Td className="max-w-64">
                        <pre className="text-[11px] font-mono text-slate-400 whitespace-pre-wrap break-words">
                          {l.metadata ? JSON.stringify(l.metadata) : "—"}
                        </pre>
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
    </div>
  );
}
