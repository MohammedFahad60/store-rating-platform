import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, MapPin, MessageSquare, XCircle } from "lucide-react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatDate, formatDateTime, formatPrice } from "../utils/format";
import { getRole } from "../utils/auth";
import RatingModal from "../components/RatingModal";
import { Alert, Button, Card, ConfirmDialog, Spinner, StatusBadge, Stars } from "../components/ui";

export default function BookingDetails() {
  const { id } = useParams();
  const role = getRole();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);

  const fetchBooking = useCallback(async () => {
    const { data } = await api.get(`/bookings/${id}`);
    return data.booking;
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const booking = await fetchBooking();
        if (active) setBooking(booking);
      } catch (err) {
        if (active) setError(apiErrorMessage(err, "Failed to load booking"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fetchBooking]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setBooking(await fetchBooking());
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load booking"));
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.put(`/bookings/${booking.id}/cancel`);
      setNotice("Booking cancelled");
      setCancelOpen(false);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not cancel the booking"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading booking..." />;

  if (error || !booking) {
    return (
      <Card>
        <div className="p-8 text-center">
          <p className="text-slate-300 mb-4">{error || "Booking not found"}</p>
          <Link to={role === "OWNER" ? "/owner/bookings" : "/my-bookings"}>
            <Button variant="ghost"><ArrowLeft size={15} /> Back</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const isCustomer = role === "USER";
  const canCancel = isCustomer && booking.status === "PENDING";
  const canRate = isCustomer && booking.status === "COMPLETED" && !booking.rating;

  return (
    <div className="max-w-3xl">
      <Link to={role === "OWNER" ? "/owner/bookings" : "/my-bookings"} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-5 transition">
        <ArrowLeft size={15} /> Back to bookings
      </Link>

      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            {booking.service?.name} <StatusBadge status={booking.status} />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {booking.store?.name} · {booking.store?.category || "Store"}
          </p>
        </div>
        {canCancel && (
          <Button variant="danger" onClick={() => setCancelOpen(true)}>
            <XCircle size={15} /> Cancel booking
          </Button>
        )}
        {canRate && (
          <Button variant="success" onClick={() => setRateOpen(true)}>
            <MessageSquare size={15} /> Rate & review
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Appointment</p>
          <p className="text-sm text-slate-300 flex items-center gap-2"><Calendar size={15} className="text-slate-500" /> {formatDate(booking.bookingDate)}</p>
          <p className="text-sm text-slate-300 flex items-center gap-2 mt-2"><Clock size={15} className="text-slate-500" /> {booking.startTime?.slice(0, 5)} · ~{booking.service?.estimatedMinutes} min</p>
          <p className="text-sm text-slate-300 flex items-center gap-2 mt-2"><MapPin size={15} className="text-slate-500" /> {booking.store?.address}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Details</p>
          <p className="text-sm text-slate-300">Price (snapshotted): <span className="font-semibold text-white">{formatPrice(booking.price)}</span></p>
          {booking.notes && <p className="text-sm text-slate-400 mt-2">Notes: “{booking.notes}”</p>}
          <p className="text-sm text-slate-300 mt-2">Created: {formatDateTime(booking.createdAt)}</p>
          {booking.customer && (
            <p className="text-sm text-slate-300 mt-2">Customer: <span className="text-white">{booking.customer.name}</span> · {booking.customer.email}</p>
          )}
        </Card>
      </div>

      {booking.rating && (
        <Card className="p-5 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Your review</p>
          <Stars value={booking.rating.rating} size={15} />
          {booking.rating.comment && <p className="text-sm text-slate-300 mt-2">{booking.rating.comment}</p>}
        </Card>
      )}

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this booking?"
        message="Only pending bookings can be cancelled. This cannot be undone."
        confirmLabel="Cancel booking"
        danger
        loading={busy}
        onConfirm={cancel}
        onClose={() => setCancelOpen(false)}
      />

      <RatingModal
        open={rateOpen}
        storeId={booking.storeId}
        storeName={booking.store?.name}
        onClose={() => setRateOpen(false)}
        onSubmitted={() => {
          setRateOpen(false);
          load();
        }}
      />
    </div>
  );
}
