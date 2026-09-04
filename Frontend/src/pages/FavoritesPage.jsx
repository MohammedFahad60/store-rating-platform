import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MapPin, Trash2 } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { Alert, Button, Card, ConfirmDialog, EmptyState, Pagination, Spinner, Stars } from "../components/ui";

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchFavorites = useCallback(async (nextPage = 1) => {
    const { data } = await api.get("/favorites", { params: { page: nextPage, limit: 12 } });
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchFavorites(1);
        if (!active) return;
        setFavorites(data.favorites || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
        setError("");
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load favorites"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fetchFavorites]);

  const load = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchFavorites(page);
      setFavorites(data.favorites || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load favorites"));
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/favorites/${removeTarget.storeId}`);
      setFavorites((prev) => prev.filter((f) => f.id !== removeTarget.id));
      setNotice("Store removed from favorites");
      setRemoveTarget(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not remove favorite"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Favorites</h1>
        <p className="text-sm text-slate-400 mt-1">Stores you saved for quick access</p>
      </div>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading favorites..." />
      ) : favorites.length === 0 ? (
        <Card>
          <EmptyState icon={Heart} title="No favorites yet">
            <p className="mb-4">Tap the heart on any store to save it here.</p>
            <Link to="/stores"><Button>Browse stores</Button></Link>
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {favorites.map((f) => (
              <Card key={f.id} className="p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Link to={`/stores/${f.storeId}`} className="font-semibold text-white hover:text-blue-300 leading-snug">
                    {f.store?.name}
                  </Link>
                  <span className="shrink-0 text-[10px] font-bold tracking-wider bg-slate-800 text-blue-400 rounded-full px-2.5 py-1">
                    {f.store?.category || "STORE"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Stars value={f.store?.averageRating} size={13} />
                  <span className="text-xs text-slate-400">
                    {Number(f.store?.averageRating) > 0 ? f.store.averageRating : "New"} ({f.store?.ratingCount})
                  </span>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-4">
                  <MapPin size={12} className="shrink-0" />
                  <span className="truncate">{f.store?.address || "—"}</span>
                </p>
                <div className="mt-auto flex items-center justify-between">
                  <Link to={`/stores/${f.storeId}`}>
                    <Button variant="secondary" size="sm">View store</Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(f)}>
                    <Trash2 size={13} /> Remove
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(pg) => load(pg)} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove favorite?"
        message={`Remove "${removeTarget?.store?.name}" from your favorites?`}
        confirmLabel="Remove"
        danger
        loading={busy}
        onConfirm={remove}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
