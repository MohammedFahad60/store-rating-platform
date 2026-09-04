import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Star } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDateTime } from "../utils/format";
import { Alert, Button, Card, Field, Input, PageHeader, Spinner, Stars, Textarea } from "../components/ui";

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "" });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [profileRes, reviewsRes] = await Promise.all([
          api.get("/users/profile"),
          api.get("/ratings/my?limit=20"),
        ]);
        if (!active) return;
        const user = profileRes.data.user;
        setProfile(user);
        setForm({
          name: user.name || "",
          email: user.email || "",
          phone: user.phone || "",
          address: user.address || "",
        });
        setReviews(reviewsRes.data.ratings || []);
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load profile"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const { data } = await api.put("/users/profile", form);
      setProfile(data.user);
      setNotice(data.message || "Profile updated successfully");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update profile"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner label="Loading profile..." />;

  return (
    <div className="max-w-4xl">
      <PageHeader title="My profile" subtitle="Manage your account details, reviews and security" />

      {error && <Alert className="mb-4">{error}</Alert>}
      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold text-white mb-4">Account details</h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name">
                <Input value={form.name} onChange={set("name")} maxLength={60} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={set("email")} />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Phone" hint="optional">
                <Input value={form.phone} onChange={set("phone")} maxLength={20} />
              </Field>
              <Field label="Address" hint="optional">
                <Textarea value={form.address} onChange={set("address")} maxLength={400} rows={2} />
              </Field>
            </div>
            <p className="text-xs text-slate-500">Your role and account id cannot be changed.</p>
            <Button type="submit" loading={saving}>Save changes</Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <KeyRound size={16} className="text-blue-400" /> Security
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Changing your password signs you out of every active session.
          </p>
          <Link to="/change-password">
            <Button variant="secondary" className="w-full">Change password</Button>
          </Link>
          <p className="text-xs text-slate-600 mt-4">Member since {formatDateTime(profile?.createdAt)}</p>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Star size={17} className="text-amber-400" /> My reviews ({reviews.length})
          </h2>
        </div>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500 px-5 py-8 text-center">You have not submitted any reviews yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {reviews.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/stores/${r.storeId}`} className="text-sm font-medium text-white hover:text-blue-300">
                    {r.store?.name || "Store"}
                  </Link>
                  <Stars value={r.rating} size={13} />
                </div>
                {r.comment && <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{r.comment}</p>}
                <p className="text-[11px] text-slate-600 mt-1">{formatDateTime(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
