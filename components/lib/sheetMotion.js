'use client';

/** 열릴 때 — 약한 오버슈트 */
export const SHEET_SPRING_OPEN = { type: 'spring', stiffness: 400, damping: 40, mass: 1 };
/** 닫힐 때 — 빠르게 내려감 */
export const SHEET_SPRING_CLOSE = { type: 'spring', stiffness: 300, damping: 35 };

export const SHEET_DRAG_ELASTIC = 0.2;
export const SHEET_DRAG_DISMISS_OFFSET_PX = 80;
export const SHEET_DRAG_DISMISS_VELOCITY = 500;

/** 패널 스프링과 분리: 딤은 짧은 ease */
export const SHEET_BACKDROP_TRANSITION = { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] };

/** `useDragControls()`를 넘겨 핸들에서만 드래그 시작(내부 스크롤 유지). onDismiss: 임계 초과 시. */
export function sheetPanelDragProps(dragControls, onDismiss) {
  return {
    drag: 'y',
    dragControls,
    dragListener: false,
    dragConstraints: { top: 0 },
    dragElastic: SHEET_DRAG_ELASTIC,
    onDragEnd: (_e, info) => {
      const oy = info.offset.y ?? 0;
      const vy = info.velocity.y ?? 0;
      if (oy > SHEET_DRAG_DISMISS_OFFSET_PX || vy > SHEET_DRAG_DISMISS_VELOCITY) {
        onDismiss();
      }
    },
  };
}
