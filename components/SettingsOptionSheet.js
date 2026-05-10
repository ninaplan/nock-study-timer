'use client';

import { Check } from 'lucide-react';
import ChromeBottomSheet from './ChromeBottomSheet';
import { hapticLight } from './lib/haptics';

/**
 * 설정에서 언어·요일 등 — iOS 설정 하위 목록처럼 그룹 + 체크
 */
export default function SettingsOptionSheet({ open, onClose, title, options = [], value, onChange, closeLabel }) {
  return (
    <ChromeBottomSheet open={open} onClose={onClose} title={title} closeLabel={closeLabel || 'Close'}>
      <div className="settings-option-sheet-stack">
        <div className="list-sec list-sec--stack-md settings-option-sheet-list">
          {options.map((o) => {
            const sel = String(o.value) === String(value);
            return (
              <button
                key={String(o.value)}
                type="button"
                className="list-row w-full settings-option-row"
                onClick={() => {
                  hapticLight();
                  if (!sel) onChange(o.value);
                  onClose();
                }}
              >
                <span className="settings-row-label settings-option-row-label">{o.label}</span>
                <span className="settings-option-check-wrap" aria-hidden>
                  {sel ? (
                    <Check strokeWidth={2.25} aria-hidden />
                  ) : (
                    <span style={{ width: 22, display: 'inline-block' }} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </ChromeBottomSheet>
  );
}
