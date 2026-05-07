'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { BookOpen, Database, ListTodo, BarChart3, CalendarDays, Flag } from 'lucide-react';
import DbPicker from './DbPicker';
import NotionLoadingOverlay from './NotionLoadingOverlay';
import { resolveApiUrl } from './lib/apiClient';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS, DEFAULT_GOAL_FIELDS } from '@/app/lib/fields';
import { filterPropNamesByExpectedType } from '@/app/lib/notionFieldExpectations';
import NotionFieldMapRow from './NotionFieldMapRow';
import GoalStatusPickerBlock from './GoalStatusPickerBlock';
import { hapticLight } from './lib/haptics';
import { mergeDbsById } from '@/app/lib/mergeDatabases';
import { pollDatabaseListUntilNonEmpty } from '@/app/lib/notionDbListPoll';
import { PREMIUM_GATES_ENABLED } from '@/app/lib/featureFlags';
import { filterGoalDatabaseCandidates } from '@/app/lib/notionGoalDb';
import { fetchWithTimeout } from '@/app/lib/fetchWithTimeout';
const WELCOME_SLIDE_COUNT = 5;

function notionFetchOpts() {
  return {
    credentials: 'include',
    headers: {},
  };
}

export default function Onboarding({ t, locale, onComplete, onStartLocal, initialStep = 0, fromOAuth = false }) {
  const [step, setStep] = useState(initialStep);
  const [dbs, setDbs] = useState([]);
  const [dbTodo, setDbTodo] = useState('');
  const [dbRep, setDbRep] = useState('');
  const [dbGoal, setDbGoal] = useState('');
  const [todoProps, setTodoProps] = useState([]);
  const [repProps, setRepProps] = useState([]);
  const [todoF, setTodoF] = useState({ ...DEFAULT_TODO_FIELDS });
  const [repF, setRepF] = useState({ ...DEFAULT_REPORT_FIELDS });
  const [goalProps, setGoalProps] = useState([]);
  const [goalF, setGoalF] = useState({ ...DEFAULT_GOAL_FIELDS });
  const [goalStatusOptions, setGoalStatusOptions] = useState([]);
  const [goalStatusOptionsLoading, setGoalStatusOptionsLoading] = useState(false);
  const [dbsListLoading, setDbsListLoading] = useState(false);
  const [propsLoading, setPropsLoading] = useState(false);
  const [err, setErr] = useState('');
  const [oauthStarting, setOauthStarting] = useState(false);
  const [dbsListRetryKey, setDbsListRetryKey] = useState(0);
  const dbsBlockerTimer = useRef(null);
  const [dbsBlockerVisible, setDbsBlockerVisible] = useState(false);
  const [notionAccountName, setNotionAccountName] = useState(null);
  const [sessionInfoReady, setSessionInfoReady] = useState(false);
  const [hasNotionSession, setHasNotionSession] = useState(false);
  const [welcomeSlideIx, setWelcomeSlideIx] = useState(0);
  const welcomeTouchX = useRef(null);
  const [subscription, setSubscription] = useState(null);
  const ko = locale === 'ko';

  const goalDbCandidates = useMemo(() => filterGoalDatabaseCandidates(dbs), [dbs]);
  const hasPremium =
    !PREMIUM_GATES_ENABLED ||
    subscription?.status === 'active' ||
    subscription?.status === 'trialing';

  useEffect(() => {
    fetch(resolveApiUrl('/api/subscription'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSubscription(j))
      .catch(() => setSubscription(null));
  }, []);

  /** 뒤로가기(bfcache) 또는 Capacitor 웹뷰 복귀 시 OAuth 오버레이가 영구 표시되는 현상 방지 */
  useEffect(() => {
    const onShow = (e) => {
      if (e.persisted) setOauthStarting(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setOauthStarting(false);
    };
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const startNotionOAuth = async () => {
    setErr('');
    setOauthStarting(true);
    // 한 프레임 쉬어 전체화면 준비 오버레이가 먼저 그려지게 (온보딩이 '올라가는' 느낌 완화)
    await new Promise((r) => requestAnimationFrame(r));
    try {
      const res = await fetch(resolveApiUrl('/api/auth/notion?format=json'), {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`);
      }
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('No authorize URL');
    } catch (e) {
      setErr(e?.message || 'OAuth failed');
      setOauthStarting(false);
    }
  };

  /** OAuth 직후 httpOnly 쿠키가 한두 프레임 늦게 붙을 수 있음 — App.js 와 같이 재시도 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maxAttempts = 8;
      const delayMs = 320;
      let authenticated = false;
      let workspaceName = null;
      for (let attempt = 0; attempt < maxAttempts && !cancelled; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, delayMs));
        try {
          const r = await fetchWithTimeout(
            resolveApiUrl('/api/auth/session'),
            { credentials: 'include' },
            12000
          );
          const j = await r.json().catch(() => ({}));
          if (cancelled) return;
          if (j?.authenticated) {
            authenticated = true;
            workspaceName = j?.workspace_name ? String(j.workspace_name).trim() || null : null;
            break;
          }
        } catch {
          /* retry */
        }
      }
      if (cancelled) return;
      setHasNotionSession(authenticated);
      setNotionAccountName(workspaceName);
      setSessionInfoReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const readJsonSafe = async (res) => {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text();
      throw new Error(txt.includes('<!DOCTYPE') ? '서버 라우트 오류(HTML 응답)' : txt || '서버 응답 오류');
    }
    return res.json();
  };

  useEffect(() => {
    if (dbsBlockerTimer.current) {
      clearTimeout(dbsBlockerTimer.current);
      dbsBlockerTimer.current = null;
    }
    if (step === 1 && dbsListLoading && dbs.length === 0) {
      dbsBlockerTimer.current = setTimeout(() => setDbsBlockerVisible(true), 450);
    } else {
      setDbsBlockerVisible(false);
    }
    return () => {
      if (dbsBlockerTimer.current) {
        clearTimeout(dbsBlockerTimer.current);
        dbsBlockerTimer.current = null;
      }
    };
  }, [step, dbsListLoading, dbs.length]);

  useEffect(() => {
    if (step !== 1 || !fromOAuth) return;
    // OAuth 리다이렉트 직후: httpOnly 세션 쿠키가 아직 브라우저→요청에 안 실릴 수 있음.
    // 세션 확인이 끝난 뒤에만 DB 목록을 요청해 401 레이스를 피함.
    if (!sessionInfoReady) return;
    if (!hasNotionSession) {
      setDbs([]);
      setDbsListLoading(false);
      setErr(ko ? '노션 로그인 세션이 없어요. 다시 시도해 주세요.' : 'Not signed in to Notion. Please try again.');
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    let supplementTimer;
    let supplementAc;
    setDbsListLoading(true);
    setErr('');
    (async () => {
      try {
        const fetchOnce = async () => {
          let res = await fetchWithTimeout(
            resolveApiUrl('/api/databases'),
            {
              ...notionFetchOpts(),
              signal: ac.signal,
            },
            28000
          );
          let data = await res.json().catch(() => ({}));
          // 세션은 있는데 첫 요청만 401 → 짧게 재시도 (Safari 쿠키 지연 등)
          if (res.status === 401 && (data?.error || '').includes('Missing token')) {
            await new Promise((r) => setTimeout(r, 280));
            if (cancelled) {
              const e = new Error('Aborted');
              e.name = 'AbortError';
              throw e;
            }
            res = await fetchWithTimeout(resolveApiUrl('/api/databases'), {
              ...notionFetchOpts(),
              signal: ac.signal,
            }, 28000);
            data = await res.json().catch(() => ({}));
          }
          return { res, data };
        };

        const polled = await pollDatabaseListUntilNonEmpty({
          fetchOnce,
          signal: ac.signal,
          maxAttempts: 12,
          delayMs: 720,
        });
        if (cancelled) return;
        setDbs(polled.databases || []);
        if (polled.gaveUpEmpty) {
          setErr(`${t.dbsLoadTimeout}\n\n${t.dbsLoadTimeoutHint}`);
        }
        supplementTimer = setTimeout(() => {
          if (cancelled) return;
          supplementAc = new AbortController();
          (async () => {
            try {
              const res2 = await fetchWithTimeout(resolveApiUrl('/api/databases'), {
                ...notionFetchOpts(),
                signal: supplementAc.signal,
              }, 28000);
              const d2 = await res2.json();
              if (cancelled || !res2.ok) return;
              setDbs((p) => mergeDbsById(p, d2.databases || []));
            } catch (e) {
              if (e?.name === 'AbortError') return;
            }
          })();
        }, 480);
      } catch (e) {
        if (cancelled || e?.name === 'AbortError') return;
        setErr(e.message);
      } finally {
        if (!cancelled) setDbsListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (supplementTimer) clearTimeout(supplementTimer);
      supplementAc?.abort();
      ac.abort();
    };
  }, [step, fromOAuth, dbsListRetryKey, sessionInfoReady, hasNotionSession, ko]);

  useEffect(() => {
    if (step !== 1 || !fromOAuth) return;
    if (dbs.length > 0) setErr('');
  }, [step, fromOAuth, dbs.length]);

  useEffect(() => {
    if (step !== 1 || !fromOAuth || !dbs.length) return;
    setDbTodo((prev) => {
      if (prev) return prev;
      const td = dbs.find((d) => {
        const s = String(d.title || d.label || '');
        return /to[- ]?do|todo|할\s*일|할일|투두|태스크|task/i.test(s);
      });
      return td ? td.id : prev;
    });
    setDbRep((prev) => {
      if (prev) return prev;
      const rd = dbs.find((d) => {
        const s = String(d.title || d.label || '');
        return /daily\s*report|데일리\s*리포트|daily|report|데일리/i.test(s);
      });
      return rd ? rd.id : prev;
    });
    setDbGoal((prev) => {
      const candidates = filterGoalDatabaseCandidates(dbs);
      if (candidates.length === 0) return '';
      if (prev && candidates.some((d) => d.id === prev)) return prev;
      return candidates[0].id;
    });
  }, [step, fromOAuth, dbs]);

  useEffect(() => {
    if (step !== 2) return;
    const id = String(dbGoal || '').trim();
    const prop = String(goalF.status || '').trim();
    if (!id || !prop) {
      setGoalStatusOptions([]);
      setGoalStatusOptionsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setGoalStatusOptionsLoading(true);
    fetch(
      resolveApiUrl(
        `/api/databases/status-options?dbId=${encodeURIComponent(id)}&property=${encodeURIComponent(prop)}`
      ),
      notionFetchOpts()
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setGoalStatusOptions(Array.isArray(data?.options) ? data.options : []);
      })
      .catch(() => {
        if (!cancelled) setGoalStatusOptions([]);
      })
      .finally(() => {
        if (!cancelled) setGoalStatusOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, dbGoal, goalF.status]);

  const fetchProps = async () => {
    if (!dbTodo) return;
    setPropsLoading(true);
    setErr('');
    try {
      let sub = subscription;
      if (sub == null) {
        try {
          const sr = await fetch(resolveApiUrl('/api/subscription'), { credentials: 'include' });
          sub = sr.ok ? await sr.json() : null;
          setSubscription(sub);
        } catch {
          sub = null;
        }
      }
      const hasPremiumForMap =
        !PREMIUM_GATES_ENABLED || sub?.status === 'active' || sub?.status === 'trialing';

      const dbGoalTrim = String(dbGoal || '').trim();
      const [tr, rr, gr] = await Promise.all([
        fetch(resolveApiUrl(`/api/databases/properties?dbId=${encodeURIComponent(dbTodo)}`), notionFetchOpts()),
        dbRep
          ? fetch(resolveApiUrl(`/api/databases/properties?dbId=${encodeURIComponent(dbRep)}`), notionFetchOpts())
          : Promise.resolve(null),
        dbGoalTrim
          ? fetch(resolveApiUrl(`/api/databases/properties?dbId=${encodeURIComponent(dbGoalTrim)}`), notionFetchOpts())
          : Promise.resolve(null),
      ]);
      const td = await readJsonSafe(tr);
      if (!tr.ok) throw new Error(td?.error || 'Failed to load todo properties');
      const todoProperties = td.properties || [];
      setTodoProps(todoProperties);
      setTodoF((prev) => {
        const spec = {
          name: { aliases: ['이름', 'Name', prev.name], types: ['title', 'rich_text'] },
          date: { aliases: ['날짜', 'Date', prev.date], types: ['date'] },
          done: { aliases: ['완료', 'Done', prev.done], types: ['checkbox', 'status'] },
          accum: {
            aliases: [
              'Focus',
              'Focus min',
              'Focus Time',
              'Min',
              '집중시간',
              '누적(분)',
              '누적분',
              'Accumulated (min)',
              prev.accum,
            ],
            types: ['number', 'formula', 'rollup'],
          },
        };
        if (hasPremiumForMap) {
          spec.goal = {
            aliases: ['Goal', '목표', '목표 연결', '목표연결', 'Goal link', 'Related', 'Relation', prev.goal],
            types: ['relation'],
          };
          spec.timeBlocking = {
            aliases: [
              'Timetable',
              'Time block',
              'Time blocks',
              '시간표',
              '타임박싱',
              '타임블로킹',
              '타임블록',
              '타임 블록',
              prev.timeBlocking,
            ],
            types: ['rich_text', 'relation'],
          };
        }
        return autoMatchFields(prev, todoProperties, spec);
      });
      if (rr) {
        const rd = await readJsonSafe(rr);
        if (!rr.ok) throw new Error(rd?.error || 'Failed to load report properties');
        const reportProperties = rd.properties || [];
        setRepProps(reportProperties);
        setRepF((prev) =>
          autoMatchFields(prev, reportProperties, {
            review: {
              aliases: [
                '하루 리뷰',
                '한줄리뷰',
                '한줄 리뷰',
                '회고',
                'One-line Review',
                'Daily Review',
                prev.review,
              ],
              types: ['rich_text', 'title'],
            },
            totalMin: {
              aliases: [
                '집중 합계',
                '하루 집중 합계',
                '오늘 순공시간(분)',
                '오늘순공시간(분)',
                'Today Focus (min)',
                prev.totalMin,
              ],
              types: ['number', 'formula', 'rollup'],
            },
            todoList: { aliases: ['To-do List', '할일 목록', prev.todoList], types: ['relation'] },
            date: { aliases: ['날짜', 'Date', prev.date], types: ['date'] },
          })
        );
      } else {
        setRepProps([]);
      }
      if (gr) {
        const gd = await readJsonSafe(gr);
        if (!gr.ok) throw new Error(gd?.error || 'Failed to load goal database properties');
        const goalProperties = gd.properties || [];
        setGoalProps(goalProperties);
        setGoalF((prev) =>
          autoMatchFields(prev, goalProperties, {
            name: { aliases: ['Name', '이름', 'Title', '제목', prev.name], types: ['title'] },
            status: { aliases: ['Status', '상태', 'State', prev.status], types: ['select', 'status'] },
          })
        );
      } else {
        setGoalProps([]);
        setGoalF({ ...DEFAULT_GOAL_FIELDS });
      }
      setStep(2);
    } catch (e) {
      setErr(e.message);
    } finally {
      setPropsLoading(false);
    }
  };

  if (step === 0) {
    const welcomeSlides = [
      { Icon: BookOpen, title: t.welcomeSlide1Title, body: t.welcomeSlide1Body },
      { Icon: Database, title: t.welcomeSlide2Title, body: t.welcomeSlide2Body },
      { Icon: ListTodo, title: t.welcomeSlide3Title, body: t.welcomeSlide3Body },
      { Icon: BarChart3, title: t.welcomeSlide4Title, body: t.welcomeSlide4Body },
      { Icon: CalendarDays, title: t.welcomeSlide5Title, body: t.welcomeSlide5Body },
    ];
    const cur = welcomeSlides[welcomeSlideIx] || welcomeSlides[0];
    const WelcomeIcon = cur.Icon;
    const isLastWelcome = welcomeSlideIx >= WELCOME_SLIDE_COUNT - 1;
    const onWelcomeTouchStart = (e) => {
      welcomeTouchX.current = e.touches[0].clientX;
    };
    const onWelcomeTouchEnd = (e) => {
      if (welcomeTouchX.current == null) return;
      const te = e.changedTouches?.[0];
      if (!te) {
        welcomeTouchX.current = null;
        return;
      }
      const x = te.clientX;
      const dx = x - welcomeTouchX.current;
      welcomeTouchX.current = null;
      if (Math.abs(dx) < 48) return;
      if (dx < 0 && welcomeSlideIx < WELCOME_SLIDE_COUNT - 1) {
        setWelcomeSlideIx((i) => i + 1);
        hapticLight();
      } else if (dx > 0 && welcomeSlideIx > 0) {
        setWelcomeSlideIx((i) => i - 1);
        hapticLight();
      }
    };

    return (
      <>
        <div className="onboard onboard-welcome">
          <div className="onboard-glow" aria-hidden />
          <div className="welcome-body-scroll w-full flex-1">
            <div className="welcome-dots-row w-full">
              <div className="dots">
                {Array.from({ length: WELCOME_SLIDE_COUNT }, (_, i) => (
                  <div key={i} className={`dot ${i === welcomeSlideIx ? 'on' : ''}`} />
                ))}
              </div>
            </div>
            <div
              key={welcomeSlideIx}
              className="welcome-slide-panel welcome-slide-main w-full flex flex-col items-center text-center"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 52,
                paddingLeft: 0,
                paddingRight: 0,
                paddingBottom: 12,
                flexShrink: 0,
              }}
              onTouchStart={onWelcomeTouchStart}
              onTouchEnd={onWelcomeTouchEnd}
            >
              <div className="welcome-slide-icon-wrap" aria-hidden>
                <WelcomeIcon size={40} strokeWidth={1.85} />
              </div>
              <h1
                className="welcome-slide-title"
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: 'var(--text)',
                  letterSpacing: '-0.4px',
                  lineHeight: 1.3,
                  margin: '0 0 12px',
                  maxWidth: 320,
                }}
              >
                {cur.title}
              </h1>
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 400,
                  color: 'var(--text2)',
                  lineHeight: 1.55,
                  margin: 0,
                  maxWidth: 340,
                }}
              >
                {cur.body}
              </p>
            </div>
          </div>
          <div
            className="w-full stack-sm onboard-welcome-actions"
            style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))', flexShrink: 0 }}
          >
            {!isLastWelcome ? (
              <button
                type="button"
                className="btn btn-dark btn-lg btn-full"
                onClick={() => {
                  hapticLight();
                  setWelcomeSlideIx((i) => Math.min(WELCOME_SLIDE_COUNT - 1, i + 1));
                }}
              >
                {t.welcomeNext}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-dark btn-lg btn-full"
                  onClick={() => startNotionOAuth()}
                  disabled={oauthStarting}
                >
                  {t.connectNotion}
                </button>
                {err ? (
                  <div style={{ color: 'var(--red)', fontSize: 14, fontWeight: 500, textAlign: 'center' }}>{err}</div>
                ) : null}
              </>
            )}
            <button
              type="button"
              className="welcome-skip-btn welcome-skip-btn--footer"
              onClick={() => onStartLocal?.()}
              disabled={oauthStarting}
            >
              {t.welcomeSkip}
            </button>
          </div>
        </div>
        <NotionLoadingOverlay open={oauthStarting} message={t.notionOAuthOverlayMessage} />
      </>
    );
  }

  if (step === 1) {
    const sessionRejected = sessionInfoReady && fromOAuth && !hasNotionSession;
    const showDbListOverlay =
      !sessionRejected &&
      (dbsListLoading ||
        dbsBlockerVisible ||
        (fromOAuth && !sessionInfoReady));

    return (
      <>
      <div
        className="onboard"
        style={{ justifyContent: 'space-between', paddingTop: 'calc(96px + env(safe-area-inset-top, 0px))' }}
      >
        <NotionLoadingOverlay open={showDbListOverlay} message={t.loadingDbs} />
        <div className="w-full flex-1" style={{ overflowY: 'auto' }}>
          <StepDots max={2} cur={0} />
          {sessionRejected ? (
            <div className="stack" style={{ gap: 12, marginBottom: 20 }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text2)', lineHeight: 1.55, margin: 0 }}>
                {ko
                  ? '노션 로그인 세션을 확인하지 못했어요. 아래에서 다시 연결하거나 페이지를 새로고침 해 보세요.'
                  : 'Could not verify your Notion session. Try connecting again below, or refresh the page.'}
              </p>
              <button
                type="button"
                className="btn btn-dark btn-md btn-full"
                onClick={() => startNotionOAuth()}
                disabled={oauthStarting}
              >
                {oauthStarting ? <span className="spin spin-dark" /> : t.connectNotionCta}
              </button>
            </div>
          ) : null}
          {!sessionRejected && (
            <>
              {sessionInfoReady && hasNotionSession && (
                <div
                  className="card card-p"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 20,
                    border: '1px solid var(--sep)',
                    boxShadow: 'none',
                  }}
                >
                  <span className="settings-notion-trail-dot" style={{ paddingTop: 1 }} aria-hidden>
                    ●
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 2 }}>
                      {ko ? '연결된 노션' : 'Connected Notion'}
                    </div>
                    <div
                      className="truncate"
                      style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.2px' }}
                    >
                      {notionAccountName || (ko ? '워크스페이스' : 'Workspace')}
                    </div>
                  </div>
                </div>
              )}
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>
                {t.selectDatabases}
              </div>
              {err ? (
                <div className="stack" style={{ gap: 8, marginBottom: 16 }}>
                  <div
                    style={{
                      color: 'var(--red)',
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {err}
                  </div>
                </div>
              ) : null}
              {fromOAuth && !dbsListLoading && dbs.length === 0 && (
                <div className="stack" style={{ gap: 12, marginBottom: 20 }}>
                  <button
                    type="button"
                    onClick={() => {
                      hapticLight();
                      setErr('');
                      setDbsListRetryKey((k) => k + 1);
                    }}
                    className="btn btn-md"
                    style={{
                      alignSelf: 'flex-start',
                      borderRadius: 10,
                      padding: '9px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      background: 'var(--bg2)',
                      border: '1px solid var(--sep)',
                      color: 'var(--text)',
                    }}
                  >
                    {t.reloadDatabases}
                  </button>
                </div>
              )}
              <div className="list-sec list-sec--stack-md list-sec--db-pickers-only">
                <DbPicker
                  LeadingIcon={ListTodo}
                  label={t.notionDbLabelTodo}
                  value={dbTodo}
                  databases={dbs}
                  onChange={setDbTodo}
                  placeholder={t.selectDB}
                  compact
                  nameFontSize={14}
                />
                <DbPicker
                  LeadingIcon={BarChart3}
                  label={t.notionDbLabelReport}
                  value={dbRep}
                  databases={dbs}
                  onChange={setDbRep}
                  placeholder={t.selectDB}
                  compact
                  nameFontSize={14}
                />
                {goalDbCandidates.length > 0 && (
                  <DbPicker
                    LeadingIcon={Flag}
                    label={t.notionDbLabelGoal}
                    value={dbGoal}
                    databases={goalDbCandidates}
                    onChange={setDbGoal}
                    placeholder={t.selectDBOptional}
                    compact
                    nameFontSize={14}
                  />
                )}
              </div>
            </>
          )}
        </div>
        <div
          className="w-full stack-sm"
          style={{
            position: 'sticky',
            bottom: 0,
            background: 'var(--bg)',
            paddingTop: 10,
            paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
            zIndex: 2,
          }}
        >
          <button className="btn btn-dark btn-lg btn-full" onClick={fetchProps} disabled={!dbTodo || dbsListLoading || propsLoading}>
            {propsLoading ? <span className="spin" /> : t.next}
          </button>
          <button
            className="btn btn-muted btn-lg btn-full"
            style={{ fontSize: 15 }}
            onClick={() => {
              setErr('');
              setStep(0);
            }}
          >
            {t.back}
          </button>
        </div>
      </div>
      <NotionLoadingOverlay open={oauthStarting} message={t.notionOAuthOverlayMessage} />
      </>
    );
  }

  if (step === 2) {
    const tNames = todoProps.map((p) => p.name);
    const rNames = repProps.map((p) => p.name);
    const gNames = goalProps.map((p) => p.name);
    const tTypeMap = new Map(todoProps.map((p) => [p.name, p.type]));
    const rTypeMap = new Map(repProps.map((p) => [p.name, p.type]));
    const gTypeMap = new Map(goalProps.map((p) => [p.name, p.type]));
    const lko = (locale || 'ko') === 'ko';
    const reportReviewLabel = lko ? '하루 리뷰' : 'Daily Review';
    const reportTotalLabel = lko ? '집중 합계' : 'Focus Total';
    const isStatusPickerChecked = (label) => {
      if (Array.isArray(goalF.statusPickerLabels)) return goalF.statusPickerLabels.includes(label);
      const ip = String(goalF.inProgress || 'In progress').trim();
      return goalStatusOptions.includes(ip) && label === ip;
    };
    const toggleStatusPickerLabel = (label) => {
      hapticLight();
      let base;
      if (Array.isArray(goalF.statusPickerLabels)) {
        base = [...goalF.statusPickerLabels];
      } else {
        const ip = String(goalF.inProgress || 'In progress').trim();
        base = ip && goalStatusOptions.includes(ip) ? [ip] : [];
      }
      const set = new Set(base);
      if (set.has(label)) set.delete(label);
      else set.add(label);
      setGoalF((f) => ({ ...f, statusPickerLabels: [...set] }));
    };
    return (
      <div
        className="onboard"
        style={{ justifyContent: 'space-between', paddingTop: 'calc(84px + env(safe-area-inset-top, 0px))' }}
      >
        <div className="w-full flex-1" style={{ overflowY: 'auto' }}>
          <StepDots max={2} cur={1} />
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>{t.confirmFields}</div>

          <div className="list-sec list-sec--stack-md">
            {[
              { key: 'name', lbl: t.fieldName },
              { key: 'date', lbl: t.fieldDate },
              { key: 'done', lbl: t.fieldDone },
              { key: 'accum', lbl: t.fieldAccum },
              ...(hasPremium
                ? [
                    { key: 'goal', lbl: t.fieldGoalRelation },
                    { key: 'timeBlocking', lbl: t.fieldTimeBlocking },
                  ]
                : []),
            ].map(({ key, lbl }) => (
              <NotionFieldMapRow
                key={key}
                variant="onboarding"
                mapSection="todo"
                fieldKey={key}
                lbl={lbl}
                val={todoF[key] || ''}
                names={filterPropNamesByExpectedType(tNames, tTypeMap, key, 'todo', todoF[key])}
                typeMap={tTypeMap}
                loaded
                titleMissing={t.fieldMapNameMissing}
                titleMismatch={t.fieldMapTypeMismatch}
                titleRequired={t.fieldMapRequired}
                onChange={(v) => setTodoF((f) => ({ ...f, [key]: v }))}
              />
            ))}
          </div>

          {dbRep && rNames.length > 0 && (
            <div className="list-sec list-sec--stack-md">
              {[
                { key: 'review', lbl: reportReviewLabel },
                { key: 'totalMin', lbl: reportTotalLabel },
              ].map(({ key, lbl }) => (
                <NotionFieldMapRow
                  key={key}
                  variant="onboarding"
                  mapSection="report"
                  fieldKey={key}
                  lbl={lbl}
                  val={repF[key] || ''}
                  names={filterPropNamesByExpectedType(rNames, rTypeMap, key, 'report', repF[key])}
                  typeMap={rTypeMap}
                  loaded
                  titleMissing={t.fieldMapNameMissing}
                  titleMismatch={t.fieldMapTypeMismatch}
                  titleRequired={t.fieldMapRequired}
                  onChange={(v) => setRepF((f) => ({ ...f, [key]: v }))}
                />
              ))}
            </div>
          )}

          {String(dbGoal || '').trim() && gNames.length > 0 && (
            <div className="list-sec list-sec--stack-md">
              {[
                { key: 'name', lbl: t.goalMapName },
                { key: 'status', lbl: t.goalMapStatus },
              ].map(({ key, lbl }) => (
                <NotionFieldMapRow
                  key={key}
                  variant="onboarding"
                  mapSection="goal"
                  fieldKey={key}
                  lbl={lbl}
                  val={goalF[key] || ''}
                  names={filterPropNamesByExpectedType(gNames, gTypeMap, key, 'goal', goalF[key])}
                  typeMap={gTypeMap}
                  loaded
                  titleMissing={t.fieldMapNameMissing}
                  titleMismatch={t.fieldMapTypeMismatch}
                  titleRequired={t.fieldMapRequired}
                  onChange={(v) => setGoalF((f) => ({ ...f, [key]: v }))}
                />
              ))}
              <GoalStatusPickerBlock
                t={t}
                loading={goalStatusOptionsLoading}
                options={goalStatusOptions}
                isChecked={isStatusPickerChecked}
                onToggle={toggleStatusPickerLabel}
                manualFallback={
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                      {t.goalMapInProgress}
                    </div>
                    <input
                      className="input"
                      style={{ width: '100%' }}
                      value={goalF.inProgress ?? ''}
                      onChange={(e) => setGoalF((f) => ({ ...f, inProgress: e.target.value }))}
                      placeholder={lko ? '예: In progress, 진행 중' : 'e.g. In progress'}
                      aria-label={t.goalMapInProgress}
                    />
                    <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.45, margin: '12px 0 0' }}>
                      {t.goalInProgressManualHint}
                    </p>
                  </>
                }
              />
            </div>
          )}
        </div>
        <div
          className="w-full stack-sm"
          style={{
            position: 'sticky',
            bottom: 0,
            background: 'var(--bg)',
            paddingTop: 16,
            paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
            zIndex: 2,
          }}
        >
          <button
            className="btn btn-dark btn-lg btn-full"
            onClick={async () => {
              let name = notionAccountName;
              if (!name) {
                try {
                  const r = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
                  const j = await r.json().catch(() => ({}));
                  if (j?.workspace_name) name = String(j.workspace_name).trim();
                } catch { /* */ }
              }
              onComplete(
                {
                  authMode: 'oauth',
                  dbTodo,
                  dbReport: dbRep,
                  ...(String(dbGoal || '').trim() ? { dbGoal: String(dbGoal).trim() } : {}),
                  ...(name ? { workspaceName: name } : {}),
                },
                {
                  todoFields: todoF,
                  reportFields: repF,
                  ...(String(dbGoal || '').trim() ? { goalFields: goalF } : {}),
                }
              );
            }}
          >
            {t.finish}
          </button>
          <button className="btn btn-muted btn-lg btn-full" style={{ fontSize: 15 }} onClick={() => setStep(1)}>
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboard" style={{ justifyContent: 'center', padding: 28, textAlign: 'center' }}>
      <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 20 }}>
        {ko ? '온보딩 화면을 불러오지 못했어요. 처음으로 돌아가 주세요.' : 'We couldn’t show this step. Please go back to the start.'}
      </p>
      <button
        type="button"
        className="btn btn-dark btn-lg btn-full"
        onClick={() => {
          setErr('');
          setWelcomeSlideIx(0);
          setStep(0);
        }}
      >
        {ko ? '처음으로' : 'Start over'}
      </button>
    </div>
  );
}

const StepDots = ({ max, cur }) => (
  <div className="dots" style={{ marginBottom: 20 }}>
    {Array.from({ length: max }, (_, i) => (
      <div key={i} className={`dot ${i === cur ? 'on' : ''}`} />
    ))}
  </div>
);

function autoMatchFields(prevFields, properties, configByKey) {
  const list = (properties || []).filter((p) => p?.name);
  if (!list.length) return prevFields;
  const byNorm = new Map(list.map((p) => [normalizeName(p.name), p.name]));
  const next = { ...prevFields };
  for (const [key, cfg] of Object.entries(configByKey)) {
    const aliases = cfg?.aliases || [];
    const preferredTypes = cfg?.types || [];
    const candidates = [next[key], ...aliases].filter(Boolean);

    const exact = candidates.map((c) => byNorm.get(normalizeName(c))).find(Boolean);
    if (exact) {
      next[key] = exact;
      continue;
    }

    const fuzzy = list.find((p) => {
      const pn = normalizeName(p.name);
      return candidates.some((c) => {
        const cn = normalizeName(c);
        return cn && pn && (pn.includes(cn) || cn.includes(pn));
      });
    });
    if (fuzzy) {
      next[key] = fuzzy.name;
      continue;
    }

    if (preferredTypes.length) {
      const byType = list.find((p) => preferredTypes.includes(p.type));
      if (byType) next[key] = byType.name;
    }
  }
  return next;
}

function normalizeName(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}
