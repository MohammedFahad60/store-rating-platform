import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Store } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { Alert, Button, Field, Input, Textarea } from "../components/ui";

const PASSWORD_HINT = "8–16 characters, one uppercase letter and one special character";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", address: "" });
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [loading, setLoading] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const handleSubmit = async (e) => {
    e.preventDefault(); setError(""); setSuccess("");
    if (form.name.trim().length < 2) return setError("Please enter your full name");
    if (form.password !== form.confirmPassword) return setError("Passwords do not match");
    if (form.password.length < 8) return setError(`Password must be ${PASSWORD_HINT}`);
    setLoading(true);
    try { const { data } = await api.post("/auth/register", { name: form.name, email: form.email, password: form.password, address: form.address }); setSuccess(data.message || "Account created successfully"); setForm({ name: "", email: "", password: "", confirmPassword: "", address: "" }); setTimeout(() => navigate("/login"), 1200); }
    catch (err) { setError(apiErrorMessage(err, "Registration failed")); }
    finally { setLoading(false); }
  };
  return <div className="min-h-screen bg-slate-950 grid lg:grid-cols-[.84fr_1.16fr]">
    <aside className="hidden lg:flex p-12 xl:p-16 flex-col justify-between bg-[radial-gradient(circle_at_85%_15%,rgba(90,217,232,.11),transparent_30rem),#0d111a] border-r border-slate-800"><Link to="/login" className="flex items-center gap-3 w-fit text-slate-300 hover:text-white transition"><ArrowLeft size={16} /><span className="text-sm">Back to sign in</span></Link><div><span className="brand-mark w-11 h-11 rounded-xl grid place-items-center mb-7"><Store size={21} /></span><p className="section-kicker text-cyan-300 mb-4">Join the network</p><h2 className="text-4xl xl:text-5xl font-bold tracking-[-.06em] leading-[1.05] text-white">Make every local experience count.</h2><p className="text-slate-400 leading-relaxed mt-5 max-w-sm">Save your favorite businesses, request bookings in seconds, and share the details that help your community choose well.</p><div className="space-y-3 mt-8 text-sm text-slate-300"><p className="flex items-center gap-2"><Check size={15} className="text-cyan-300" /> One account for every booking</p><p className="flex items-center gap-2"><Check size={15} className="text-cyan-300" /> Helpful, verified reviews</p><p className="flex items-center gap-2"><Check size={15} className="text-cyan-300" /> No noise, just useful details</p></div></div><p className="text-xs text-slate-600">STORE · Experience platform</p></aside>
    <main className="flex items-center justify-center px-5 py-10 sm:px-8"><div className="w-full max-w-[500px] page-enter"><div className="lg:hidden flex items-center justify-between mb-12"><Link to="/login" className="text-slate-400 hover:text-white"><ArrowLeft size={19} /></Link><span className="brand-mark w-9 h-9 rounded-[11px] grid place-items-center"><Store size={18} /></span></div><div className="mb-8"><p className="section-kicker text-cyan-300 mb-3">Create your account</p><h1 className="text-3xl font-bold tracking-[-.045em] text-white">Start exploring</h1><p className="text-sm text-slate-400 mt-2">Discover stores, book services and share reviews.</p></div><form onSubmit={handleSubmit} className="premium-card p-6 sm:p-8 space-y-5" noValidate>{error && <Alert>{error}</Alert>}{success && <Alert kind="success">{success}</Alert>}<div className="grid sm:grid-cols-2 gap-5"><Field label="Full name"><Input autoComplete="name" placeholder="Aisha Khan" value={form.name} onChange={set("name")} /></Field><Field label="Email address"><Input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set("email")} /></Field></div><Field label="Password" hint={PASSWORD_HINT}><Input type="password" autoComplete="new-password" placeholder="Create a secure password" value={form.password} onChange={set("password")} /></Field><Field label="Confirm password"><Input type="password" autoComplete="new-password" placeholder="Repeat your password" value={form.confirmPassword} onChange={set("confirmPassword")} /></Field><Field label="Address" hint="optional"><Textarea autoComplete="street-address" placeholder="City, area..." value={form.address} onChange={set("address")} /></Field><Button type="submit" loading={loading} className="w-full" size="lg">Create account <ArrowRight size={16} /></Button></form><p className="text-center text-sm text-slate-400 mt-7">Already have an account? <Link to="/login" className="text-cyan-300 hover:text-white font-semibold transition">Sign in</Link></p></div></main>
  </div>;
}
