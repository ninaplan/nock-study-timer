'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function BillingResultInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get('status');
  const reason = searchParams.get('reason');
  const detail = searchParams.get('detail');
  const [seconds, setSeconds] = useState(3);

  const isSuccess = status === 'success';

  useEffect(() => {
    if (!isSuccess) return; // 실패 시 자동 이동 안 함
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(t);
          window.location.replace('/?_subRefresh=' + Date.now());
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isSuccess]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        background: 'var(--bg, #fff)',
        color: 'var(--text, #111)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48 }}>{isSuccess ? '🎉' : '😢'}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>
        {isSuccess ? '구독이 시작됐어요!' : '결제에 실패했어요'}
      </div>
      {!isSuccess && reason && (
        <div style={{
          fontSize: 15, color: '#e04e4e', fontWeight: 600,
          background: 'rgba(235,87,87,0.08)', borderRadius: 10,
          padding: '8px 16px', marginTop: 4,
        }}>
          {reason}
        </div>
      )}
      {!isSuccess && detail && (
        <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: 320 }}>
          {detail}
        </div>
      )}
      {isSuccess ? (
        <div style={{ fontSize: 14, color: 'var(--text2, #888)' }}>
          {seconds}초 후 홈으로 돌아갑니다
        </div>
      ) : null}
      <button
        onClick={() => window.location.replace('/?_subRefresh=' + Date.now())}
        style={{
          marginTop: 8,
          padding: '10px 24px',
          borderRadius: 12,
          border: 'none',
          background: '#111',
          color: '#fff',
          fontWeight: 600,
          fontSize: 15,
          cursor: 'pointer',
        }}
      >
        홈으로 돌아가기
      </button>
    </div>
  );
}

export default function BillingResultPage() {
  return (
    <Suspense>
      <BillingResultInner />
    </Suspense>
  );
}
