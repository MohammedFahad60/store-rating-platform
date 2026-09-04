import { useState } from "react";
import api from "../services/api";
import { apiErrorMessage } from "../utils/errors";
import { Alert, Button, Field, Modal, Stars, Textarea } from "./ui";

export default function RatingModal({ open, storeId, storeName, onClose, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setRating(0);
    setComment("");
    setError("");
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError("");
    if (!rating) {
      setError("Please select a star rating");
      return;
    }

    setLoading(true);
    try {
      await api.post("/ratings", { storeId, rating, comment: comment.trim() || null });
      reset();
      onSubmitted?.();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not submit rating"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Rate ${storeName || "this store"}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>Submit review</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-xs text-slate-400">
          Reviews are only accepted after one of your bookings at this store has been completed.
        </p>
        <Field label="Your rating">
          <div className="py-1">
            <Stars value={rating} size={30} interactive onChange={setRating} />
          </div>
        </Field>
        <Field label="Review" hint="optional">
          <Textarea
            placeholder="How was your experience?"
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
