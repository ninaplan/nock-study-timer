-- subscriptions 테이블에 trial_started_at 컬럼 추가
-- Supabase SQL Editor에서 실행

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
