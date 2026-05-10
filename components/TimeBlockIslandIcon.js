'use client';

/** 하단 아일랜드 «타임블록» 탭용 — 둥근 블록 3+1 형태 */
export default function TimeBlockIslandIcon(props) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2.2" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="2.2" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="2.2" />
      <rect x="15.5" y="2" width="6.2" height="6.2" rx="1.9" />
    </svg>
  );
}
