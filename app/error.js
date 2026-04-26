'use client';

/**
 * Catches render/runtime errors in the app segment (shows instead of a blank/white page).
 */
export default function AppError({ error, reset }) {
  const msg = error?.message || '';
  return (
    <div
      style={{
        minHeight: '100dvh',
        padding: 24,
        background: '#F2F2F7',
        color: '#111',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>화면을 불러오지 못했어요</h1>
      <p style={{ fontSize: 14, color: '#555', lineHeight: 1.5, maxWidth: 360, marginBottom: 20, wordBreak: 'break-word' }}>
        {msg || '잠시 후 다시 시도하거나, 앱을 완전히 닫았다가 열어 주세요. (캐시가 꼬였을 수 있어요)'}
      </p>
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
