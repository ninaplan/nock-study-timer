'use client';

import NotionMark from './NotionMark';

/** Keep in sync with `app/layout.js` ICON_CACHE_BUST so favicon + overlay stay aligned after icon swaps. */
const APP_ICON = '/icon.png?v=11';

/**
 * Full-screen load modal while Notion data is loading.
 * @param {string} [message] — optional line under the icon handoff (e.g. OAuth redirect copy)
 * @param {string} [ariaLabel] — screen reader (defaults to `message` or generic)
 */
export default function NotionLoadingOverlay({ open, message, ariaLabel }) {
  if (!open) return null;
  const a11y = ariaLabel || message || 'Loading';
  return (
    <div
      className="notion-load-backdrop"
      role="alertdialog"
      aria-live="polite"
      aria-busy="true"
      aria-label={a11y}
    >
      <div className="notion-load-card">
        <div className="notion-handoff" aria-hidden>
          <img src={APP_ICON} alt="" className="notion-handoff-app" width={40} height={40} decoding="async" />
          <NotionMark size={40} className="notion-handoff-nt" />
        </div>
        {message ? <p className="notion-load-msg">{message}</p> : null}
      </div>
    </div>
  );
}
