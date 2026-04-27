'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  Mail,
  MessageSquare,
  Globe,
  CalendarDays,
  Megaphone,
  Shield,
  FileText,
} from 'lucide-react';
import { resolveApiUrl } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { mergeDbsById } from '@/app/lib/mergeDatabases';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS } from '@/app/lib/fields';
import { getAppVersionLabel, openSupportEmail } from '@/app/lib/supportEmail';
import { hapticLight } from './lib/haptics';
import PopupDialog from './PopupDialog';
import SubscribeSheet, { ProMemberCard } from './SubscribeSheet';
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
  const [dbs, setDbs] = useState([]);
  const [dbsRefreshKey, setDbsRefreshKey] = useState(0);
  const [tProps, setTProps] = useState([]);
  const [rProps, setRProps] = useState([]);
  const [dbsListLoading, setDbsListLoading] = useState(false);
  const [dbsBlockerVisible, setDbsBlockerVisible] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [subscribeSheetOpen, setSubscribeSheetOpen] = useState(false);
  const dbsBlockerTimer = useRef(null);
  const credsRef = useRef(creds);
  const tokenFieldRef = useRef(token);
  credsRef.current = creds;
  tokenFieldRef.current = token;
  const ko = locale === 'ko';
  const reportReviewLabel = ko ? '하루 리뷰' : 'Daily Review';

  useEffect(() => {
    if (isDemoMode) return;
    fetch('/api/subscription', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setSubscription(d))
      .catch(() => {});
  }, [isDemoMode]);
  const reportTotalLabel = ko ? '집중 합계' : 'Focus Total';

  const tf = { ...DEFAULT_TODO_FIELDS, ...(settings?.todoFields || {}) };
  const rf = { ...DEFAULT_REPORT_FIELDS, ...(settings?.reportFields || {}) };

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
      else setRProps(d.properties || []);
    } catch (e) {
      setErr(e?.message || 'Failed');
    }
  };

  const handleSave = () => {
    if (!dbTodo) return;
    if (token.trim()) onSaveCreds({ token: token.trim(), dbTodo, dbReport: dbRep });
    else if (creds?.authMode === 'oauth') onSaveCreds({ authMode: 'oauth', dbTodo, dbReport: dbRep });
    else if (creds?.token) onSaveCreds({ token: creds.token, dbTodo, dbReport: dbRep });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const chgField = (type, key, val) => {
    if (type === 'todo') onSaveSettings({ ...settings, todoFields: { ...tf, [key]: val } });
    else onSaveSettings({ ...settings, reportFields: { ...rf, [key]: val } });
  };

  useEffect(() => {
    if (hasNotionAuth(creds) && creds?.dbTodo && tProps.length === 0) fetchProps(creds.dbTodo, 'todo');
    if (hasNotionAuth(creds) && creds?.dbReport && rProps.length === 0) fetchProps(creds.dbReport, 'report');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds?.authMode, creds?.token, creds?.dbTodo, creds?.dbReport]);

  const canLoadDbs = hasNotionAuth(creds) || token.trim();
  const isOAuth = creds?.authMode === 'oauth' && hasNotionAuth(creds);

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
    let cancelled = false;
    const ac = new AbortController();
    let supplementTimer;
    let supplementAc;
    setDbsListLoading(true);
    setErr('');
    (async () => {
      try {
        const tok = (tokenFieldRef.current || credsRef.current?.token || '').trim();
        const res = await fetch(resolveApiUrl('/api/databases'), {
          ...notionFetchOpts(tok),
          signal: ac.signal,
        });
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error || 'Failed');
        setDbs(d.databases || []);
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
    };
  }, [notionDetail, canLoadDbs, dbsRefreshKey]);

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
                      style={{ fontSize: 'calc(15px + 2pt)', fontWeight: 600, color: 'var(--text)' }}
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
                <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600, marginBottom: 12, lineHeight: 1.4 }}>{err}</div>
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
                    </>
                  )}
                  <button
                    className="btn btn-dark btn-md btn-full"
                    onClick={handleSave}
                    disabled={!dbTodo || (!token.trim() && !creds?.authMode && !creds?.token)}
                    style={{ borderRadius: 12 }}
                  >
                    {saved ? `✓ ${t.saved}` : t.save}
                  </button>
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
            </>
          )}
        </div>
        <NotionLoadingOverlay open={dbsBlockerVisible} message={null} />
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

  const iconMono = { color: 'var(--text)' };

  return (
    <div className="settings-page" style={{ minHeight: '100%' }}>
      <div className="page-header" style={{ padding: '20px 16px 22px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {t.settings}
        </h1>
      </div>
      <div style={{ padding: '8px 16px 36px' }}>
        {/* 구독 섹션 */}
        {!isDemoMode && (subscription?.status === 'active' || subscription?.status === 'trialing') && (
          <ProMemberCard
            subscription={subscription}
            ko={ko}
            onCancel={() => setSubscription((prev) => ({ ...prev, status: 'cancelled' }))}
          />
        )}
        {!isDemoMode && subscription?.status !== 'active' && subscription?.status !== 'trialing' && subscription?.customer_key && (
          <button
            type="button"
            onClick={() => { hapticLight(); setSubscribeSheetOpen(true); }}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: 14,
              border: '1px solid var(--sep)',
              background: 'var(--bg2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              marginBottom: 20,
              fontFamily: 'var(--font)',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                {ko ? 'Pro로 업그레이드' : 'Upgrade to Pro'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
                {ko ? '₩4,900/월 · 언제든지 취소 가능' : '₩4,900/mo · Cancel anytime'}
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#111', borderRadius: 8, padding: '5px 12px' }}>
              {ko ? '시작하기' : 'Start'}
            </span>
          </button>
        )}
        <SubscribeSheet
          open={subscribeSheetOpen}
          onClose={() => setSubscribeSheetOpen(false)}
          customerKey={subscription?.customer_key}
          ko={ko}
        />

        <button
          type="button"
          onClick={() => {
            hapticLight();
            setNotionDetail(true);
          }}
          className="card card-p"
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'var(--font)',
            marginBottom: 20,
            boxShadow: 'none',
            border: '1px solid var(--sep)',
            background: 'var(--bg2)',
            color: 'var(--text)',
            padding: '15px 16px 15px 18px',
            borderRadius: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 0 }}>
            <NotionMark size={18} className="notion-mark-ico" />
            <span
              style={{
                fontSize: 'calc(15px + 2pt)',
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '-0.2px',
                whiteSpace: 'nowrap',
              }}
            >
              {t.notionConnection}
            </span>
          </div>
          <div className="settings-notion-trail">
            <div className="settings-notion-trail-mid">
              {showConnectionStatusDot && (
                <span className="settings-notion-trail-dot" aria-hidden>
                  ●
                </span>
              )}
              <span className="settings-notion-trail-text truncate">{accountLineText}</span>
            </div>
            <span className="settings-chevron" aria-hidden>
              ›
            </span>
          </div>
        </button>

        <div className="sec-label" style={{ marginTop: 4 }}>
          {t.secGeneral}
        </div>
        <div className="list-sec mb-20" style={{ padding: 0, overflow: 'hidden', borderRadius: 12 }}>
          <div
            className="list-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '13px 16px',
              borderBottom: '0.5px solid var(--sep)',
            }}
          >
            <Globe size={20} strokeWidth={1.9} style={iconMono} />
            <span style={{ fontSize: 'calc(15px + 2pt)', fontWeight: 500, color: 'var(--text)', flexShrink: 0 }}>{t.language}</span>
            <SettingsNativeSelect
              ariaLabel={t.language}
              value={languageValue}
              options={languageOptions}
              onChange={(e) => {
                hapticLight();
                const v = e.target.value;
                onSaveSettings({ ...settings, lang: v === 'system' ? null : v });
              }}
            />
          </div>
          <div className="list-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
            <CalendarDays size={20} strokeWidth={1.9} style={iconMono} />
            <span style={{ fontSize: 'calc(15px + 2pt)', fontWeight: 500, color: 'var(--text)', flexShrink: 0 }}>{t.weekStart}</span>
            <SettingsNativeSelect
              ariaLabel={t.weekStart}
              value={weekValue}
              options={weekOptions}
              onChange={(e) => {
                hapticLight();
                onSaveSettings({ ...settings, weekStart: e.target.value });
              }}
            />
          </div>
        </div>

        <div className="sec-label">{t.secSupport}</div>
        <div className="list-sec mb-20" style={{ padding: 0, overflow: 'hidden', borderRadius: 12 }}>
          <button
            type="button"
            className="list-row"
            style={{
              width: '100%',
              border: 'none',
              borderBottom: '0.5px solid var(--sep)',
              cursor: 'pointer',
              background: 'transparent',
              fontFamily: 'var(--font)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
            }}
            onClick={() => {
              hapticLight();
              openSupportEmail({ locale: ko ? 'ko' : 'en', appName: t.appName });
            }}
          >
            <Mail size={20} strokeWidth={1.9} style={{ ...iconMono, flexShrink: 0 }} />
            <span style={{ fontSize: 'calc(15px + 2pt)', fontWeight: 500, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{t.supportSendMail}</span>
            <span className="settings-chevron" aria-hidden>
              ›
            </span>
          </button>
          <button
            type="button"
            className="list-row"
            style={{
              width: '100%',
              border: 'none',
              borderBottom: '0.5px solid var(--sep)',
              cursor: 'pointer',
              background: 'transparent',
              fontFamily: 'var(--font)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
            }}
            onClick={() => {
              hapticLight();
              window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer');
            }}
          >
            <MessageSquare size={20} strokeWidth={1.9} style={{ ...iconMono, flexShrink: 0 }} />
            <span style={{ fontSize: 'calc(15px + 2pt)', fontWeight: 500, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{t.supportFeedback}</span>
            <span className="settings-chevron" aria-hidden>
              ›
            </span>
          </button>
          <button
            type="button"
            className="list-row"
            style={{
              width: '100%',
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              fontFamily: 'var(--font)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
            }}
            onClick={() => {
              hapticLight();
              setComingSoonOpen(true);
            }}
          >
            <Megaphone size={20} strokeWidth={1.9} style={{ ...iconMono, flexShrink: 0 }} />
            <span style={{ fontSize: 'calc(15px + 2pt)', fontWeight: 500, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{t.newsUpdates}</span>
            <span className="settings-chevron" aria-hidden>
              ›
            </span>
          </button>
        </div>

        <div className="sec-label">{t.secLegalPolicy}</div>
        <div className="list-sec mb-20" style={{ padding: 0, overflow: 'hidden', borderRadius: 12 }}>
          {[
            { label: t.privacyPolicy, Icon: Shield },
            { label: t.termsOfService, Icon: FileText },
          ].map(({ label, Icon }, i, arr) => (
            <button
              type="button"
              key={label}
              className="list-row"
              style={{
                width: '100%',
                border: 'none',
                borderBottom: i < arr.length - 1 ? '0.5px solid var(--sep)' : 'none',
                cursor: 'pointer',
                background: 'transparent',
                fontFamily: 'var(--font)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
              }}
              onClick={() => {
                hapticLight();
                setComingSoonOpen(true);
              }}
            >
              <Icon size={20} strokeWidth={1.9} style={{ ...iconMono, flexShrink: 0 }} />
              <span style={{ fontSize: 'calc(15px + 2pt)', fontWeight: 500, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{label}</span>
              <span className="settings-chevron" aria-hidden>
                ›
              </span>
            </button>
          ))}
        </div>

        {comingSoonOpen && (
          <PopupDialog
            title={t.comingSoonPopupTitle}
            message={t.comingSoonPopupBody}
            dismissInHeader
            closeAriaLabel={t.close}
            onCancel={() => setComingSoonOpen(false)}
            onConfirm={() => setComingSoonOpen(false)}
            confirmText={t.btnOk}
            singleAction
          />
        )}

        <div
          style={{
            textAlign: 'center',
            padding: '24px 0 8px',
            color: 'var(--text4)',
            fontSize: 'calc(12px + 2pt)',
            fontWeight: 600,
          }}
        >
          {t.appName} v{getAppVersionLabel()}
        </div>

        {hasNotionAuth(creds) && !isDemoMode && (
          <div style={{ marginTop: 8, paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <button
              type="button"
              onClick={() => {
                hapticLight();
                onDisconnect();
              }}
              style={{
                background: 'none',
                border: 'none',
                width: '100%',
                textAlign: 'center',
                padding: '12px 0 0',
                fontSize: 15,
                fontWeight: 400,
                color: 'var(--text3)',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
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
      <div style={{ fontSize: 'calc(12px + 2pt)', color: 'var(--text3)', fontWeight: 600, padding: '12px 2px 6px' }}>{label}</div>
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
