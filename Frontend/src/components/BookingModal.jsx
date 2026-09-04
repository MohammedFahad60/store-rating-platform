import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { formatPrice } from "../utils/format";
import { Alert, Button, Field, Input, Modal, Textarea } from "./ui";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Booking form body. Mounted fresh for every modal open (via key), so the
 * default form state is applied through the useState initializer (no effect
 * needed) and availability is fetched on mount.
 */
function BookingForm({ store, service, onClose, onSuccess }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ bookingDate: todayISO(), startTime: "", notes: "" });
  const [slots, setSlots] = useState([]);
  const [hint, setHint] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.get(`/stores/${service.storeId}/availability`, {
          params: { date: form.bookingDate },
        });
        if (!active) return;
        setSlots(data.slots || []);
        if (data.hours?.closed) setHint("The store is closed on this day.");
      } catch (err) {
        if (active) setHint(apiErrorMessage(err, "Could not load availability"));
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.storeId]);

  const changeDate = (e) => {
    const date = e.target.value;
    setForm((f) => ({ ...f, bookingDate: date, startTime: "" }));
    if (!date) return;
    setSlotsLoading(true);
    setHint("");
    setSlots([]);
    (async () => {
      try {
        const { data } = await api.get(`/stores/${service.storeId}/availability`, { params: { date } });
        setSlots(data.slots || []);
        if (data.hours?.closed) setHint("The store is closed on this day.");
      } catch (err) {
        setHint(apiErrorMessage(err, "Could not load availability"));
      } finally {
        setSlotsLoading(false);
      }
    })();
  };

  const submit = async () => {
    setError("");
    if (!form.bookingDate) return setError("Please choose a booking date");
    if (!form.startTime) return setError("Please choose an available time slot");
    setBusy(true);
    try {
      await api.post("/bookings", {
        serviceId: service.id,
        bookingDate: form.bookingDate,
        startTime: form.startTime,
        notes: form.notes.trim() || null,
      });
      onClose();
      if (onSuccess) onSuccess();
      navigate("/my-bookings");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create the booking"));
      setSlotsLoading(true);
      try {
        const { data } = await api.get(`/stores/${service.storeId}/availability`, {
          params: { date: form.bookingDate },
        });
        setSlots(data.slots || []);
      } catch {
        // keep the error visible; retry is possible via date picker
      } finally {
        setSlotsLoading(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <Alert className="mb-4">{error}</Alert>}
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-3 text-sm">
          <span className="text-slate-400">{store?.name || "Store"}</span>
          <span className="font-semibold text-white">{formatPrice(service.price)}</span>
        </div>
        <Field label="Booking date">
          <Input type="date" min={todayISO()} value={form.bookingDate} onChange={changeDate} />
        </Field>
        <Field label="Available time slots">
          {hint ? (
            <p className="text-sm text-red-400">{hint}</p>
          ) : slotsLoading ? (
            <p className="text-sm text-slate-500">Loading availability...</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-slate-500">No slots available for this date.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  onClick={() => setForm((f) => ({ ...f, startTime: slot.time }))}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                    !slot.available
                      ? "border-slate-800 text-slate-700 cursor-not-allowed"
                      : form.startTime === slot.time
                        ? "border-blue-500 bg-blue-600/20 text-white"
                        : "border-slate-700 text-slate-300 hover:border-blue-500/60"
                  }`}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label="Notes for the store" hint="optional">
          <Textarea
            placeholder="Preferred slot, special instructions..."
            maxLength={1000}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <p className="text-xs text-slate-500">
          The price shown is the service price at booking time and is saved with your booking. The store owner will confirm your request.
        </p>
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Request booking</Button>
        </div>
      </div>
    </>
  );
}

/**
 * Professional booking flow: store -> service -> date -> time -> notes -> confirm.
 * The modal only holds the selected service and posts /bookings with serviceId;
 * the backend resolves storeId + price from the database (never trusted from the client).
 */
export default function BookingModal({ open, store, service, onClose, onSuccess }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Book ${service?.name || ""}`}
      footer={null}
    >
      {open && service && (
        <BookingForm
          key={service.id}
          store={store}
          service={service}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      )}
    </Modal>
  );
}
