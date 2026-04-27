'use client';

/**
 * Full-screen load modal while Notion data is loading or saving.
 */
export default function NotionLoadingOverlay({ open, message }) {
  if (!open) return null;
  return (
    <div
      className="notion-load-backdrop"
      role="alertdialog"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className="notion-load-card">
        <div className="notion-think" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        {message ? <p className="notion-load-msg">{message}</p> : null}
      </div>
    </div>
  );
}
