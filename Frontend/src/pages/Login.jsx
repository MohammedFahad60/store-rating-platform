import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, ShieldCheck, Sparkles, Store } from "lucide-react";
import api from "../services/api";
import { saveSession, homePathForRole } from "../utils/auth";
import { apiErrorMessage } from "../utils/errors";
import { Alert, Button, Field, Input } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault(); setError("");
    if (!form.email.trim() || !form.password) { setError("Email and password are required"); return; }
    setLoading(true);
    try { const { data } = await api.post("/auth/login", form); saveSession(data); navigate(homePathForRole(data.role), { replace: true }); }
    catch (err) { setError(apiErrorMessage(err, "Login failed. Check your credentials.")); }
    finally { setLoading(false); }
  };

  return <div className="min-h-screen bg-slate-950 grid lg:grid-cols-[1.05fr_.95fr]">
    <section className="hidden lg:flex relative overflow-hidden p-12 xl:p-16 flex-col justify-between bg-[radial-gradient(circle_at_20%_20%,rgba(124,108,255,.22),transparent_34rem),linear-gradient(145deg,#10152a,#080b12_70%)] border-r border-slate-800">
      <Link to="/" className="flex items-center gap-3 w-fit"><span className="brand-mark w-10 h-10 rounded-xl grid place-items-center"><Store size={20} /></span><span className="font-bold tracking-[.18em]">STORE</span></Link>
      <div className="relative z-10 max-w-xl"><p className="section-kicker text-violet-300 mb-5">The service marketplace for real life</p><h2 className="text-5xl xl:text-6xl font-bold leading-[1.05] tracking-[-.06em] text-white">Find your next <span className="text-violet-300">favorite place.</span></h2><p className="text-base text-slate-400 leading-relaxed mt-6 max-w-md">A considered way to discover trusted local businesses, book confidently, and keep every experience in one place.</p><div className="flex flex-wrap gap-3 mt-9"><span className="inline-flex items-center gap-2 text-xs text-slate-300 bg-white/[.05] border border-white/10 rounded-full px-3 py-2"><Check size={13} className="text-emerald-300" /> Curated local services</span><span className="inline-flex items-center gap-2 text-xs text-slate-300 bg-white/[.05] border border-white/10 rounded-full px-3 py-2"><ShieldCheck size={13} className="text-cyan-300" /> Secure bookings</span></div></div>
      <p className="text-xs text-slate-600">© STORE · Built for better local commerce</p>
      <div className="absolute -right-32 top-1/3 w-96 h-96 rounded-full border border-violet-400/10 shadow-[0_0_120px_rgba(124,108,255,.12)]" /><div className="absolute right-24 bottom-20 w-32 h-32 rounded-full bg-cyan-300/10 blur-3xl" />
    </section>
    <main className="flex items-center justify-center px-5 py-10 sm:px-8">
      <div className="w-full max-w-[430px] page-enter"><div className="lg:hidden flex items-center gap-3 mb-14"><span className="brand-mark w-9 h-9 rounded-[11px] grid place-items-center"><Store size={18} /></span><span className="font-bold tracking-[.18em]">STORE</span></div>
        <div className="mb-8"><div className="w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-400/20 grid place-items-center mb-5"><Sparkles size={20} className="text-violet-300" /></div><h1 className="text-3xl font-bold tracking-[-.045em] text-white">Welcome back</h1><p className="text-sm text-slate-400 mt-2">Sign in to continue to your workspace.</p></div>
        <form onSubmit={handleSubmit} className="premium-card p-6 sm:p-7 space-y-5" noValidate>{error && <Alert>{error}</Alert>}<Field label="Email address"><Input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set("email")} /></Field><Field label="Password"><Input type="password" autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={set("password")} /></Field><Button type="submit" loading={loading} className="w-full" size="lg">Sign in <ArrowRight size={16} /></Button><div className="flex items-center gap-3 text-[11px] text-slate-500"><span className="h-px bg-slate-800 flex-1" />Secure access<span className="h-px bg-slate-800 flex-1" /></div></form>
        <p className="text-center text-sm text-slate-400 mt-7">New to STORE? <Link to="/register" className="text-violet-300 hover:text-white font-semibold transition">Create an account</Link></p>
        <details className="mt-8 group"><summary className="cursor-pointer text-center text-xs text-slate-600 hover:text-slate-400 transition list-none">Demo accounts <span className="group-open:hidden">＋</span><span className="hidden group-open:inline">−</span></summary><div className="mt-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-500 leading-relaxed"><p>Admin: admin@storerating.com · Owner: owner1@storerating.com · Customer: aisha@gmail.com</p><p className="mt-1">Passwords: Admin@123 / Owner@123 / User@123</p></div></details>
      </div>
    </main>
  </div>;
}
