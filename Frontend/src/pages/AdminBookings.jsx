import { useEffect, useState } from "react";
import { CalendarClock, Search } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDate, formatDateTime, formatPrice } from "../utils/format";
import {
  Alert, Card, EmptyState, Input, Pagination, Select, Spinner, StatusBadge, Td, Th,
} from "../components/ui";

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REJECTED", label: "Rejected" },
];

const SORTS = [
  { value: "created", label: "Newest first" },
  { value: "date", label: "Booking date" },
  { value: "status", label: "Status" },
];

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const params = { page, limit: 10, sort };
        if (status) params.status = status;
        if (search.trim()) params.search = search.trim();
        const { data } = await api.get("/admin/bookings", { params });
        if (!active) return;
        setBookings(data.bookings || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load bookings"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [page, status, sort, search]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Bookings</h1>
        <p className="text-sm text-slate-400 mt-1">Read-only platform view of all bookings</p>
      </div>

      <Card className="p-4 mb-5">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search customer, store or service..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="md:w-44">
            {STATUS_FILTERS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
          </Select>
          <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="md:w-44">
            {SORTS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </Select>
        </div>
      </Card>

      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading bookings..." />
      ) : bookings.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarClock} title="No bookings found">
            Try different filters or search terms.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <Th>Customer</Th><Th>Store</Th><Th>Service</Th><Th>Date</Th>
                    <Th>Status</Th><Th className="text-right">Price</Th><Th>Created</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/40 transition">
                      <Td>
                        <p className="font-medium text-white">{b.customerName}</p>
                        <p className="text-xs text-slate-500">{b.customerEmail}</p>
                      </Td>
                      <Td>{b.storeName}</Td>
                      <Td>{b.serviceName}</Td>
                      <Td>
                        {formatDate(b.bookingDate)}
                        <p className="text-xs text-slate-500 mt-0.5">{b.startTime?.slice(0, 5)}</p>
                      </Td>
                      <Td><StatusBadge status={b.status} /></Td>
                      <Td className="text-right font-semibold text-slate-100">{formatPrice(b.price)}</Td>
                      <Td><span className="text-xs text-slate-500">{formatDateTime(b.createdAt)}</span></Td>
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
