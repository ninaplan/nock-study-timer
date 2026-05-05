'use client';

/**
 * 목표 DB 매핑 하단 — 할 일에 보일 상태 체크 (설정·온보딩 공통)
 * @param {import('react').ReactNode} [manualFallback] 온보딩: API 옵션 없을 때 직접 입력 UI
 */
export default function GoalStatusPickerBlock({ t, loading, options, isChecked, onToggle, manualFallback }) {
  return (
    <div className="goal-status-picker-section">
      <div className="goal-status-picker-title">{t.goalStatusPickerTitle}</div>
      <p className="goal-status-picker-hint">{t.goalStatusPickerHint}</p>
      {loading ? (
        <span className="goal-status-picker-loading">{t.goalInProgressLoading}</span>
      ) : options.length > 0 ? (
        <div className="goal-status-picker-grid">
          {options.map((opt) => (
            <label key={opt} className="goal-status-picker-item">
              <input
                type="checkbox"
                checked={isChecked(opt)}
                onChange={() => onToggle(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      ) : manualFallback != null ? (
        <div className="goal-status-picker-manual-wrap">{manualFallback}</div>
      ) : (
        <p className="goal-status-picker-manual">{t.goalInProgressManualHint}</p>
      )}
    </div>
  );
}
