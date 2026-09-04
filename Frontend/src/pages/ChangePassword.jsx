import { useState } from "react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { Alert, Button, Card, Field, Input, PageHeader } from "../components/ui";

const PASSWORD_HINT = "8-16 characters with at least one uppercase letter and one special character";

export default function ChangePassword() {
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.oldPassword) return setError("Current password is required");
    if (form.newPassword.length < 8) return setError(`New password must be ${PASSWORD_HINT}`);
    if (form.newPassword !== form.confirmPassword) return setError("New passwords do not match");

    setLoading(true);
    try {
      const { data } = await api.put("/auth/change-password", {
        oldPassword: form.oldPassword,
        newPassword: form.newPassword,
      });
      setSuccess(data.message || "Password updated successfully");
      setForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update password"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="Change password" subtitle="Use a strong password you don't use anywhere else" />

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          {success && <Alert kind="success">{success}</Alert>}

          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.oldPassword}
              onChange={set("oldPassword")}
            />
          </Field>

          <Field label="New password" hint={PASSWORD_HINT}>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.newPassword}
              onChange={set("newPassword")}
            />
          </Field>

          <Field label="Confirm new password">
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={set("confirmPassword")}
            />
          </Field>

          <div className="pt-2">
            <Button type="submit" loading={loading}>
              Update password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
