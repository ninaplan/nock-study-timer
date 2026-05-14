'use client';

/** 스크롤 호스트 안에서 포커스 필드가 보이도록(키보드 위) */
export function scrollSheetFieldIntoView(fieldEl, { behavior = 'smooth' } = {}) {
  if (!fieldEl || typeof fieldEl.scrollIntoView !== 'function') return;
  requestAnimationFrame(() => {
    try {
      fieldEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
    } catch {
      try {
        fieldEl.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch {
        /* noop */
      }
    }
  });
}
