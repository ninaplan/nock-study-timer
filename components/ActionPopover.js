'use client';

/**
 * iOS 26 Notes 스타일 앵커 팝오버 메뉴.
 * 딤 없음 · 바깥 탭 닫기 · Escape · 서브페이지 슬라이드 내비게이션.
 * 시각·등장/퇴장·배경은 NockPopover와 동일.
 *
 * pages 구조:
 *   [
 *     {                              // 루트 페이지 (index 0)
 *       sections: [
 *         { type: 'list', items: [
 *             { icon, label, onPress?, submenuPage?, checked?, destructive? }
 *         ]},
 *         { type: 'radio', value, onChange, items: [{ label, value }] },
 *         { type: 'custom', render: () => <JSX/> },
 *       ]
 *     },
 *     { title: '서브페이지', sections: [...] },  // index 1+
 *   ]
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { hapticLight } from './lib/haptics';
import NockPopover from './NockPopover';

export default function ActionPopover({
  open,
  onClose,
  /** () => DOMRect | null — 앵커 요소의 getBoundingClientRect() */
  getAnchorRect,
  pages = [],
  dismissAriaLabel,
}) {
  /** 현재 보이는 페이지 인덱스 */
  const [pageIdx, setPageIdx] = useState(0);
  /** 슬라이드 방향: 'forward' | 'back' | null */
  const [slideDir, setSlideDir] = useState(null);

  useEffect(() => {
    if (open) {
      setPageIdx(0);
      setSlideDir(null);
    }
  }, [open]);

  const pushPage = useCallback((idx) => {
    hapticLight();
    setSlideDir('forward');
    setPageIdx(idx);
  }, []);

  const popPage = useCallback(() => {
    hapticLight();
    setSlideDir('back');
    setPageIdx(0);
  }, []);

  const handleItemPress = useCallback((item) => {
    if (item.submenuPage != null) {
      pushPage(item.submenuPage);
      return;
    }
    hapticLight();
    item.onPress?.();
    if (item.checked === undefined) onClose();
  }, [pushPage, onClose]);

  const currentPage = pages[pageIdx];
  const isRoot = pageIdx === 0;

  const slideClass = slideDir === 'forward'
    ? ' ap-page--slide-in-forward'
    : slideDir === 'back'
      ? ' ap-page--slide-in-back'
      : '';

  return (
    <NockPopover
      open={open}
      onClose={onClose}
      getAnchorRect={getAnchorRect}
      placement="menu-end"
      width={260}
      dismissAriaLabel={dismissAriaLabel}
      panelClassName="ap-panel"
    >
      {!isRoot && (
        <div className="ap-subpage-header">
          <button
            type="button"
            className="ap-back-btn"
            onClick={popPage}
            aria-label="뒤로"
          >
            <ChevronLeft size={17} strokeWidth={2.5} aria-hidden />
          </button>
          <span className="ap-subpage-title">{currentPage?.title ?? ''}</span>
        </div>
      )}

      <div
        key={pageIdx}
        className={`ap-page-content${slideClass}`}
        onAnimationEnd={() => setSlideDir(null)}
      >
        {currentPage?.sections?.map((section, si) => (
          <div key={si}>
            {si > 0 && <div className="ap-separator" role="separator" />}

            {section.type === 'list' && (
              <div className="ap-list-section">
                {section.items?.map((item, ii) => (
                  <button
                    key={ii}
                    type="button"
                    className={`ap-row${item.destructive ? ' ap-row--destructive' : ''}`}
                    onClick={() => handleItemPress(item)}
                  >
                    {item.icon != null && (
                      <span className="ap-row-icon" aria-hidden>{item.icon}</span>
                    )}
                    <span className="ap-row-label">{item.label}</span>
                    {item.checked !== undefined && (
                      <span className="ap-row-end" aria-hidden>
                        {item.checked
                          ? <Check size={16} strokeWidth={2.5} className="ap-row-check-icon" />
                          : <span className="ap-row-check-placeholder" />}
                      </span>
                    )}
                    {item.submenuPage != null && (
                      <ChevronRight size={15} strokeWidth={2} className="ap-row-chevron" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
            )}

            {section.type === 'radio' && (
              <div className="ap-list-section">
                {section.items?.map((item, ii) => (
                  <button
                    key={ii}
                    type="button"
                    className="ap-row"
                    onClick={() => {
                      hapticLight();
                      section.onChange?.(item.value);
                    }}
                  >
                    <span className="ap-row-label">{item.label}</span>
                    <span className="ap-row-end" aria-hidden>
                      {section.value === item.value
                        ? <Check size={16} strokeWidth={2.5} className="ap-row-check-icon" />
                        : <span className="ap-row-check-placeholder" />}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {section.type === 'custom' && (
              <div className="ap-custom-section">
                {section.render?.()}
              </div>
            )}
          </div>
        ))}
      </div>
    </NockPopover>
  );
}
