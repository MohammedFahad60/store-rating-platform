import { useEffect, useState } from "react";
import { Star, Users, Wallet, Wrench, CalendarCheck, XCircle } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatPrice } from "../utils/format";
import { Alert, Card, Spinner, StatCard } from "../components/ui";
import { HBarList, SeriesBarChart } from "../components/Charts";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const STATUS_COLORS = {
  PENDING: "bg-amber-400",
  CONFIRMED: "bg-blue-400",
  IN_PROGRESS: "bg-violet-400",
  COMPLETED: "bg-emerald-400",
  CANCELLED: "bg-red-400",
  REJECTED: "bg-slate-500",
};

export default function OwnerAnalytics() {
  const [range, setRange] = useState("30");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noStore, setNoStore] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: res } = await api.get("/owner/analytics", { params: { range } });
        if (!active) return;
        setData(res);
        setNoStore(false);
        setError("");
      } catch (err) {
        if (!active) return;
        const msg = apiErrorMessage(err, "Failed to load analytics");
        if (err.response?.status === 404 && msg.includes("No store is assigned")) setNoStore(true);
        else setError(msg);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [range]);

  const m = data?.metrics || {};
  const dist = data?.bookingStatusDistribution || {};
  const distTotal = Object.values(dist).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Owner analytics</h1>
          <p className="text-sm text-slate-400 mt-1">
            {data?.store?.name ? `${data.store.name} · ` : ""}All figures are computed server-side from your store's data
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-full p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                range === r.value
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}
      {noStore && <Alert className="mb-4">No store is assigned to your owner account yet.</Alert>}

      {loading ? (
        <Spinner label="Crunching the numbers..." />
      ) : data ? (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            <StatCard label="Revenue (completed)" value={formatPrice(m.revenue)} icon={Wallet} accent="text-emerald-400" />
            <StatCard label="Bookings (created)" value={m.bookings} icon={CalendarCheck} accent="text-blue-400" sub={`${m.bookingsCompleted} completed · ${m.bookingsCancelled} cancelled`} />
            <StatCard label="Customers" value={m.customers} icon={Users} accent="text-violet-400" />
            <StatCard label="Average rating" value={m.averageRating > 0 ? m.averageRating : "—"} icon={Star} accent="text-amber-400" sub={`${m.totalRatings} reviews`} />
            <StatCard label="Services" value={m.totalServices} icon={Wrench} accent="text-cyan-400" sub={`${m.activeServices} active`} />
            <StatCard label="Cancelled" value={m.bookingsCancelled} icon={XCircle} accent="text-red-400" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <SeriesBarChart
              title="Bookings per day"
              subtitle={`New bookings created in the last ${range} days`}
              data={(data.series?.bookings || []).map((d) => ({ label: d.date.slice(5), value: d.count }))}
              accent="bg-blue-500/70"
            />
            <SeriesBarChart
              title="Revenue per day"
              subtitle="Completed bookings only"
              data={(data.series?.revenue || []).map((d) => ({ label: d.date.slice(5), value: d.revenue }))}
              valueFormat={formatPrice}
              accent="bg-emerald-500/70"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <h2 className="font-semibold text-white mb-4">Booking status distribution</h2>
              {distTotal === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">No bookings in this period</p>
              ) : (
                <div className="space-y-2.5">
                  {Object.entries(dist).map(([status, count]) => {
                    const pct = Math.round((count / distTotal) * 100);
                    return (
                      <div key={status} className="flex items-center gap-3 text-sm">
                        <span className="w-28 shrink-0 text-xs text-slate-400">{status.replace(/_/g, " ")}</span>
                        <div className="flex-1 h-2.5 rounded-full bg-slate-800 overflow-hidden">
                          <div className={`h-full rounded-full ${STATUS_COLORS[status] || "bg-slate-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 text-right text-xs text-slate-500 shrink-0">{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <HBarList
              title="Top services"
              subtitle="By completed booking count in this period"
              items={(data.topServices || []).map((s) => ({ label: s.name, value: s.bookings }))}
              valueFormat={(v) => `${v} bookings`}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
