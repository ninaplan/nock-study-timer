'use client';
import { X, Check } from 'lucide-react';

export default function PopupDialog({
  title,
  message,
  cancelText,
  confirmText,
  onCancel,
  onConfirm,
  singleAction = false,
  actionVariant = 'icon', // 'icon' | 'text'
  titleSize,
  titleWeight,
  /** No bottom bar; top row with X | title | spacer (use with singleAction) */
  dismissInHeader = false,
  closeAriaLabel = 'Close',
}) {
  if (dismissInHeader) {
    return (
      <>
        <div className="popup-backdrop" onClick={onCancel} />
        <div className="popup-wrap">
          <div className="popup pop-in popup--header-dismiss" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header-field">
              <button type="button" className="popup-close-x" onClick={onCancel} aria-label={closeAriaLabel}>
                <X size={18} strokeWidth={2.2} />
              </button>
              <div className="popup-title popup-title--header-row">{title}</div>
              <span className="sheet-topbar-spacer" aria-hidden />
            </div>
            <div className="popup-body popup-body--pad">{message}</div>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="popup-backdrop" onClick={onCancel} />
      <div className="popup-wrap">
        <div className="popup pop-in" onClick={(e) => e.stopPropagation()}>
          <div
            className="popup-title"
            style={{
              ...(titleSize ? { fontSize: titleSize } : {}),
              ...(titleWeight ? { fontWeight: titleWeight } : {}),
            }}
          >
            {title}
          </div>
          <div className="popup-body">{message}</div>
          {actionVariant === 'text' ? (
            <div className="popup-actions">
              {!singleAction && (
                <button type="button" className="btn btn-muted btn-md flex-1" onClick={onCancel}>
                  {cancelText}
                </button>
              )}
              <button type="button" className="btn btn-dark btn-md flex-1" onClick={onConfirm}>
                {confirmText}
              </button>
            </div>
          ) : (
            <div className={`popup-actions popup-actions--icons${singleAction ? ' popup-actions--icons-single' : ''}`}>
              {!singleAction && (
                <button type="button" className="nav-circle-btn nav-circle-btn--dismiss" onClick={onCancel} aria-label={cancelText}>
                  <X strokeWidth={2.2} aria-hidden />
                </button>
              )}
              {!singleAction && <span className="popup-actions-spacer" aria-hidden />}
              <button type="button" className="nav-circle-btn nav-circle-btn--confirm" onClick={onConfirm} aria-label={confirmText}>
                <Check strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
