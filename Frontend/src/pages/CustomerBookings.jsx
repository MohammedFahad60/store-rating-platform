import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, MapPin, MessageSquare, Search, XCircle, Eye } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDate, formatPrice } from "../utils/format";
import RatingModal from "../components/RatingModal";
import {
  Alert, Button, Card, ConfirmDialog, EmptyState, Input, Pagination,
  Select, Spinner, StatusBadge, Td, Th,
} from "../components/ui";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "UPCOMING", label: "Upcoming" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function CustomerBookings() {
  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [rateTarget, setRateTarget] = useState(null);

  const fetchBookings = useCallback(async () => {
    const params = { page, limit: 10 };
    if (status) params.status = status;
    if (search.trim()) params.search = search.trim();
    const { data } = await api.get("/bookings/my", { params });
    return data;
  }, [page, status, search]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchBookings();
        if (!active) return;
        setBookings(data.bookings || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load your bookings"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fetchBookings]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchBookings();
      setBookings(data.bookings || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load your bookings"));
    } finally {
      setLoading(false);
    }
  };

  const confirmCancel = async () => {
    setCancelBusy(true);
    try {
      await api.put(`/bookings/${cancelTarget.id}/cancel`);
      setNotice("Booking cancelled successfully");
      setCancelTarget(null);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not cancel the booking"));
    } finally {
      setCancelBusy(false);
    }
  };

  const openRate = (booking) => setRateTarget({ storeId: booking.storeId, storeName: booking.storeName });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">My bookings</h1>
        <p className="text-sm text-slate-400 mt-1">Track your service requests and leave reviews after completion</p>
      </div>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      <Card className="p-4 mb-5">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search store or service"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="md:w-44">
            {STATUS_FILTERS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
          </Select>
        </div>
      </Card>

      {loading ? (
        <Spinner label="Loading bookings..." />
      ) : bookings.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarClock} title="No bookings found">
            <Link to="/stores" className="text-blue-400 hover:text-blue-300 font-medium">
              Browse stores and book your first service
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            {/* Mobile list */}
            {bookings.map((b) => (
              <div key={b.id} className="flex sm:hidden items-center justify-between gap-3 px-4 py-4 border-b border-slate-800 last:border-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/bookings/${b.id}`} className="font-semibold text-white truncate hover:text-blue-300">
                      {b.storeName}
                    </Link>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="text-sm text-slate-400 mt-1 truncate">{b.serviceName}</p>
                  <p className="text-xs text-slate-500 mt-1">{formatDate(b.bookingDate)} {b.startTime?.slice(0, 5)} · {formatPrice(b.price)}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {b.status === "PENDING" && <Button variant="ghost" size="sm" onClick={() => setCancelTarget(b)}>Cancel</Button>}
                  {b.status === "COMPLETED" && <Button size="sm" onClick={() => openRate(b)}>Rate</Button>}
                </div>
              </div>
            ))}

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <Th>Store</Th><Th>Service</Th><Th>Date & time</Th><Th>Status</Th>
                    <Th className="text-right">Price</Th><Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/40 transition">
                      <Td>
                        <Link to={`/bookings/${b.id}`} className="text-white font-medium hover:text-blue-300">{b.storeName}</Link>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><MapPin size={11} /> {b.storeAddress || "—"}</p>
                      </Td>
                      <Td>
                        {b.serviceName}
                        {b.notes && <p className="text-xs text-slate-500 mt-0.5 max-w-56 truncate">“{b.notes}”</p>}
                      </Td>
                      <Td>
                        {formatDate(b.bookingDate)} {b.startTime?.slice(0, 5)}
                        {b.estimatedMinutes && <p className="text-xs text-slate-500 mt-0.5">{b.estimatedMinutes} min</p>}
                      </Td>
                      <Td><StatusBadge status={b.status} /></Td>
                      <Td className="text-right font-semibold text-slate-100">{formatPrice(b.price)}</Td>
                      <Td className="text-right">
                        <div className="inline-flex gap-2">
                          {b.status === "PENDING" && (
                            <Button variant="ghost" size="sm" onClick={() => setCancelTarget(b)}>
                              <XCircle size={14} /> Cancel
                            </Button>
                          )}
                          {b.status === "COMPLETED" && (
                            <Button size="sm" onClick={() => openRate(b)}>
                              <MessageSquare size={14} /> Rate
                            </Button>
                          )}
                          <Link to={`/bookings/${b.id}`}>
                            <Button variant="ghost" size="sm"><Eye size={14} /> View</Button>
                          </Link>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this booking?"
        message={`This will cancel your ${cancelTarget?.serviceName} booking at ${cancelTarget?.storeName} on ${formatDate(cancelTarget?.bookingDate)}.`}
        confirmLabel="Cancel booking"
        danger
        loading={cancelBusy}
        onConfirm={confirmCancel}
        onClose={() => setCancelTarget(null)}
      />

      <RatingModal
        open={Boolean(rateTarget)}
        storeId={rateTarget?.storeId}
        storeName={rateTarget?.storeName}
        onClose={() => setRateTarget(null)}
        onSubmitted={() => { setRateTarget(null); setNotice("Rating submitted. Thank you for your feedback!"); load(); }}
      />
    </div>
  );
}
