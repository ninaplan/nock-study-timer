'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function BillingResultInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get('status');
  const reason = searchParams.get('reason');
  const [seconds, setSeconds] = useState(3);

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(t);
          router.replace('/');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [router]);

  const isSuccess = status === 'success';

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
        <div style={{ fontSize: 14, color: 'var(--text2, #888)' }}>{reason}</div>
      )}
      <div style={{ fontSize: 14, color: 'var(--text2, #888)' }}>
        {seconds}초 후 홈으로 돌아갑니다
      </div>
      <button
        onClick={() => router.replace('/')}
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
        지금 돌아가기
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
