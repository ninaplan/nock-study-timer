'use client';

/** 패널 열림 — y 슬라이드(오버슈트 없음) */
export const SHEET_Y_OPEN_TWEEN = { type: 'tween', duration: 0.35, ease: [0.22, 1, 0.36, 1] };

/** 패널 닫힘 — y 아래로 */
export const SHEET_Y_CLOSE_TWEEN = { type: 'tween', duration: 0.32, ease: [0.25, 0.1, 0.25, 1] };

/** 키보드 dock: bottom / maxHeight */
export const SHEET_DOCK_KEYBOARD_TWEEN = { type: 'tween', duration: 0.25, ease: [0.25, 0.1, 0.25, 1] };

export const SHEET_PANEL_DOCK_TRANSITION = {
  y: SHEET_Y_OPEN_TWEEN,
  bottom: SHEET_DOCK_KEYBOARD_TWEEN,
  maxHeight: SHEET_DOCK_KEYBOARD_TWEEN,
};

/** exit·인터랙티브 닫힘 공통 */
export const SHEET_PANEL_DOCK_EXIT_TRANSITION = {
  y: SHEET_Y_CLOSE_TWEEN,
  bottom: SHEET_DOCK_KEYBOARD_TWEEN,
  maxHeight: SHEET_DOCK_KEYBOARD_TWEEN,
};

export const SHEET_DRAG_ELASTIC = 0.2;
export const SHEET_DRAG_DISMISS_OFFSET_PX = 80;
export const SHEET_DRAG_DISMISS_VELOCITY = 500;

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
