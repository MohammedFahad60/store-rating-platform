import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import api from "../services/api";
import { formatDateTime } from "../utils/format";
import { Skeleton } from "./ui";

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshUnread = async () => {
    try {
      const { data } = await api.get("/notifications/unread-count");
      setUnreadCount(data.unreadCount || 0);
    } catch { /* best effort */ }
  };

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await api.get("/notifications/unread-count");
        if (active) setUnreadCount(data.unreadCount || 0);
      } catch { /* best effort */ }
    };
    refresh();
    window.addEventListener("store-rating:data-changed", refresh);
    const timer = setInterval(refresh, 60000);
    return () => { active = false; window.removeEventListener("store-rating:data-changed", refresh); clearInterval(timer); };
  }, []);

  const toggle = async () => {
    setOpen((prev) => !prev);
    if (!open) {
      setLoading(true);
      try { const { data } = await api.get("/notifications?limit=8"); setItems(data.notifications || []); } catch { setItems([]); } finally { setLoading(false); }
      refreshUnread();
    }
  };

  const markAllRead = async () => {
    try { await api.put("/notifications/read-all"); setItems((prev) => prev.map((n) => ({ ...n, read: true }))); setUnreadCount(0); } catch { /* best effort */ }
  };

  return <div className="relative">
    <button onClick={toggle} title="Notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={open} className="relative p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition">
      <Bell size={17} />
      {unreadCount > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-[var(--canvas)]">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </button>
    {open && <>
      <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-label="Close notifications" />
      <div className="absolute right-0 mt-2 w-[min(90vw,380px)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden animate-[modal-in_.2s_ease_both]">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800"><div><p className="text-sm font-semibold text-white">Notifications</p><p className="text-[11px] text-slate-500 mt-0.5">Your latest workspace activity</p></div><div className="flex items-center gap-3">{unreadCount > 0 && <button onClick={markAllRead} className="inline-flex items-center gap-1 text-[11px] text-blue-300 hover:text-white transition"><CheckCheck size={13} /> Mark read</button>}<Link to="/notifications" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-white transition">View all</Link></div></div>
        <div className="max-h-96 overflow-y-auto">
          {loading ? <div className="p-4 space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : items.length === 0 ? <div className="py-10 text-center"><Inbox size={22} className="mx-auto text-slate-600 mb-2" /><p className="text-sm text-slate-500">No notifications yet</p></div> : items.map((n) => <div key={n.id} className={`px-4 py-3.5 border-b border-slate-800/70 last:border-0 hover:bg-slate-800/40 transition ${n.read ? "opacity-60" : ""}`}><p className="text-sm font-medium text-slate-200">{n.title}</p>{n.message && <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{n.message}</p>}<p className="text-[10px] text-slate-600 mt-1.5">{formatDateTime(n.createdAt)}</p></div>)}
        </div>
      </div>
    </>}
  </div>;
}
