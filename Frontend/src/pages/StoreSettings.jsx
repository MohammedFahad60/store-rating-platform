import { useCallback, useEffect, useState } from "react";
import { Clock, RefreshCw, Save, Store } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import {
  Alert, Button, Card, EmptyState, Field, Input, Spinner, Textarea,
} from "../components/ui";

const DAYS = [
  { dayOfWeek: 1, name: "Monday" },
  { dayOfWeek: 2, name: "Tuesday" },
  { dayOfWeek: 3, name: "Wednesday" },
  { dayOfWeek: 4, name: "Thursday" },
  { dayOfWeek: 5, name: "Friday" },
  { dayOfWeek: 6, name: "Saturday" },
  { dayOfWeek: 7, name: "Sunday" },
];

const defaultHours = () =>
  DAYS.map((d) => ({
    dayOfWeek: d.dayOfWeek,
    name: d.name,
    openTime: "09:00",
    closeTime: "20:00",
    closed: d.dayOfWeek === 7,
  }));

export default function StoreSettings() {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // settings form
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");

  // hours form
  const [hours, setHours] = useState(defaultHours());
  const [savingHours, setSavingHours] = useState(false);
  const [hoursError, setHoursError] = useState("");
  const [hoursNotice, setHoursNotice] = useState("");

  const fetchSettings = useCallback(async () => {
    const { data } = await api.get("/owner/store");
    return data.store;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const store = await fetchSettings();
        if (!active) return;
        setStore(store);
        setForm({
          name: store.name || "",
          email: store.email || "",
          phone: store.phone || "",
          address: store.address || "",
          category: store.category || "",
          description: store.description || "",
          latitude: store.latitude ?? "",
          longitude: store.longitude ?? "",
        });
        if (store.operatingHours?.length) {
          setHours(
            DAYS.map((d) => {
              const row = store.operatingHours.find((h) => h.dayOfWeek === d.dayOfWeek);
              return row
                ? { ...d, openTime: row.openTime?.slice(0, 5) || "09:00", closeTime: row.closeTime?.slice(0, 5) || "20:00", closed: Boolean(row.closed) }
                : { ...d, openTime: "09:00", closeTime: "20:00", closed: false };
            })
          );
        } else {
          setHours(defaultHours());
        }
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load store settings"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fetchSettings]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const store = await fetchSettings();
      setStore(store);
      setForm({
        name: store.name || "",
        email: store.email || "",
        phone: store.phone || "",
        address: store.address || "",
        category: store.category || "",
        description: store.description || "",
        latitude: store.latitude ?? "",
        longitude: store.longitude ?? "",
      });
      if (store.operatingHours?.length) {
        setHours(
          DAYS.map((d) => {
            const row = store.operatingHours.find((h) => h.dayOfWeek === d.dayOfWeek);
            return row
              ? { ...d, openTime: row.openTime?.slice(0, 5) || "09:00", closeTime: row.closeTime?.slice(0, 5) || "20:00", closed: Boolean(row.closed) }
              : { ...d, openTime: "09:00", closeTime: "20:00", closed: false };
          })
        );
      } else {
        setHours(defaultHours());
      }
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load store settings"));
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      await api.put("/owner/store", {
        name: form.name,
        email: form.email,
        phone: form.phone?.trim() || null,
        address: form.address,
        category: form.category?.trim() || null,
        description: form.description?.trim() || null,
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
      });
      setNotice("Store details saved");
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Could not save store details"));
    } finally {
      setSaving(false);
    }
  };

  const updateHour = (dayOfWeek, patch) => {
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)));
  };

  const saveHours = async () => {
    setSavingHours(true);
    setHoursError("");
    setHoursNotice("");
    try {
      const { data } = await api.put("/owner/store/hours", {
        hours: hours.map(({ dayOfWeek, openTime, closeTime, closed }) => ({ dayOfWeek, openTime, closeTime, closed })),
      });
      setHours(
        DAYS.map((d) => {
          const row = (data.operatingHours || []).find((h) => h.dayOfWeek === d.dayOfWeek);
          return row
            ? { ...d, openTime: row.openTime?.slice(0, 5) || "09:00", closeTime: row.closeTime?.slice(0, 5) || "20:00", closed: Boolean(row.closed) }
            : d;
        })
      );
      setHoursNotice("Operating hours saved — customers can only book within these windows");
    } catch (err) {
      setHoursError(apiErrorMessage(err, "Could not save operating hours"));
    } finally {
      setSavingHours(false);
    }
  };

  if (loading) return <Spinner label="Loading store settings..." />;

  if (error || !store) {
    return (
      <Card>
        <EmptyState icon={Store} title="No store assigned yet">
          <p className="mb-4">{error || "Contact an administrator to create a store for your owner account."}</p>
          <Button variant="ghost" onClick={load}><RefreshCw size={15} /> Try again</Button>
        </EmptyState>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Store settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          {store.name} · {store.status} · created {new Date(store.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Store details */}
        <Card className="p-6">
          <h2 className="font-semibold text-white mb-5">Store details</h2>
          <form onSubmit={saveSettings} className="space-y-4">
            <Field label="Store name" hint="required">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} required />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" hint="required">
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91..." maxLength={20} />
              </Field>
            </div>
            <Field label="Category">
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="SALON, REPAIR, ..." maxLength={100} />
            </Field>
            <Field label="Address" hint="required">
              <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={400} required />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={2000} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Latitude" hint="used for distance sorting">
                <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="12.9716" />
              </Field>
              <Field label="Longitude" hint="used for distance sorting">
                <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="77.5946" />
              </Field>
            </div>

            {notice && <Alert kind="success">{notice}</Alert>}
            {saveError && <Alert>{saveError}</Alert>}

            <Button type="submit" loading={saving}>
              <Save size={15} /> Save details
            </Button>
            <p className="text-xs text-slate-600">Owner id, store id and timestamps cannot be modified — they are managed by the platform.</p>
          </form>
        </Card>

        {/* Operating hours */}
        <Card className="p-6">
          <h2 className="font-semibold text-white mb-1 flex items-center gap-2">
            <Clock size={17} className="text-blue-400" /> Weekly operating hours
          </h2>
          <p className="text-xs text-slate-500 mb-5">
            Monday–Sunday. Set a day to <em>closed</em> by enabling the toggle. Bookings outside these windows are rejected.
          </p>

          <div className="space-y-2.5 mb-5">
            {hours.map((h) => (
              <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-3 bg-slate-800/50 rounded-xl px-3 py-2.5">
                <label className="w-24 text-sm font-medium text-slate-300 shrink-0">{h.name}</label>
                <label className="flex items-center gap-2 text-xs text-slate-400 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={h.closed}
                    onChange={(e) => updateHour(h.dayOfWeek, { closed: e.target.checked })}
                    className="accent-red-500"
                  />
                  Closed
                </label>
                <div className="flex items-center gap-2 ml-auto">
                  <Input
                    type="time"
                    disabled={h.closed}
                    value={h.openTime}
                    onChange={(e) => updateHour(h.dayOfWeek, { openTime: e.target.value })}
                    className="w-28"
                    aria-label={`${h.name} opening time`}
                  />
                  <span className="text-xs text-slate-600">to</span>
                  <Input
                    type="time"
                    disabled={h.closed}
                    value={h.closeTime}
                    onChange={(e) => updateHour(h.dayOfWeek, { closeTime: e.target.value })}
                    className="w-28"
                    aria-label={`${h.name} closing time`}
                  />
                </div>
              </div>
            ))}
          </div>

          {hoursNotice && <Alert kind="success" className="mb-4">{hoursNotice}</Alert>}
          {hoursError && <Alert className="mb-4">{hoursError}</Alert>}

          <Button onClick={saveHours} loading={savingHours}>
            <Clock size={15} /> Save operating hours
          </Button>
        </Card>
      </div>
    </div>
  );
}
