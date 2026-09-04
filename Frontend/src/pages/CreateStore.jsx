import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Store as StoreIcon } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { Alert, Button, Card, Field, Input, Select, Spinner, Textarea } from "../components/ui";

const CATEGORIES = ["SALON", "REPAIR", "FITNESS", "PHOTOGRAPHY", "CLEANING", "AUTO CARE"];

export default function CreateStore() {
  const navigate = useNavigate();
  const [owners, setOwners] = useState([]);
  const [takenOwnerIds, setTakenOwnerIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: "",
    email: "",
    address: "",
    phone: "",
    category: "",
    description: "",
    ownerId: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [usersRes, storesRes] = await Promise.all([
          api.get("/admin/users"),
          api.get("/admin/stores"),
        ]);
        setOwners((usersRes.data.users || []).filter((u) => u.role === "OWNER"));
        setTakenOwnerIds(new Set((storesRes.data.stores || []).map((s) => s.ownerId)));
      } catch (err) {
        setError(apiErrorMessage(err, "Failed to load owners"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const availableOwners = owners.filter((o) => !takenOwnerIds.has(o.id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post("/admin/stores", form);
      setSaving(false);
      navigate("/admin/stores");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create the store"));
      setSaving(false);
    }
  };

  if (loading) return <Spinner label="Loading owners..." />;

  return (
    <div className="max-w-xl">
      <Link to="/admin/stores" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-5 transition">
        <ArrowLeft size={15} /> Back to stores
      </Link>

      <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2.5">
        <StoreIcon size={22} className="text-blue-400" /> Create store
      </h1>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}

          <Field label="Owner account" hint="owners without a store">
            <Select value={form.ownerId} onChange={set("ownerId")}>
              <option value="">Select an owner...</option>
              {availableOwners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.email})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Store name">
            <Input placeholder="e.g. Glow & Groom Salon" value={form.name} onChange={set("name")} maxLength={100} />
          </Field>

          <Field label="Store email">
            <Input type="email" placeholder="contact@store.com" value={form.email} onChange={set("email")} />
          </Field>

          <Field label="Category">
            <Select value={form.category} onChange={set("category")}>
              <option value="">Select a category...</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>

          <Field label="Address">
            <Input placeholder="Street, area, city" value={form.address} onChange={set("address")} maxLength={400} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" hint="optional">
              <Input placeholder="98XXXXXXXX" value={form.phone} onChange={set("phone")} maxLength={20} />
            </Field>
          </div>

          <Field label="Description" hint="optional">
            <Textarea placeholder="What makes this store special?" value={form.description} onChange={set("description")} />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={saving}>
              <StoreIcon size={15} /> Create store
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/admin/stores")}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
