import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, CalendarClock, ChevronDown, Heart, KeyRound, LayoutDashboard, LogOut,
  Menu, MessageSquare, PlusCircle, ScrollText, Settings, Store, UserCircle, Users,
  Wrench, X, ShieldCheck,
} from "lucide-react";
import { getUser, clearSession } from "../utils/auth";
import { initials as avatarInitials } from "../utils/format";
import NotificationBell from "./NotificationBell";

const NAV_ITEMS = {
  ADMIN: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/users/new", label: "New user", icon: PlusCircle },
    { to: "/admin/stores", label: "Stores", icon: Store },
    { to: "/admin/stores/new", label: "New store", icon: PlusCircle },
    { to: "/admin/bookings", label: "Bookings", icon: CalendarClock },
    { to: "/admin/reviews", label: "Reviews", icon: MessageSquare },
    { to: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
  ],
  OWNER: [
    { to: "/owner", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/owner/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/owner/services", label: "Services", icon: Wrench },
    { to: "/owner/bookings", label: "Bookings", icon: CalendarClock },
    { to: "/owner/customers", label: "Customers", icon: Users },
    { to: "/owner/settings", label: "Store settings", icon: Settings },
  ],
  USER: [
    { to: "/customer", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/stores", label: "Discover stores", icon: Store },
    { to: "/my-bookings", label: "My bookings", icon: CalendarClock },
    { to: "/favorites", label: "Favorites", icon: Heart },
    { to: "/profile", label: "Profile", icon: UserCircle },
  ],
};

const ROLE_LABELS = { ADMIN: "Administrator", OWNER: "Store owner", USER: "Customer" };

function Brand() {
  return <Link to="/" className="flex items-center gap-3 shrink-0 group" aria-label="STORE home">
    <span className="brand-mark w-9 h-9 rounded-[11px] flex items-center justify-center transition-transform group-hover:rotate-[-4deg]"><Store size={18} className="text-white" /></span>
    <span className="leading-tight"><span className="block font-bold text-[15px] tracking-[.16em] text-white">STORE</span><span className="block text-[10px] text-slate-500 tracking-wide mt-0.5">Experience platform</span></span>
  </Link>;
}

function UserMenu() {
  const navigate = useNavigate();
  const user = getUser() || {};
  const [open, setOpen] = useState(false);
  const logout = () => { clearSession(); navigate("/login"); };
  return <div className="relative flex items-center gap-2">
    <NotificationBell />
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl border border-transparent hover:border-slate-700 hover:bg-slate-800/60 transition" aria-expanded={open} aria-haspopup="menu">
      <span className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-violet-400 to-indigo-700 text-white text-xs font-bold flex items-center justify-center shadow-inner">{avatarInitials(user.name || "User")}</span>
      <span className="hidden sm:block text-left leading-tight max-w-28"><span className="block text-xs font-semibold text-slate-200 truncate">{user.name}</span><span className="block text-[10px] text-slate-500 truncate">{ROLE_LABELS[user.role] || user.role}</span></span>
      <ChevronDown size={14} className={`hidden sm:block text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <>
      <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-label="Close account menu" />
      <div className="absolute right-0 top-full mt-2 z-50 w-56 p-1.5 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/30 animate-[modal-in_.2s_ease_both]" role="menu">
        <div className="px-3 py-2.5 border-b border-slate-800 mb-1.5"><p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p><p className="text-[11px] text-slate-500 truncate mt-0.5">{user.email}</p></div>
        {user.role === "USER" && <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition" role="menuitem"><UserCircle size={15} /> Profile</Link>}
        <Link to="/change-password" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition" role="menuitem"><KeyRound size={15} /> Change password</Link>
        <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-red-300 hover:bg-red-500/10 transition" role="menuitem"><LogOut size={15} /> Sign out</button>
      </div>
    </>}
  </div>;
}

function Navigation({ items, mobile = false, onNavigate }) {
  return <nav className={mobile ? "flex flex-col gap-1" : "space-y-1"} aria-label="Primary navigation">
    {items.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""} ${mobile ? "px-3.5" : ""}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></NavLink>)}
    {mobile && <NavLink to="/change-password" onClick={onNavigate} className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}><KeyRound size={17} strokeWidth={1.8} /><span>Change password</span></NavLink>}
  </nav>;
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const role = getUser()?.role || "";
  const items = NAV_ITEMS[role] || [];
  return <div className="app-shell">
    <header className="app-topbar sticky top-0 z-40">
      <div className="h-full max-w-[1600px] mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><button className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800 transition" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? "Close menu" : "Open menu"}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button><Brand /></div>
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} className="text-emerald-400" /> Secure workspace</div>
        <UserMenu />
      </div>
      {mobileOpen && <div className="lg:hidden absolute top-full left-0 right-0 border-b border-slate-800 bg-slate-900/98 p-3 mobile-drawer"><Navigation items={items} mobile onNavigate={() => setMobileOpen(false)} /></div>}
    </header>
    <div className="flex max-w-[1600px] mx-auto">
      <aside className="app-sidebar hidden lg:block shrink-0 min-h-[calc(100vh-72px)] px-3 py-6"><div className="px-3 mb-4"><p className="section-kicker">Workspace</p><p className="text-xs text-slate-500 mt-1">{ROLE_LABELS[role] || "Account"}</p></div><Navigation items={items} /></aside>
      <main className="app-main flex-1"><div key={location.pathname} className="content-wrap page-enter"><Outlet /></div><footer className="px-6 pb-8 text-center text-[11px] text-slate-600">STORE · A better way to discover, book and grow</footer></main>
    </div>
  </div>;
}
