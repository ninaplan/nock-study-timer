'use client';
import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function IosAuthInner() {
  const params = useSearchParams();
  const nat = params.get('_nat');
  const intent = params.get('intent') || 'onboarding';

  useEffect(() => {
    if (nat) {
      window.location.href = `nocktimer://auth?_nat=${encodeURIComponent(nat)}&intent=${intent}`;
    }
  }, [nat, intent]);

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif',
      gap: 16, padding: 24,
    }}>
      <div style={{ fontSize: 40 }}>✓</div>
      <p style={{ fontSize: 16, color: '#333', textAlign: 'center', margin: 0 }}>
        로그인 완료! 앱으로 돌아가는 중...
      </p>
      {nat && (
        <a
          href={`nocktimer://auth?_nat=${encodeURIComponent(nat)}&intent=${intent}`}
          style={{ fontSize: 14, color: '#0066cc', marginTop: 8 }}
        >
          앱으로 돌아가기
        </a>
      )}
    </div>
  );
}

export default function IosAuth() {
  return (
    <Suspense>
      <IosAuthInner />
    </Suspense>
  );
}
