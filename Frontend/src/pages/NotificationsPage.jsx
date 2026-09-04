import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDateTime } from "../utils/format";
import { Alert, Button, Card, EmptyState, Pagination, Spinner } from "../components/ui";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchNotifications = useCallback(async (page = 1) => {
    const { data } = await api.get("/notifications", { params: { page, limit: 15 } });
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchNotifications(1);
        if (!active) return;
        setItems(data.notifications || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setUnreadCount(data.unreadCount || 0);
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load notifications"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fetchNotifications]);

  const load = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchNotifications(page);
      setItems(data.notifications || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load notifications"));
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (n) => {
    if (n.read) return;
    try {
      await api.put(`/notifications/${n.id}/read`);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // best effort
    }
  };

  const markAll = async () => {
    try {
      await api.put("/notifications/read-all");
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnreadCount(0);
      setNotice("All notifications marked as read");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not mark notifications as read"));
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-sm text-slate-400 mt-1">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" onClick={markAll}>
            <CheckCheck size={15} /> Mark all read
          </Button>
        )}
      </div>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading notifications..." />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={Bell} title="No notifications">
            Updates about your bookings, reviews and stores will appear here.
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-800">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => markRead(n)}
                  className={`w-full text-left px-5 py-4 transition hover:bg-slate-800/40 ${n.read ? "opacity-60" : "bg-blue-500/5"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    <span className="text-[11px] text-slate-600 shrink-0">{formatDateTime(n.createdAt)}</span>
                  </div>
                  {n.message && <p className="text-sm text-slate-400 mt-1 leading-relaxed">{n.message}</p>}
                  {!n.read && <span className="inline-block mt-1.5 h-2 w-2 rounded-full bg-blue-400" />}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(pg) => load(pg)} />
    </div>
  );
}
