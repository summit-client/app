import { useState, type FormEvent } from "react";
import styles from "../styles/design-b.module.css";
import type { ChangeRequest, ChangeRequestType } from "../lib/session-change-requests";

type Props = {
  sessionId: number;
  sessionLabel: string;
  requestType: ChangeRequestType;
  onClose: () => void;
  onSubmitted: (request: ChangeRequest) => void;
};

/**
 * The form behind pages/appointments.tsx's "Request reschedule" / "Request
 * cancellation" buttons. Posts to pages/api/sessions/request-change.ts,
 * which inserts into session_change_requests (migration 0035) - a request
 * for staff to action, never a direct edit to the session itself. Closed by
 * its own Cancel button, the Escape key, or a click on the backdrop; a
 * submit in flight blocks all three so a request can't be abandoned
 * half-sent.
 */
export function RequestChangeModal({
  sessionId,
  sessionLabel,
  requestType,
  onClose,
  onSubmitted,
}: Props) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCancel = requestType === "cancel";
  const title = isCancel ? "Request a cancellation" : "Request a reschedule";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/sessions/request-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, requestType, note }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body?.error || "Couldn't submit your request. Try again.");
        setSubmitting(false);
        return;
      }

      onSubmitted(body.request as ChangeRequest);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  function handleBackdropClick() {
    if (!submitting) onClose();
  }

  return (
    <div
      className={styles.modalOverlay}
      role="presentation"
      onClick={handleBackdropClick}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !submitting) onClose();
      }}
    >
      <div
        className={styles.modalPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-change-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="request-change-title" className={styles.modalTitle}>
          {title}
        </h2>
        <p className={styles.modalSubtitle}>{sessionLabel}</p>

        <form onSubmit={handleSubmit}>
          <div className="field" style={{ marginBottom: 18 }}>
            <label htmlFor="request-note">
              Note {isCancel ? "(optional)" : "(preferred days/times are helpful)"}
            </label>
            <textarea
              id="request-note"
              className="input"
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                isCancel
                  ? "Let us know why, if you'd like."
                  : "e.g. Could we move this to Thursday afternoon?"
              }
            />
          </div>

          {error && (
            <p role="alert" className={styles.modalError}>
              {error}
            </p>
          )}

          <p className={styles.modalHint}>
            This sends a request to your clinical team - it doesn&apos;t change
            the session yet. They&apos;ll confirm the new time or the
            cancellation with you.
          </p>

          <div className={styles.modalActions}>
            <button
              type="button"
              className="btn secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Never mind
            </button>
            <button
              type="submit"
              className={isCancel ? "btn danger" : "btn"}
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
