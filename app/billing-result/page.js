'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const FAILURE_MESSAGES = {
  // 카드 관련
  INVALID_CARD_EXPIRATION:          '카드 유효기간이 올바르지 않아요.',
  INVALID_CARD_NUMBER:              '카드번호가 올바르지 않아요.',
  INVALID_CARD_INSTALLMENT_PLAN:    '할부 설정이 올바르지 않아요.',
  INVALID_STOPPED_CARD:             '정지된 카드예요. 카드사에 문의해주세요.',
  REJECTED_CARD_PAYMENT:            '카드사에서 결제를 거절했어요. 카드사에 문의해주세요.',
  REJECT_CARD_COMPANY:              '카드사에서 결제를 거절했어요.',
  NOT_ENOUGH_BALANCE:               '카드 잔액이 부족해요.',
  EXCEED_MAX_DAILY_PAYMENT_COUNT:   '오늘 결제 가능 횟수를 초과했어요. 내일 다시 시도해주세요.',
  EXCEED_MAX_AMOUNT:                '카드 한도를 초과했어요.',
  CARD_PROCESSING_ERROR:            '카드사 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
  NEED_CARD_PAYMENT_ADDITIONAL_AUTH:'카드사 추가 인증이 필요해요. 카드사 앱에서 확인해주세요.',
  // 빌링키 관련
  NOT_REGISTERED_BILLING_KEY:       '카드 정보가 만료됐어요. 다시 카드를 등록해주세요.',
  INVALID_CARD_COMPANY:             '지원하지 않는 카드사예요.',
  // 내부 오류
  db_error_after_charge:            '결제는 완료됐지만 처리 중 오류가 발생했어요. 설정 → 오류 신고로 알려주시면 빠르게 처리해드릴게요.',
  db_error:                         '처리 중 오류가 발생했어요. 설정 → 오류 신고로 알려주세요.',
  issue_failed:                     '카드 등록에 실패했어요. 카드 정보를 다시 확인해주세요.',
  missing_params:                   '결제 정보가 올바르지 않아요. 다시 시도해주세요.',
  user_cancel:                      '결제가 취소됐어요.',
  server_error:                     '서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
};

function getFailureMessage(reason) {
  if (!reason) return '결제 중 오류가 발생했어요. 다시 시도해주세요.';
  return FAILURE_MESSAGES[reason] || '결제에 실패했어요. 다시 시도해주세요.';
}

function BillingResultInner() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const reason = searchParams.get('reason');
  const [seconds, setSeconds] = useState(3);

  const isSuccess = status === 'success';
  const isUserCancel = reason === 'user_cancel';

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
    <div style={{
      minHeight: '100dvh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: 24,
      background: 'var(--bg, #fff)', color: 'var(--text, #111)',
      textAlign: 'center',
    }}>
      {isSuccess ? (
        <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 8 }}>
          <svg viewBox="0 0 120 120" width="120" height="120" style={{ overflow: 'visible' }}>
            <circle
              cx="60" cy="60" r="54"
              fill="none" stroke="#111" strokeWidth="5"
              strokeDasharray="339.3"
              strokeDashoffset="339.3"
              strokeLinecap="round"
              style={{ animation: 'circleIn 0.5s cubic-bezier(0.4,0,0.2,1) 0.1s forwards' }}
            />
            <polyline
              points="34,62 52,80 86,42"
              fill="none" stroke="#111" strokeWidth="6"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="80"
              strokeDashoffset="80"
              style={{ animation: 'checkIn 0.4s cubic-bezier(0.4,0,0.2,1) 0.55s forwards' }}
            />
          </svg>
          <style>{`
            @keyframes circleIn {
              to { stroke-dashoffset: 0; }
            }
            @keyframes checkIn {
              to { stroke-dashoffset: 0; }
            }
            @keyframes fadeUp {
              from { opacity: 0; transform: translateY(12px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      ) : (
        <div style={{ fontSize: 48 }}>{isUserCancel ? '👋' : '😢'}</div>
      )}

      <div style={{
        fontSize: 24, fontWeight: 700,
        opacity: 0,
        animation: isSuccess ? 'fadeUp 0.4s ease 0.9s forwards' : 'none',
        ...(isSuccess ? {} : { opacity: 1 }),
      }}>
        {isSuccess ? '구독이 시작됐어요!' : isUserCancel ? '결제가 취소됐어요' : '결제에 실패했어요'}
      </div>

      {!isSuccess && (
        <div style={{
          fontSize: 15, lineHeight: 1.6,
          color: isUserCancel ? 'var(--text2, #888)' : '#e04e4e',
          fontWeight: isUserCancel ? 400 : 600,
          background: isUserCancel ? 'transparent' : 'rgba(235,87,87,0.08)',
          borderRadius: 10, padding: isUserCancel ? '0' : '10px 18px',
          maxWidth: 300,
        }}>
          {getFailureMessage(reason)}
        </div>
      )}

      {isSuccess && (
        <div style={{
          fontSize: 14, color: 'var(--text2, #888)',
          opacity: 0, animation: 'fadeUp 0.4s ease 1.1s forwards',
        }}>
          {seconds}초 후 홈으로 돌아갑니다
        </div>
      )}

      <button
        onClick={() => window.location.replace('/?_subRefresh=' + Date.now())}
        style={{
          marginTop: 4, padding: '14px 36px',
          borderRadius: 14, border: 'none',
          background: '#111', color: '#fff',
          fontWeight: 700, fontSize: 16, cursor: 'pointer',
          opacity: isSuccess ? 0 : 1,
          animation: isSuccess ? 'fadeUp 0.4s ease 1.2s forwards' : 'none',
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
