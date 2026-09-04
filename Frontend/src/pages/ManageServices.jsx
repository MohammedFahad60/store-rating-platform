import { useCallback, useEffect, useState } from "react";
import { Clock, Pencil, Plus, Power, RefreshCw, Search, Store, Wrench } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatPrice } from "../utils/format";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
  Select,
  Spinner,
  StatCard,
  StatusBadge,
  Textarea,
  Td,
  Th,
} from "../components/ui";

const emptyForm = { name: "", description: "", price: "", estimatedMinutes: "" };

const ACTIVE_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

const SORTS = [
  { value: "created", label: "Newest" },
  { value: "name", label: "Name" },
  { value: "price", label: "Price" },
  { value: "duration", label: "Duration" },
];

export default function ManageServices() {
  const [store, setStore] = useState(null);
  const [services, setServices] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);

  // editor modal: null = closed, {} = create, {service} = edit
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // deactivation confirm
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [toggling, setToggling] = useState(false);

  const fetchStore = useCallback(async () => {
    const { data } = await api.get("/owner/store");
    return data.store;
  }, []);

  const fetchServices = useCallback(async () => {
    const params = { page, limit: 10, sort };
    if (search.trim()) params.search = search.trim();
    if (activeFilter) params.active = activeFilter;
    const { data } = await api.get("/owner/services", { params });
    return data;
  }, [page, search, activeFilter, sort]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const store = await fetchStore();
        if (active) setStore(store);
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load your store"));
      }
    })();
    return () => { active = false; };
  }, [fetchStore]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchServices();
        if (!active) return;
        setServices(data.services || []);
        setStats(data.stats || null);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load services"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fetchServices]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchServices();
      setServices(data.services || []);
      setStats(data.stats || null);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load services"));
    } finally {
      setLoading(false);
    }
  };

  const retryStoreLoad = async () => {
    setError("");
    try {
      const store = await fetchStore();
      setStore(store);
      await fetchData();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load your store"));
    }
  };

  // ---------------------------
  // CREATE / EDIT (storeId derived from JWT on the backend - never sent here)
  // ---------------------------
  const openCreate = () => {
    setForm(emptyForm);
    setSaveError("");
    setEditor({});
  };

  const openEdit = (service) => {
    setForm({
      name: service.name,
      description: service.description || "",
      price: String(service.price),
      estimatedMinutes: String(service.estimatedMinutes),
    });
    setSaveError("");
    setEditor({ service });
  };

  const handleSave = async () => {
    setSaveError("");
    setSaving(true);
    try {
      if (editor.service) {
        await api.put(`/services/${editor.service.id}`, {
          name: form.name,
          description: form.description.trim() || null,
          price: Number(form.price),
          estimatedMinutes: Number(form.estimatedMinutes),
        });
        setNotice("Service updated successfully");
      } else {
        await api.post("/services", {
          name: form.name,
          description: form.description.trim() || null,
          price: Number(form.price),
          estimatedMinutes: Number(form.estimatedMinutes),
        });
        setNotice("Service created successfully");
        setPage(1);
      }
      setEditor(null);
      await fetchData();
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Could not save the service"));
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------
  // ACTIVATE / DEACTIVATE
  // ---------------------------
  const setActive = async (service, active) => {
    setToggling(true);
    setError("");
    try {
      if (active) {
        await api.put(`/services/${service.id}`, { active: true });
        setNotice("Service activated successfully");
        setDeactivateTarget(null);
      } else {
        // Soft delete via DELETE endpoint (audited, notifies affected users).
        await api.delete(`/services/${service.id}`);
        setNotice(`${service.name} deactivated`);
        setDeactivateTarget(null);
      }
      await fetchData();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update the service"));
    } finally {
      setToggling(false);
    }
  };

  // ---------------------------
  // RENDER
  // ---------------------------
  if (loading && store === null) return <Spinner label="Loading your services..." />;

  if (store === null && error) {
    return (
      <Card>
        <EmptyState icon={Store} title="No store assigned yet">
          <p className="mb-4">{error} — contact an administrator to create a store for your owner account.</p>
          <Button variant="ghost" onClick={retryStoreLoad}><RefreshCw size={15} /> Try again</Button>
        </EmptyState>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">My services</h1>
          {store && (
            <p className="text-sm text-slate-400 mt-1">
              {store.name} {store.category && <span className="text-slate-600">· {store.category.replace(/_/g, " ")}</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={fetchData}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus size={16} /> Add service
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <StatCard label="Total services" value={stats.total} icon={Wrench} accent="text-blue-400" />
          <StatCard label="Active" value={stats.activeCount} icon={Wrench} accent="text-emerald-400" />
          <StatCard label="Inactive" value={stats.inactiveCount} icon={Power} accent="text-red-400" />
        </div>
      )}

      <Card className="p-4 mb-5">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search service name or description..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }} className="md:w-44">
            {ACTIVE_FILTERS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
          </Select>
          <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="md:w-36">
            {SORTS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </Select>
        </div>
      </Card>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading services..." />
      ) : services.length === 0 ? (
        <Card>
          <EmptyState icon={Wrench} title="No services found">
            Add your first service so customers can book it, or clear the filters.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <Th>Service</Th>
                    <Th>Price</Th>
                    <Th>Duration</Th>
                    <Th className="text-right">Bookings</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {services.map((service) => (
                    <tr key={service.id} className="hover:bg-slate-800/40 transition">
                      <Td>
                        <p className="font-medium text-white">{service.name}</p>
                        {service.description && (
                          <p className="text-xs text-slate-500 mt-0.5 max-w-md truncate">{service.description}</p>
                        )}
                      </Td>
                      <Td className="font-semibold text-slate-100">{formatPrice(service.price)}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 text-slate-400">
                          <Clock size={13} /> {service.estimatedMinutes} min
                        </span>
                      </Td>
                      <Td className="text-right text-slate-300">{service.bookingCount}</Td>
                      <Td><StatusBadge status={service.active ? "ACTIVE" : "INACTIVE"} /></Td>
                      <Td className="text-right">
                        <div className="inline-flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(service)}>
                            <Pencil size={13} /> Edit
                          </Button>
                          {service.active ? (
                            <Button variant="outline" size="sm" onClick={() => setDeactivateTarget(service)}>
                              <Power size={13} /> Deactivate
                            </Button>
                          ) : (
                            <Button variant="secondary" size="sm" loading={toggling} onClick={() => setActive(service, true)}>
                              <Power size={13} /> Activate
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
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={setPage} />
        </>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.service ? "Edit service" : "Add a new service"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>
              {editor?.service ? "Save changes" : "Create service"}
            </Button>
          </>
        }
      >
        {saveError && <Alert className="mb-4">{saveError}</Alert>}
        <div className="space-y-4">
          <Field label="Service name" hint="required">
            <Input
              placeholder="e.g. Haircut & Styling"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={100}
            />
          </Field>
          <Field label="Description" hint="optional">
            <Textarea
              placeholder="What does this service include?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={2000}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price (₹)">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </Field>
            <Field label="Duration (minutes)">
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="30"
                value={form.estimatedMinutes}
                onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            The service is added to <strong className="text-slate-300">{store?.name || "your store"}</strong> automatically.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title="Deactivate this service?"
        message={`${deactivateTarget?.name} will be hidden from customers, can no longer be booked and customers with future bookings will be notified. You can activate it again any time.`}
        confirmLabel="Deactivate service"
        danger
        loading={toggling}
        onConfirm={() => deactivateTarget && setActive(deactivateTarget, false)}
        onClose={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
