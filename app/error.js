'use client';

/**
 * Catches render/runtime errors in the app segment (shows instead of a blank/white page).
 */
export default function AppError({ error, reset }) {
  const msg = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '';
  const digest = error?.digest ? String(error.digest) : '';
  const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
  const tech = [isDev && error?.stack ? error.stack : null, isDev && error?.cause != null ? `원인: ${String(error.cause)}` : null]
    .filter(Boolean)
    .join('\n\n');

  return (
    <div
      style={{
        minHeight: '100dvh',
        padding: 24,
        background: 'var(--ios-bg, #F2F2F7)',
        color: 'var(--ios-label, #000000)',
        fontFamily: 'var(--font, system-ui, -apple-system, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>화면을 불러오지 못했어요</h1>
      <p style={{ fontSize: 14, color: '#555', lineHeight: 1.5, maxWidth: 360, marginBottom: 12, wordBreak: 'break-word' }}>
        {msg || '앱을 완전히 닫았다가 다시 열거나 아래 버튼으로 다시 시도해 보세요. (업데이트 직후 캐시가 꼬였을 수 있어요.)'}
      </p>
      {digest ? (
        <p style={{ fontSize: 12, color: '#888', lineHeight: 1.45, maxWidth: 360, marginBottom: 16, wordBreak: 'break-word' }}>
          진단 참고 코드: <code>{digest}</code>
        </p>
      ) : null}
      {isDev && tech ? (
        <pre
          style={{
            fontSize: 11,
            textAlign: 'left',
            maxWidth: 'min(100%, 420px)',
            maxHeight: 200,
            overflow: 'auto',
            padding: 12,
            marginBottom: 16,
            background: 'rgba(0,0,0,0.06)',
            borderRadius: 8,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {tech}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        style={{
          border: 'none',
          borderRadius: 999,
          padding: '14px 24px',
          fontSize: 16,
          fontWeight: 600,
          background: '#111',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
