'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  Check,
  Mail,
  MessageSquare,
  Globe,
  CalendarDays,
  Megaphone,
  Shield,
  FileText,
  Link2,
} from 'lucide-react';
import { resolveApiUrl } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { mergeDbsById } from '@/app/lib/mergeDatabases';
import { pollDatabaseListUntilNonEmpty } from '@/app/lib/notionDbListPoll';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS, DEFAULT_GOAL_FIELDS } from '@/app/lib/fields';
import { getAppVersionLabel, openSupportEmail } from '@/app/lib/supportEmail';
import { hapticLight } from './lib/haptics';
import PopupDialog from './PopupDialog';
import SubscribeSheet, { MembershipCard } from './SubscribeSheet';
import NotionLoadingOverlay from './NotionLoadingOverlay';
import DbPicker from './DbPicker';
import NotionMark from './NotionMark';
import NotionFieldMapRow from './NotionFieldMapRow';

const FEEDBACK_URL = 'https://nockmarket.notion.site/nock-timer-feedback';

/** iOS Safari ignores text-align on select; overlay an invisible native control on a right-aligned label. */
function SettingsNativeSelect({ ariaLabel, value, options, onChange }) {
  const label = options.find((o) => o.value === value)?.label ?? '';
  return (
    <div className="settings-select-shell">
      <span className="settings-select-face">{label}</span>
      <span className="settings-chevron" aria-hidden>
        ›
      </span>
      <select className="settings-native-select-hidden" aria-label={ariaLabel} value={value} onChange={onChange}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function notionFetchOpts(token) {
  return {
    credentials: 'include',
    headers: { ...(String(token || '').trim() ? { 'x-notion-token': String(token).trim() } : {}) },
  };
}

export default function SettingsTab({
  t,
  creds,
  settings,
  isDemoMode,
  onSaveSettings,
  onSaveCreds,
  onDisconnect,
  locale,
  openNotionSubpageOnMount = false,
}) {
  const [notionDetail, setNotionDetail] = useState(!!openNotionSubpageOnMount);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [token, setToken] = useState(creds?.token || '');
  const [dbTodo, setDbTodo] = useState(creds?.dbTodo || '');
  const [dbRep, setDbRep] = useState(creds?.dbReport || '');
  const [dbGoal, setDbGoal] = useState(creds?.dbGoal || '');
  const [dbs, setDbs] = useState([]);
  const [dbsRefreshKey, setDbsRefreshKey] = useState(0);
  const [tProps, setTProps] = useState([]);
  const [rProps, setRProps] = useState([]);
  const [gProps, setGProps] = useState([]);
  const [dbsListLoading, setDbsListLoading] = useState(false);
  const [dbsBlockerVisible, setDbsBlockerVisible] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [subscribeSheetOpen, setSubscribeSheetOpen] = useState(false);
  const dbsBlockerTimer = useRef(null);
  const prevDbsLenForErrClear = useRef(null);
  const credsRef = useRef(creds);
  const tokenFieldRef = useRef(token);
  const sessionBumpRef = useRef(false);
  credsRef.current = creds;
  tokenFieldRef.current = token;
  const ko = locale === 'ko';
  const reportReviewLabel = ko ? '하루 리뷰' : 'Daily Review';
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionAuthenticated, setSessionAuthenticated] = useState(false);

  useEffect(() => {
    if (isDemoMode) return;
    fetch(resolveApiUrl('/api/subscription'), { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setSubscription(d))
      .catch(() => {});
  }, [isDemoMode]);
  const reportTotalLabel = ko ? '집중 합계' : 'Focus Total';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        setSessionAuthenticated(!!j?.authenticated);
      } catch {
        if (!cancelled) setSessionAuthenticated(false);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const tf = { ...DEFAULT_TODO_FIELDS, ...(settings?.todoFields || {}) };
  const rf = { ...DEFAULT_REPORT_FIELDS, ...(settings?.reportFields || {}) };
  const gf = { ...DEFAULT_GOAL_FIELDS, ...(settings?.goalFields || {}) };

  const startNotionOAuth = useCallback(async () => {
    setErr('');
    setOauthBusy(true);
    try {
      const res = await fetch(resolveApiUrl('/api/auth/notion?format=json&return=settings'), {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`);
      if (data?.url) window.location.href = data.url;
      else throw new Error('No authorize URL');
    } catch (e) {
      setErr(e?.message || 'OAuth failed');
    } finally {
      setOauthBusy(false);
    }
  }, []);

  const readJsonSafe = async (res) => {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text();
      throw new Error(txt.includes('<!DOCTYPE') ? '서버 라우트 오류(HTML 응답)' : txt || '서버 응답 오류');
    }
    return res.json();
  };

  const fetchProps = async (id, type) => {
    if (!id) return;
    try {
      const res = await fetch(
        resolveApiUrl(`/api/databases/properties?dbId=${encodeURIComponent(id)}`),
        notionFetchOpts(token || creds?.token)
      );
      const d = await readJsonSafe(res);
      if (!res.ok) throw new Error(d?.error || 'Failed');
      if (type === 'todo') setTProps(d.properties || []);
      else if (type === 'report') setRProps(d.properties || []);
      else if (type === 'goal') setGProps(d.properties || []);
    } catch (e) {
      setErr(e?.message || 'Failed');
    }
  };

  const handleSave = () => {
    if (!dbTodo) return;
    const next = { ...creds, dbTodo, dbReport: dbRep };
    if (String(dbGoal || '').trim()) next.dbGoal = String(dbGoal).trim();
    else delete next.dbGoal;
    if (token.trim()) next.token = token.trim();
    else if (creds?.token) next.token = creds.token;
    onSaveCreds(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const chgField = (type, key, val) => {
    if (type === 'todo') onSaveSettings({ ...settings, todoFields: { ...tf, [key]: val } });
    else onSaveSettings({ ...settings, reportFields: { ...rf, [key]: val } });
  };

  const chgGoalField = (key, val) => {
    onSaveSettings({ ...settings, goalFields: { ...gf, [key]: val } });
  };

  useEffect(() => {
    if (hasNotionAuth(creds) && creds?.dbTodo && tProps.length === 0) fetchProps(creds.dbTodo, 'todo');
    if (hasNotionAuth(creds) && creds?.dbReport && rProps.length === 0) fetchProps(creds.dbReport, 'report');
    if (hasNotionAuth(creds) && creds?.dbGoal && gProps.length === 0) fetchProps(creds.dbGoal, 'goal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds?.authMode, creds?.token, creds?.dbTodo, creds?.dbReport, creds?.dbGoal]);

  const canLoadDbs = hasNotionAuth(creds) || token.trim();
  const isOAuth = creds?.authMode === 'oauth' && hasNotionAuth(creds);

  useEffect(() => {
    if (!notionDetail) sessionBumpRef.current = false;
  }, [notionDetail]);

  useEffect(() => {
    if (!notionDetail || !canLoadDbs || !sessionReady) return;
    const tok = (tokenFieldRef.current || '').trim();
    if (tok) return;
    if (!isOAuth || sessionAuthenticated) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      (async () => {
        try {
          const r = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
          const j = await r.json().catch(() => ({}));
          if (cancelled) return;
          if (j?.authenticated) {
            setSessionAuthenticated(true);
            if (!sessionBumpRef.current) {
              sessionBumpRef.current = true;
              setDbsRefreshKey((k) => k + 1);
            }
          }
        } catch { /* */ }
      })();
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [notionDetail, canLoadDbs, sessionReady, isOAuth, sessionAuthenticated]);

  useEffect(() => {
    if (!notionDetail) {
      setDbs([]);
      setDbsListLoading(false);
      setDbsBlockerVisible(false);
    }
  }, [notionDetail]);

  useEffect(() => {
    if (dbsBlockerTimer.current) {
      clearTimeout(dbsBlockerTimer.current);
      dbsBlockerTimer.current = null;
    }
    if (dbsListLoading && dbs.length === 0) {
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
  }, [dbsListLoading, dbs.length]);

  // 노션 화면에서만: DB 목록 — 1차 응답 직후 짧은 뒤 보강 fetch로 id 합집합(한쪽 검색 지연/오류로 목록이 잘리는 경우 완화)
  useEffect(() => {
    if (!notionDetail || !canLoadDbs) return;
    const tokEarly = (tokenFieldRef.current || credsRef.current?.token || '').trim();
    if (isOAuth && !tokEarly && (!sessionReady || !sessionAuthenticated)) return;
    let cancelled = false;
    const ac = new AbortController();
    let supplementTimer;
    let supplementAc;
    setDbsListLoading(true);
    setErr('');
    (async () => {
      try {
        const fetchDbsOnce = async () => {
          const tok = (tokenFieldRef.current || credsRef.current?.token || '').trim();
          let res = await fetch(resolveApiUrl('/api/databases'), {
            ...notionFetchOpts(tok),
            signal: ac.signal,
          });
          let data = await res.json().catch(() => ({}));
          if (
            res.status === 401 &&
            String(data?.error || '').includes('Missing token') &&
            isOAuth &&
            !(tokenFieldRef.current || credsRef.current?.token || '').trim()
          ) {
            await new Promise((r) => setTimeout(r, 300));
            if (cancelled) {
              const e = new Error('Aborted');
              e.name = 'AbortError';
              throw e;
            }
            res = await fetch(resolveApiUrl('/api/databases'), {
              ...notionFetchOpts(tok),
              signal: ac.signal,
            });
            data = await res.json().catch(() => ({}));
          }
          return { res, data };
        };

        const polled = await pollDatabaseListUntilNonEmpty({
          fetchOnce: fetchDbsOnce,
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
              const res2 = await fetch(resolveApiUrl('/api/databases'), {
                ...notionFetchOpts((tokenFieldRef.current || credsRef.current?.token || '').trim()),
                signal: supplementAc.signal,
              });
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
        setErr(e?.message || 'Failed');
      } finally {
        if (!cancelled) setDbsListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (supplementTimer) clearTimeout(supplementTimer);
      supplementAc?.abort();
      ac.abort();
      setDbsListLoading(false);
      setDbsBlockerVisible(false);
    };
  }, [notionDetail, canLoadDbs, dbsRefreshKey, isOAuth, sessionReady, sessionAuthenticated]);

  useEffect(() => {
    if (!notionDetail || !canLoadDbs) return;
    const prev = prevDbsLenForErrClear.current;
    if (prev !== null && prev === 0 && dbs.length > 0) setErr('');
    prevDbsLenForErrClear.current = dbs.length;
  }, [notionDetail, canLoadDbs, dbs.length]);

  useEffect(() => {
    setToken(creds?.token || '');
    setDbTodo(creds?.dbTodo || '');
    setDbRep(creds?.dbReport || '');
    setDbGoal(creds?.dbGoal || '');
  }, [creds]);

  useEffect(() => {
    if (canLoadDbs) return;
    setDbsListLoading(false);
    setDbsBlockerVisible(false);
  }, [canLoadDbs]);

  const dbsLenRef = useRef(0);
  dbsLenRef.current = dbs.length;
  const visBumpAt = useRef(0);
  useEffect(() => {
    if (!notionDetail || !canLoadDbs) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - visBumpAt.current < 3200) return;
      visBumpAt.current = now;
      if (dbsLenRef.current === 0) {
        setDbsRefreshKey((k) => k + 1);
        return;
      }
      (async () => {
        try {
          const tok = (tokenFieldRef.current || credsRef.current?.token || '').trim();
          const res = await fetch(resolveApiUrl('/api/databases'), {
            ...notionFetchOpts(tok),
          });
          const d = await res.json();
          if (!res.ok) return;
          setDbs((p) => mergeDbsById(p, d.databases || []));
        } catch { /* */ }
      })();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [notionDetail, canLoadDbs]);

  if (notionDetail) {
    return (
      <div className="settings-page" style={{ minHeight: '100%' }}>
        <div
          className="page-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '20px 16px 22px',
          }}
        >
          <button
            type="button"
            aria-label={t.back}
            onClick={() => setNotionDetail(false)}
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              marginLeft: -4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronLeft size={28} strokeWidth={2.1} color="var(--text)" />
          </button>
          <div className="page-title" style={{ margin: 0, flex: 1, letterSpacing: '-0.3px' }}>
            {t.notionSubpageTitle}
          </div>
        </div>

        <div style={{ padding: '0 16px 48px' }}>
          {!hasNotionAuth(creds) ? (
            <div className="stack" style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 8 }}>{t.connectToSave}</p>
              <button
                type="button"
                className="btn btn-dark btn-md btn-full"
                style={{ borderRadius: 12 }}
                onClick={startNotionOAuth}
                disabled={oauthBusy}
              >
                {oauthBusy ? <span className="spin spin-dark" /> : t.signInWithNotion}
              </button>
            </div>
          ) : (
            <>
              {isOAuth && (
                <button
                  type="button"
                  onClick={() => {
                    hapticLight();
                    startNotionOAuth();
                  }}
                  disabled={oauthBusy}
                  className="card-p"
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    background: 'var(--bg2)',
                    border: '1px solid var(--sep)',
                    borderRadius: 14,
                    padding: '14px 16px',
                    marginBottom: 16,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--font)',
                    color: 'var(--text)',
                    boxShadow: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <span
                      className="settings-notion-trail-dot"
                      style={{ paddingTop: 2 }}
                      aria-hidden
                    >
                      ●
                    </span>
                    <span
                      className="truncate"
                      style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}
                    >
                      {creds.workspaceName || (ko ? '워크스페이스' : 'Workspace')}
                    </span>
                  </div>
                  {oauthBusy ? (
                    <span className="spin spin-dark" style={{ width: 18, height: 18, flexShrink: 0 }} />
                  ) : (
                    <span className="settings-chevron" style={{ color: 'var(--text3)' }} aria-hidden>
                      ›
                    </span>
                  )}
                </button>
              )}

              {!isOAuth && (
                <div className="card card-p" style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginBottom: 6 }}>{t.tokenLabel}</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: 'var(--text)',
                      letterSpacing: '-0.3px',
                      wordBreak: 'break-all',
                      lineHeight: 1.3,
                    }}
                  >
                    {creds.token ? `${creds.token.slice(0, 12)}…` : t.connected}
                  </div>
                </div>
              )}
            </>
          )}

          {hasNotionAuth(creds) && (
            <>
              {err && (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--red)',
                    fontWeight: 600,
                    marginBottom: 12,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {err}
                </div>
              )}
              <div className="sec-label">{t.selectDatabases}</div>
              <div className="card card-p mb-20">
                <div className="stack">
                  {!(creds?.authMode === 'oauth' && hasNotionAuth(creds)) && (
                    <div>
                      <label className="label">{t.tokenLabel}</label>
                      <input
                        className="input"
                        type="password"
                        placeholder={t.tokenPlaceholder}
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      />
                    </div>
                  )}
                  {!dbsListLoading && dbs.length === 0 && canLoadDbs && (
                    <div className="stack" style={{ gap: 12 }}>
                      <button
                        type="button"
                        onClick={() => {
                          hapticLight();
                          setErr('');
                          setDbsRefreshKey((k) => k + 1);
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
                  {dbs.length > 0 && (
                    <>
                      <DbPicker
                        label={t.todoDB}
                        value={dbTodo}
                        databases={dbs}
                        onChange={(id) => {
                          setDbTodo(id);
                          fetchProps(id, 'todo');
                        }}
                        placeholder={t.selectDB}
                        showDescription={false}
                        nameFontSize={18}
                      />
                      <DbPicker
                        label={t.reportDB}
                        value={dbRep}
                        databases={dbs}
                        onChange={(id) => {
                          setDbRep(id);
                          fetchProps(id, 'report');
                        }}
                        placeholder={t.selectDB}
                        showDescription={false}
                        nameFontSize={18}
                      />
                      <DbPicker
                        label={t.goalDBOptional}
                        value={dbGoal}
                        databases={dbs}
                        onChange={(id) => {
                          setDbGoal(id);
                          setGProps([]);
                          if (id) fetchProps(id, 'goal');
                        }}
                        placeholder={t.selectDBOptional}
                        showDescription={false}
                        nameFontSize={18}
                      />
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="button"
                      className="nav-circle-btn nav-circle-btn--confirm"
                      onClick={handleSave}
                      disabled={!dbTodo || (!token.trim() && !creds?.authMode && !creds?.token)}
                      aria-label={saved ? t.saved : t.save}
                      title={saved ? t.saved : t.save}
                    >
                      <Check size={22} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="sec-label" style={{ marginTop: 4 }}>
                {t.dbProperties}
              </div>
              <PropRows
                label={t.todoDB}
                fields={[
                  { key: 'name', lbl: t.fieldName },
                  { key: 'date', lbl: t.fieldDate },
                  { key: 'done', lbl: t.fieldDone },
                  { key: 'accum', lbl: t.fieldAccum },
                  { key: 'goal', lbl: t.fieldGoalRelation },
                  { key: 'timeBlocking', lbl: t.fieldTimeBlocking },
                ]}
                values={tf}
                props={tProps}
                mapSection="todo"
                onLoad={() => fetchProps(creds.dbTodo, 'todo')}
                onChange={(k, v) => chgField('todo', k, v)}
                t={t}
              />
              {creds.dbReport && (
                <PropRows
                  label={t.reportDB}
                  fields={[
                    { key: 'review', lbl: reportReviewLabel },
                    { key: 'totalMin', lbl: reportTotalLabel },
                  ]}
                  values={rf}
                  props={rProps}
                  mapSection="report"
                  onLoad={() => fetchProps(creds.dbReport, 'report')}
                  onChange={(k, v) => chgField('report', k, v)}
                  t={t}
                />
              )}
              {String(dbGoal || '').trim() && (
                <>
                  <PropRows
                    label={t.goalMappingSection}
                    fields={[
                      { key: 'name', lbl: t.goalMapName },
                      { key: 'status', lbl: t.goalMapStatus },
                    ]}
                    values={gf}
                    props={gProps}
                    mapSection="goal"
                    onLoad={() => fetchProps(dbGoal, 'goal')}
                    onChange={(k, v) => chgGoalField(k, v)}
                    t={t}
                  />
                  <div className="list-sec mb-16">
                    <div className="list-row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 128, flex: '1 1 140px' }}>
                        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{t.goalMapInProgress}</span>
                      </div>
                      <input
                        className="input"
                        style={{ flex: '2 1 160px', minWidth: 0 }}
                        value={gf.inProgress ?? ''}
                        placeholder={ko ? '예: In progress, 진행 중' : 'e.g. In progress'}
                        onChange={(e) => chgGoalField('inProgress', e.target.value)}
                        aria-label={t.goalMapInProgress}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <NotionLoadingOverlay
          open={dbsBlockerVisible || dbsListLoading || (isOAuth && notionDetail && !sessionReady)}
          message={t.loadingDbs}
        />
      </div>
    );
  }

  const accountLineText = (() => {
    if (isDemoMode && !hasNotionAuth(creds)) return t.connectNotionCta;
    if (!hasNotionAuth(creds)) return t.accountLineNotConnected;
    if (creds?.authMode === 'oauth') return creds.workspaceName || (ko ? '워크스페이스' : 'Workspace');
    if (creds?.token) return `${String(creds.token).slice(0, 10)}…`;
    return t.connected;
  })();
  const showConnectionStatusDot = hasNotionAuth(creds);

  const languageValue = settings?.lang == null || settings?.lang === 'system' ? 'system' : settings.lang;
  const weekValue = settings?.weekStart || 'monday';
  const languageOptions = [
    { value: 'system', label: t.system },
    { value: 'ko', label: t.korean },
    { value: 'en', label: t.english },
  ];
  const weekOptions = [
    { value: 'monday', label: t.weekStartMonday },
    { value: 'sunday', label: t.weekStartSunday },
  ];

  const iconBox = {
    width: 22, height: 22,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--text2)',
  };
  const rowLabel = { fontSize: 18, fontWeight: 500, color: 'var(--text)', flex: 1, textAlign: 'left' };
  const chevron = <span className="settings-chevron" style={{ color: 'var(--text3)' }} aria-hidden>›</span>;

  return (
    <div className="settings-page" style={{ minHeight: '100%' }}>
      <div className="page-header" style={{ padding: '20px 16px 18px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {t.settings}
        </h1>
      </div>
      <div style={{ padding: '4px 16px 36px' }}>
        {/* 멤버십 카드 */}
        {!isDemoMode && subscription?.customer_key && (
          <MembershipCard
            subscription={subscription}
            ko={ko}
            onClick={() => { hapticLight(); setSubscribeSheetOpen(true); }}
          />
        )}
        <SubscribeSheet
          open={subscribeSheetOpen}
          onClose={() => setSubscribeSheetOpen(false)}
          customerKey={subscription?.customer_key}
          ko={ko}
          subscription={subscription}
          onCancelled={() => setSubscription((prev) => ({ ...prev, status: 'cancelled' }))}
        />

        {/* 노션 연결 */}
        <button
          type="button"
          onClick={() => { hapticLight(); setNotionDetail(true); }}
          className="card card-p"
          style={{
            width: '100%', display: 'flex', flexDirection: 'row',
            alignItems: 'center', justifyContent: 'space-between', gap: 12,
            cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
            marginBottom: 20, boxShadow: 'none', border: '1px solid var(--sep)',
            background: 'var(--bg2)', color: 'var(--text)',
            padding: '13px 14px 13px 14px', borderRadius: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minWidth: 0 }}>
            <div style={iconBox}>
              <Link2 size={16} strokeWidth={2} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>
              {t.notionConnection}
            </span>
          </div>
          <div className="settings-notion-trail">
            <div className="settings-notion-trail-mid">
              {showConnectionStatusDot && (
                <span className="settings-notion-trail-dot" aria-hidden>●</span>
              )}
              <span className="settings-notion-trail-text truncate">{accountLineText}</span>
            </div>
            {chevron}
          </div>
        </button>

        <div className="sec-label" style={{ marginTop: 4, fontWeight: 500 }}>{t.secGeneral}</div>
        <div className="list-sec mb-20" style={{ padding: 0, overflow: 'hidden', borderRadius: 14 }}>
          <div className="list-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '0.5px solid var(--sep)' }}>
            <div style={iconBox}><Globe size={16} strokeWidth={2} /></div>
            <span style={rowLabel}>{t.language}</span>
            <SettingsNativeSelect ariaLabel={t.language} value={languageValue} options={languageOptions}
              onChange={(e) => { hapticLight(); const v = e.target.value; onSaveSettings({ ...settings, lang: v === 'system' ? null : v }); }} />
          </div>
          <div className="list-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
            <div style={iconBox}><CalendarDays size={16} strokeWidth={2} /></div>
            <span style={rowLabel}>{t.weekStart}</span>
            <SettingsNativeSelect ariaLabel={t.weekStart} value={weekValue} options={weekOptions}
              onChange={(e) => { hapticLight(); onSaveSettings({ ...settings, weekStart: e.target.value }); }} />
          </div>
        </div>

        <div className="sec-label" style={{ fontWeight: 500 }}>{t.secSupport}</div>
        <div className="list-sec mb-20" style={{ padding: 0, overflow: 'hidden', borderRadius: 14 }}>
          {[
            { Icon: Mail, label: t.supportSendMail, onClick: () => openSupportEmail({ locale: ko ? 'ko' : 'en', appName: t.appName }), border: true },
            { Icon: MessageSquare, label: t.supportFeedback, onClick: () => window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer'), border: true },
            { Icon: Megaphone, label: t.newsUpdates, onClick: () => setComingSoonOpen(true), border: false },
          ].map(({ Icon, label, onClick, border }) => (
            <button key={label} type="button" className="list-row"
              style={{ width: '100%', border: 'none', borderBottom: border ? '0.5px solid var(--sep)' : 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}
              onClick={() => { hapticLight(); onClick(); }}
            >
              <div style={iconBox}><Icon size={16} strokeWidth={2} /></div>
              <span style={rowLabel}>{label}</span>
              {chevron}
            </button>
          ))}
        </div>

        <div className="sec-label" style={{ fontWeight: 500 }}>{t.secLegalPolicy}</div>
        <div className="list-sec mb-20" style={{ padding: 0, overflow: 'hidden', borderRadius: 14 }}>
          {[
            { label: t.privacyPolicy, Icon: Shield },
            { label: t.termsOfService, Icon: FileText },
          ].map(({ label, Icon }, i, arr) => (
            <button key={label} type="button" className="list-row"
              style={{ width: '100%', border: 'none', borderBottom: i < arr.length - 1 ? '0.5px solid var(--sep)' : 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}
              onClick={() => { hapticLight(); setComingSoonOpen(true); }}
            >
              <div style={iconBox}><Icon size={16} strokeWidth={2} /></div>
              <span style={rowLabel}>{label}</span>
              {chevron}
            </button>
          ))}
        </div>

        {comingSoonOpen && (
          <PopupDialog
            title={t.comingSoonPopupTitle} message={t.comingSoonPopupBody}
            dismissInHeader closeAriaLabel={t.close}
            onCancel={() => setComingSoonOpen(false)} onConfirm={() => setComingSoonOpen(false)}
            confirmText={t.btnOk} singleAction
          />
        )}

        <div style={{ textAlign: 'center', padding: '24px 0 8px', color: 'var(--text4)', fontSize: 13, fontWeight: 400 }}>
          {t.appName} v{getAppVersionLabel()}
        </div>

        {hasNotionAuth(creds) && !isDemoMode && (
          <div style={{ marginTop: 8, paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={() => { hapticLight(); onDisconnect(); }}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'center', padding: '12px 0 0', fontSize: 15, fontWeight: 400, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              {t.disconnect}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PropRows({ label, fields, values, props, mapSection, onLoad, onChange, t }) {
  const names = props.map((p) => p.name);
  const typeMap = new Map(props.map((p) => [p.name, p.type]));
  const [loaded, setLoaded] = useState(names.length > 0);
  useEffect(() => {
    if (names.length > 0) setLoaded(true);
  }, [names.length]);
  const load = async () => {
    await onLoad();
    setLoaded(true);
  };
  return (
    <>
      <div style={{ fontSize: 15, color: 'var(--text3)', fontWeight: 600, padding: '12px 2px 6px' }}>{label}</div>
      <div className="list-sec mb-16">
        {fields.map(({ key, lbl }) => (
          <NotionFieldMapRow
            key={key}
            variant="settings"
            mapSection={mapSection}
            fieldKey={key}
            lbl={lbl}
            val={values[key] || ''}
            names={names}
            typeMap={typeMap}
            loaded={loaded && names.length > 0}
            onChange={(v) => onChange(key, v)}
            onClickLoad={load}
            t={t}
            titleMissing={t.fieldMapNameMissing}
            titleMismatch={t.fieldMapTypeMismatch}
          />
        ))}
      </div>
    </>
  );
}
