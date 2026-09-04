import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Play, Search, Store, XCircle } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDate, formatPrice } from "../utils/format";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  Td,
  Th,
} from "../components/ui";

const FILTERS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REJECTED", label: "Rejected" },
];

const SORTS = [
  { value: "date", label: "Booking date" },
  { value: "created", label: "Created" },
  { value: "customer", label: "Customer" },
  { value: "status", label: "Status" },
];

// Mirror of the backend transition map (PENDING -> CONFIRMED/REJECTED, ...)
const NEXT_ACTIONS = {
  PENDING: [
    { to: "CONFIRMED", label: "Confirm", variant: "success", icon: CheckCircle2 },
    { to: "REJECTED", label: "Reject", variant: "ghost", icon: XCircle },
  ],
  CONFIRMED: [
    { to: "IN_PROGRESS", label: "Start", variant: "primary", icon: Play },
    { to: "CANCELLED", label: "Cancel", variant: "ghost", icon: XCircle },
  ],
  IN_PROGRESS: [
    { to: "COMPLETED", label: "Complete", variant: "success", icon: CheckCircle2 },
    { to: "CANCELLED", label: "Cancel", variant: "ghost", icon: XCircle },
  ],
};

export default function OwnerBookings() {
  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [noStore, setNoStore] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [order, setOrder] = useState("DESC");
  const [page, setPage] = useState(1);

  const fetchBookings = useCallback(async () => {
    const params = { page, limit: 10, sort, order };
    if (status) params.status = status;
    if (search.trim()) params.search = search.trim();
    const { data } = await api.get("/bookings/store", { params });
    return data;
  }, [status, search, sort, order, page]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchBookings();
        if (!active) return;
        setBookings(data.bookings || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setNoStore(false);
        setError("");
      } catch (err) {
        if (!active) return;
        const msg = apiErrorMessage(err, "Failed to load bookings");
        if (err.response?.status === 404 && msg.includes("No store is assigned")) setNoStore(true);
        else setError(msg);
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
      setNoStore(false);
    } catch (err) {
      const msg = apiErrorMessage(err, "Failed to load bookings");
      if (err.response?.status === 404 && msg.includes("No store is assigned")) setNoStore(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const transition = async (booking, to) => {
    setBusyId(booking.id);
    setError("");
    try {
      const { data } = await api.put(`/bookings/${booking.id}/status`, { status: to });
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: data.booking.status } : b)));
      setNotice(`${booking.customerName}'s booking marked as ${to.replace(/_/g, " ").toLowerCase()}`);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update the booking"));
    } finally {
      setBusyId(null);
    }
  };

  if (noStore) {
    return (
      <Card>
        <EmptyState icon={Store} title="No store assigned yet">
          <p>Contact an administrator to create a store for your owner account.</p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Bookings</h1>
          <p className="text-sm text-slate-400 mt-1">Requests for your store — confirm, start and complete them in order</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setStatus(f.value); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition border ${
              status === f.value
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="p-4 mb-5">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search customer, email or service..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="md:w-48">
            {SORTS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </Select>
          <Select value={order} onChange={(e) => { setOrder(e.target.value); setPage(1); }} className="md:w-40">
            <option value="DESC">Newest first</option>
            <option value="ASC">Oldest first</option>
          </Select>
        </div>
      </Card>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading bookings..." />
      ) : bookings.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarClock} title={`No ${status ? status.toLowerCase().replace(/_/g, " ") : ""} bookings`}>
            New customer requests will appear here.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <Th>Customer</Th>
                    <Th>Service</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Price</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/40 transition">
                      <Td>
                        <p className="font-medium text-white">{b.customerName}</p>
                        <p className="text-xs text-slate-500">{b.customerEmail}</p>
                      </Td>
                      <Td>
                        {b.serviceName}
                        {b.notes && (
                          <p className="text-xs text-slate-500 mt-0.5 max-w-52 truncate">“{b.notes}”</p>
                        )}
                      </Td>
                      <Td>
                        {formatDate(b.bookingDate)}
                        <p className="text-xs text-slate-500 mt-0.5">{b.startTime?.slice(0, 5)} · {b.estimatedMinutes} min</p>
                      </Td>
                      <Td><StatusBadge status={b.status} /></Td>
                      <Td className="text-right font-semibold text-slate-100">{formatPrice(b.price)}</Td>
                      <Td className="text-right">
                        <div className="inline-flex gap-1.5">
                          {(NEXT_ACTIONS[b.status] || []).map((action) => {
                            const Icon = action.icon;
                            return (
                              <Button
                                key={action.to}
                                variant={action.variant}
                                size="sm"
                                loading={busyId === b.id}
                                onClick={() => transition(b, action.to)}
                              >
                                <Icon size={13} /> {action.label}
                              </Button>
                            );
                          })}
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
    </div>
  );
}
