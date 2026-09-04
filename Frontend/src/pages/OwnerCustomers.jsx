import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Mail, Phone, Search, Store, Users } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDate, formatDateTime, formatPrice } from "../utils/format";
import {
  Alert, Button, Card, EmptyState, Input, Modal, Pagination, Spinner, StatusBadge, Stars, Td, Th,
} from "../components/ui";

export default function OwnerCustomers() {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [noStore, setNoStore] = useState(false);

  const [detail, setDetail] = useState(null); // customer object
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const fetchCustomers = useCallback(async () => {
    const params = { page, limit: 10 };
    if (search.trim()) params.search = search.trim();
    const { data } = await api.get("/owner/customers", { params });
    return data;
  }, [page, search]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchCustomers();
        if (!active) return;
        setCustomers(data.customers || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setNoStore(false);
        setError("");
      } catch (err) {
        if (!active) return;
        const msg = apiErrorMessage(err, "Failed to load customers");
        if (err.response?.status === 404 && msg.includes("No store is assigned")) setNoStore(true);
        else setError(msg);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fetchCustomers]);

  const openDetail = async (customer) => {
    setDetail(customer);
    setDetailData(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/owner/customers/${customer.id}`);
      setDetailData(data.customer);
    } catch (err) {
      setDetailError(apiErrorMessage(err, "Could not load customer details"));
    } finally {
      setDetailLoading(false);
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Customers</h1>
        <p className="text-sm text-slate-400 mt-1">People who have booked at your store — you only see your own customers</p>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      <Card className="p-4 mb-5">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            className="pl-9"
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </Card>

      {loading ? (
        <Spinner label="Loading customers..." />
      ) : customers.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No customers found">
            Customers appear here after their first booking at your store.
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
                    <Th>Contact</Th>
                    <Th className="text-right">Bookings</Th>
                    <Th className="text-right">Completed</Th>
                    <Th className="text-right">Spent</Th>
                    <Th>Avg rating given</Th>
                    <Th>Last booking</Th>
                    <Th className="text-right">View</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition">
                      <Td className="font-medium text-white">{c.name}</Td>
                      <Td>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Mail size={11} /> {c.email}</p>
                        {c.phone && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5"><Phone size={11} /> {c.phone}</p>}
                      </Td>
                      <Td className="text-right text-slate-200">{c.bookingCount}</Td>
                      <Td className="text-right text-slate-200">{c.completedBookings}</Td>
                      <Td className="text-right font-semibold text-slate-100">{formatPrice(c.totalSpending)}</Td>
                      <Td>{c.averageRatingGiven != null ? <Stars value={c.averageRatingGiven} size={12} /> : <span className="text-xs text-slate-600">—</span>}</Td>
                      <Td>
                        {c.lastBooking ? (
                          <div>
                            <p className="text-xs text-slate-300">{formatDateTime(c.lastBooking.at)}</p>
                            <StatusBadge status={c.lastBooking.status} />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(c)}>Details</Button>
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

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ? `Customer — ${detail.name}` : "Customer"}
        size="lg"
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>}
      >
        {detailError && <Alert className="mb-4">{detailError}</Alert>}
        {detailLoading ? (
          <Spinner label="Loading customer details..." />
        ) : detailData ? (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-3 text-sm text-slate-400">
              <p className="flex items-center gap-2"><Mail size={14} className="text-slate-500" /> {detailData.email}</p>
              <p className="flex items-center gap-2"><Phone size={14} className="text-slate-500" /> {detailData.phone || "—"}</p>
              {detailData.address && <p className="sm:col-span-2">{detailData.address}</p>}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <CalendarClock size={15} className="text-blue-400" /> Booking history ({detailData.bookingHistory?.length || 0})
              </h3>
              {detailData.bookingHistory?.length === 0 ? (
                <p className="text-sm text-slate-500">No bookings at your store.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {detailData.bookingHistory.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3 bg-slate-800/50 rounded-lg px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-slate-200 truncate">{b.serviceName}</p>
                        <p className="text-xs text-slate-500">{formatDate(b.bookingDate)} {b.startTime?.slice(0, 5)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-slate-300">{formatPrice(b.price)}</span>
                        <StatusBadge status={b.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Reviews at your store ({detailData.reviews?.length || 0})</h3>
              {detailData.reviews?.length === 0 ? (
                <p className="text-sm text-slate-500">No reviews yet.</p>
              ) : (
                <div className="space-y-2">
                  {detailData.reviews.map((r) => (
                    <div key={r.id} className="bg-slate-800/50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Stars value={r.rating} size={12} />
                        <StatusBadge status={r.status} />
                      </div>
                      {r.comment && <p className="text-sm text-slate-400 mt-1">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
