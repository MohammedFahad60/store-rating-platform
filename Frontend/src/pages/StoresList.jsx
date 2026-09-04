import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Store } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  Spinner,
  Stars,
  StatusBadge,
  Td,
  Th,
} from "../components/ui";

export default function StoresList() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.get("/admin/stores");
        if (!active) return;
        setStores(data.stores || []);
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load stores"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.ownerName?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q)
    );
  }, [stores, query]);

  const setStatus = async (store, status) => {
    setBusyId(store.id);
    setError("");
    try {
      const { data } = await api.put(`/admin/stores/${store.id}/status`, { status });
      setStores((prev) => prev.map((s) => (s.id === store.id ? { ...s, status: data.store.status } : s)));
      setNotice(`${store.name} ${status === "SUSPENDED" ? "suspended" : "set active"}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update the store"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Stores</h1>
          <p className="text-sm text-slate-400 mt-1">{stores.length} stores on the platform</p>
        </div>
        <Link to="/admin/stores/new">
          <Button>
            <Plus size={16} /> New store
          </Button>
        </Link>
      </div>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading stores..." />
      ) : (
        <>
          <div className="relative max-w-sm mb-4">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input className="pl-9" placeholder="Search store, owner or category" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {filtered.length === 0 ? (
            <Card>
              <EmptyState icon={Store} title="No stores found">
                {query ? "Try a different search." : "Create your first store."}
              </EmptyState>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <Th>Store</Th>
                      <Th>Owner</Th>
                      <Th>Rating</Th>
                      <Th>Services</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filtered.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-800/40 transition">
                        <Td>
                          <p className="font-medium text-white">{s.name}</p>
                          <p className="text-xs text-slate-500 truncate max-w-64">{s.category || "—"} · {s.address}</p>
                        </Td>
                        <Td className="text-slate-300">{s.ownerName}</Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <Stars value={s.averageRating} size={13} />
                            <span className="text-xs text-slate-500">({s.ratingCount})</span>
                          </div>
                        </Td>
                        <Td className="text-slate-300">
                          {s.activeServiceCount}/{s.serviceCount}
                        </Td>
                        <Td><StatusBadge status={s.status} /></Td>
                        <Td className="text-right">
                          <div className="inline-flex gap-2">
                            {s.status === "SUSPENDED" ? (
                              <Button variant="success" size="sm" loading={busyId === s.id} onClick={() => setStatus(s, "ACTIVE")}>
                                Reactivate
                              </Button>
                            ) : (
                              <Button variant="danger" size="sm" loading={busyId === s.id} onClick={() => setStatus(s, "SUSPENDED")}>
                                Suspend
                              </Button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
