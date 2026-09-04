import { useEffect, useState } from "react";
import { Eye, EyeOff, MessageSquare, Search } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDateTime } from "../utils/format";
import {
  Alert, Button, Card, ConfirmDialog, EmptyState, Input, Pagination, Select, Spinner, Stars, Td, Th,
} from "../components/ui";

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "VISIBLE", label: "Visible" },
  { value: "HIDDEN", label: "Hidden" },
];

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [rating, setRating] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [target, setTarget] = useState(null); // review to moderate

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const params = { page, limit: 10 };
        if (search.trim()) params.search = search.trim();
        if (status) params.status = status;
        if (rating) params.rating = rating;
        const { data } = await api.get("/admin/reviews", { params });
        if (!active) return;
        setReviews(data.reviews || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load reviews"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [page, status, rating, search]);

  const moderate = async () => {
    const next = target.status === "HIDDEN" ? "VISIBLE" : "HIDDEN";
    setBusyId(target.id);
    setError("");
    try {
      const { data } = await api.put(`/admin/reviews/${target.id}/status`, { status: next });
      setReviews((prev) => prev.map((r) => (r.id === target.id ? { ...r, status: data.review.status } : r)));
      setNotice(data.message || "Review updated");
      setTarget(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not moderate the review"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Review moderation</h1>
        <p className="text-sm text-slate-400 mt-1">Hide or restore reviews — reviews are never permanently deleted</p>
      </div>

      <Card className="p-4 mb-5">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search comment or owner reply..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="md:w-44">
            {STATUS_FILTERS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
          </Select>
          <Select value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }} className="md:w-40">
            <option value="">Any rating</option>
            {[5, 4, 3, 2, 1].map((r) => (<option key={r} value={r}>{r} star{r > 1 ? "s" : ""}</option>))}
          </Select>
        </div>
      </Card>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading reviews..." />
      ) : reviews.length === 0 ? (
        <Card>
          <EmptyState icon={MessageSquare} title="No reviews found">
            Try different filters.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <Th>Customer</Th><Th>Store</Th><Th>Rating</Th><Th>Review</Th>
                    <Th>Status</Th><Th>Date</Th><Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {reviews.map((r) => (
                    <tr key={r.id} className={`hover:bg-slate-800/40 transition ${r.status === "HIDDEN" ? "opacity-70" : ""}`}>
                      <Td>
                        <p className="font-medium text-white">{r.userName}</p>
                        <p className="text-xs text-slate-500">{r.userEmail}</p>
                      </Td>
                      <Td>{r.storeName}</Td>
                      <Td><Stars value={r.rating} size={13} /></Td>
                      <Td className="max-w-md">
                        {r.comment ? <p className="text-sm text-slate-300 line-clamp-2">{r.comment}</p> : <span className="text-xs text-slate-600">No comment</span>}
                        {r.ownerReply && <p className="text-xs text-slate-500 mt-1 line-clamp-1">Reply: {r.ownerReply}</p>}
                      </Td>
                      <Td>
                        <span className={`text-[11px] font-bold tracking-wider rounded-full px-2.5 py-1 ${r.status === "VISIBLE" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                          {r.status}
                        </span>
                      </Td>
                      <Td><span className="text-xs text-slate-500">{formatDateTime(r.createdAt)}</span></Td>
                      <Td className="text-right">
                        <Button
                          variant={r.status === "HIDDEN" ? "secondary" : "outline"}
                          size="sm"
                          loading={busyId === r.id}
                          onClick={() => setTarget(r)}
                        >
                          {r.status === "HIDDEN" ? <><Eye size={13} /> Restore</> : <><EyeOff size={13} /> Hide</>}
                        </Button>
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
        open={Boolean(target)}
        title={target?.status === "HIDDEN" ? "Restore this review?" : "Hide this review?"}
        message={
          target?.status === "HIDDEN"
            ? "The review will become visible again on the store page and in ratings."
            : "The review will be hidden from the store page and excluded from rating calculations. It is never deleted and can be restored."
        }
        confirmLabel={target?.status === "HIDDEN" ? "Restore review" : "Hide review"}
        danger={target?.status !== "HIDDEN"}
        loading={busyId === target?.id}
        onConfirm={moderate}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
