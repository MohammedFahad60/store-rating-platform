import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "../components/ui";

const PASSWORD_HINT = "8-16 characters, at least one uppercase letter and one special character";

export default function CreateUser() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    address: "",
    role: "USER",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const { data } = await api.post("/admin/users", form);
      setSuccess(`${data.user?.name || "User"} created successfully`);
      setForm({ name: "", email: "", password: "", address: "", role: "USER" });
      setTimeout(() => navigate("/admin/users"), 1000);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create the user"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-5 transition">
        <ArrowLeft size={15} /> Back to users
      </Link>

      <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2.5">
        <UserPlus size={22} className="text-blue-400" /> Create user
      </h1>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          {success && <Alert kind="success">{success}</Alert>}

          <Field label="Full name">
            <Input placeholder="e.g. Rahul Sharma" value={form.name} onChange={set("name")} maxLength={60} />
          </Field>

          <Field label="Email address">
            <Input type="email" placeholder="user@example.com" value={form.email} onChange={set("email")} />
          </Field>

          <Field label="Role">
            <Select value={form.role} onChange={set("role")}>
              <option value="USER">Customer (USER)</option>
              <option value="OWNER">Store owner (OWNER)</option>
              <option value="ADMIN">Administrator (ADMIN)</option>
            </Select>
          </Field>

          <Field label="Temporary password" hint={PASSWORD_HINT}>
            <Input
              type="text"
              autoComplete="off"
              placeholder="e.g. Welcome@123"
              value={form.password}
              onChange={set("password")}
            />
          </Field>

          <Field label="Address" hint="optional">
            <Textarea placeholder="City, area..." value={form.address} onChange={set("address")} maxLength={400} />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              <UserPlus size={15} /> Create user
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/admin/users")}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
