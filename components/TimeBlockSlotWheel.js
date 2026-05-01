'use client';

/**
 * Scroll wheel list (same visual language as TimeWheelPicker) — tap a row to toggle that hour slot.
 */
export default function TimeBlockSlotWheel({ selectedSet, onToggle, ko = true }) {
  const hourLabel = (h) => {
    const next = (h + 1) % 24;
    return `${String(h).padStart(2, '0')}:00–${String(next).padStart(2, '0')}:00`;
  };

  const hint = ko ? '시간대 (탭하여 선택/해제)' : 'Tap a slot to toggle';

  return (
    <div className="time-wheel sheet-tb-slot-wheel" role="group" aria-label={hint}>
      <div className="time-wheel-labels time-wheel-labels--single">
        <span>{hint}</span>
      </div>
      <div className="time-wheel-inner time-wheel-inner--slots">
        <div className="time-wheel-col time-wheel-col--slots">
          {Array.from({ length: 24 }, (_, h) => {
            const on = selectedSet.has(h);
            return (
              <button
                key={h}
                type="button"
                className={`time-wheel-cell time-wheel-cell--slot${on ? ' time-wheel-cell--slot-on' : ''}`}
                onClick={() => onToggle(h)}
              >
                {hourLabel(h)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
