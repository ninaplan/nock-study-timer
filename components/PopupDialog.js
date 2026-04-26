'use client';
import { X } from 'lucide-react';

export default function PopupDialog({
  title,
  message,
  cancelText,
  confirmText,
  onCancel,
  onConfirm,
  singleAction = false,
  /** No bottom bar; top row with title + X in a tinted field (use with singleAction) */
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
              <div className="popup-title popup-title--header-row">{title}</div>
              <button type="button" className="popup-close-x" onClick={onCancel} aria-label={closeAriaLabel}>
                <X size={20} strokeWidth={2.2} />
              </button>
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
          <div className="popup-title">{title}</div>
          <div className="popup-body">{message}</div>
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
        </div>
      </div>
    </>
  );
}
