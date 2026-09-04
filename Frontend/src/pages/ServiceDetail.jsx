import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarPlus, Clock, MapPin, Phone, Store as StoreIcon, Wrench } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatPrice } from "../utils/format";
import { getRole } from "../utils/auth";
import BookingModal from "../components/BookingModal";
import {
  Button, Card, EmptyState, Spinner, Stars,
} from "../components/ui";

export default function ServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const role = getRole();
  const isCustomer = role === "USER";

  const [service, setService] = useState(null);
  const [rating, setRating] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.get(`/services/${id}`);
        if (!active) return;
        setService(data.service);
        setError("");
        // Optional store rating summary for context.
        const { data: r } = await api.get(`/ratings/store/${data.service.storeId}`).catch(() => ({ data: null }));
        if (active && r) setRating(r);
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load this service"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  if (loading) return <Spinner label="Loading service..." />;

  if (error || !service) {
    return (
      <Card>
        <EmptyState icon={Wrench} title="Service unavailable">
          <p className="mb-4">{error || "Service not found"}</p>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Go back
          </Button>
        </EmptyState>
      </Card>
    );
  }

  const store = service.store || {};

  return (
    <div className="max-w-4xl">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-5 transition">
        <ArrowLeft size={15} /> Back
      </button>

      <Card className="p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full px-2.5 py-1">
                {store.category?.replace(/_/g, " ") || "Service"}
              </span>
              {!service.active && (
                <span className="text-[10px] font-bold tracking-wider bg-red-500/10 text-red-400 border border-red-500/30 rounded-full px-2.5 py-1">
                  INACTIVE
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white">{service.name}</h1>
            <p className="text-sm text-slate-400 mt-1">
              at{" "}
              <Link to={`/stores/${store.id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                {store.name}
              </Link>
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-blue-300">{formatPrice(service.price)}</p>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-end gap-1">
              <Clock size={12} /> {service.estimatedMinutes} min
            </p>
          </div>
        </div>

        {service.description && (
          <p className="text-slate-300 text-sm mt-5 leading-relaxed">{service.description}</p>
        )}

        {isCustomer && service.active && store.status === "ACTIVE" && (
          <div className="mt-6">
            <Button onClick={() => setBookingOpen(true)}>
              <CalendarPlus size={16} /> Book this service
            </Button>
          </div>
        )}
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="font-semibold text-white mb-3">About the store</h2>
          <div className="space-y-2 text-sm text-slate-400">
            <p className="flex items-center gap-2"><StoreIcon size={15} className="text-slate-500 shrink-0" /> {store.name}</p>
            <p className="flex items-center gap-2"><MapPin size={15} className="text-slate-500 shrink-0" /> {store.address}</p>
            {store.phone && <p className="flex items-center gap-2"><Phone size={15} className="text-slate-500 shrink-0" /> {store.phone}</p>}
            {store.description && <p className="text-sm text-slate-500 leading-relaxed pt-1">{store.description}</p>}
            <Link to={`/stores/${store.id}`} className="inline-flex text-xs text-blue-400 hover:text-blue-300 font-medium pt-2">
              View store details &amp; availability →
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-white mb-3">Store rating</h2>
          {rating?.totalRatings ? (
            <>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-bold text-white">{rating.averageRating}</p>
                <div>
                  <Stars value={rating.averageRating} size={14} />
                  <p className="text-xs text-slate-500 mt-1">{rating.totalRatings} reviews</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-3">
                Reviews can be left after a completed booking at this store.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">No reviews yet.</p>
          )}
        </Card>
      </div>

      <BookingModal
        open={bookingOpen}
        store={store}
        service={service}
        onClose={() => setBookingOpen(false)}
      />
    </div>
  );
}
