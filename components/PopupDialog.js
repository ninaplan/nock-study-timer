'use client';

export default function PopupDialog({
  title,
  message,
  cancelText,
  confirmText,
  onCancel,
  onConfirm,
  singleAction = false,
}) {
  return (
    <>
      <div className="popup-backdrop" onClick={onCancel} />
      <div className="popup-wrap">
        <div className="popup pop-in">
          <div className="popup-title">{title}</div>
          <div className="popup-body">{message}</div>
          <div className="popup-actions">
            {!singleAction && (
              <button className="btn btn-muted btn-md flex-1" onClick={onCancel}>
                {cancelText}
              </button>
            )}
            <button className="btn btn-dark btn-md flex-1" onClick={onConfirm}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
