// components/NotionConnectSheet.js
'use client';

/**
 * Onboarding: bottom sheet before redirecting to Notion OAuth
 * (Notion’s login page cannot be shown inside a webview/iframe; this is UX only).
 */
export default function NotionConnectSheet({ open, onClose, onConnect, loading, errorMessage, t }) {
  if (!open) return null;

  return (
    <div
      className="backdrop"
      role="presentation"
      onClick={loading ? undefined : onClose}
    >
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notion-connect-sheet-title"
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-topbar">
          <button
            type="button"
            className="sheet-pill"
            onClick={onClose}
            disabled={loading}
          >
            {t.cancel}
          </button>
          <div id="notion-connect-sheet-title" className="sheet-topbar-title">
            {t.connectNotionTitle}
          </div>
          <div style={{ width: 72, flexShrink: 0 }} aria-hidden="true" />
        </div>
        <div className="sheet-body" style={{ paddingTop: 4, paddingBottom: 8 }}>
          <p
            className="sheet-title"
            style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.5, color: 'var(--text2)', marginBottom: 16 }}
          >
            {t.notionConnectSheetHint}
          </p>
        </div>
        <div className="sheet-footer" style={{ flexDirection: 'column' }}>
          {errorMessage ? (
            <p style={{ color: 'var(--red)', fontSize: 14, textAlign: 'center', width: '100%' }}>
              {errorMessage}
            </p>
          ) : null}
          <button
            type="button"
            className="sheet-pill sheet-pill-primary"
            style={{ width: '100%' }}
            onClick={onConnect}
            disabled={loading}
          >
            {loading ? t.connecting : t.signInWithNotion}
          </button>
        </div>
      </div>
    </div>
  );
}
