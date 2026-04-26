'use client';
import { useState, useEffect, useCallback } from 'react';
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
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS } from '@/app/lib/fields';
import { getAppVersionLabel, openSupportEmail } from '@/app/lib/supportEmail';
import { hapticLight } from './lib/haptics';
import PopupDialog from './PopupDialog';
import DbPicker from './DbPicker';

const FEEDBACK_URL = 'https://nockmarket.notion.site/nock-timer-feedback';

function NotionMark({ size = 16, style, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden style={style}>
      <path
        fill="currentColor"
        d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.31v14.714c0 .654.374.934.98.887l14.664-.887c.607-.047.98-.374.98-.98V7.518c0-.56-.467-.887-.98-.793L5.252 6.838c-.56.047-.933.327-.933.68zm13.904.14c.093.467 0 .887-.467.98l-.7.14v10.576c-.607.327-1.167.513-1.633.513-.748 0-.935-.234-1.495-.933l-4.478-7.023v6.79l1.448.327s0 .887-1.214.887l-3.217.187c-.094-.187 0-.654.047-.747l.84-1.12V9.855L7.22 9.576c-.094-.42.14-1.026.747-1.073l3.45-.234 4.665 7.139v-6.316l-1.214-.14c-.094-.513.28-.887.747-.933z"
      />
    </svg>
  );
}

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

export default function SettingsTab({ t, creds, settings, isDemoMode, onSaveSettings, onSaveCreds, onDisconnect, locale }) {
  const [notionDetail, setNotionDetail] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [token, setToken] = useState(creds?.token || '');
  const [dbTodo, setDbTodo] = useState(creds?.dbTodo || '');
  const [dbRep, setDbRep] = useState(creds?.dbReport || '');
  const [dbs, setDbs] = useState([]);
  const [tProps, setTProps] = useState([]);
  const [rProps, setRProps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const ko = locale === 'ko';
  const reportReviewLabel = ko ? '하루 리뷰' : 'Daily Review';
  const reportTotalLabel = ko ? '집중 합계' : 'Focus Total';

  const tf = { ...DEFAULT_TODO_FIELDS, ...(settings?.todoFields || {}) };
  const rf = { ...DEFAULT_REPORT_FIELDS, ...(settings?.reportFields || {}) };

  const fetchDbs = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(resolveApiUrl('/api/databases'), notionFetchOpts(token || creds?.token));
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setDbs(d.databases || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startNotionOAuth = useCallback(async () => {
    setErr('');
    setOauthBusy(true);
    try {
      const res = await fetch(resolveApiUrl('/api/auth/notion?format=json'), { credentials: 'include' });
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
    if (!notionDetail) return;
    if (!canLoadDbs) return;
    fetchDbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            padding: '20px 16px 12px',
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
          <div className="page-title" style={{ fontSize: 'calc(26px + 2pt)', margin: 0, flex: 1, letterSpacing: '-0.3px' }}>
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
                      className="truncate"
                      style={{ fontSize: 'calc(16px + 2pt)', fontWeight: 600, color: 'var(--text)' }}
                    >
                      {creds.workspaceName || (ko ? '워크스페이스' : 'Workspace')}
                    </span>
                    <span
                      style={{
                        color: 'var(--green)',
                        fontSize: 10,
                        lineHeight: 1,
                        flexShrink: 0,
                        paddingTop: 2,
                      }}
                      aria-hidden
                    >
                      ●
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

              <button
                type="button"
                onClick={onDisconnect}
                style={{
                  background: 'none',
                  border: 'none',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0 0 4px 2px',
                  marginBottom: 8,
                  fontSize: 15,
                  fontWeight: 400,
                  color: 'var(--text3)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                {t.disconnect}
              </button>
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
              <div style={{ marginBottom: 12, padding: '0 2px' }}>
                <button
                  type="button"
                  onClick={() => {
                    hapticLight();
                    fetchDbs();
                  }}
                  disabled={!canLoadDbs || loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--notion)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    textDecoration: 'none',
                    opacity: !canLoadDbs || loading ? 0.4 : 1,
                  }}
                >
                  {loading ? <span className="spin spin-dark" style={{ width: 16, height: 16, display: 'inline-block', verticalAlign: 'middle' }} /> : ko ? 'DB 조회' : 'Load DBs'}
                </button>
              </div>
              <PropRows
                label={t.todoDB}
                dbId={creds.dbTodo}
                tokenStr={token || creds?.token}
                fields={[
                  { key: 'name', lbl: t.fieldName },
                  { key: 'date', lbl: t.fieldDate },
                  { key: 'done', lbl: t.fieldDone },
                  { key: 'accum', lbl: t.fieldAccum },
                ]}
                values={tf}
                props={tProps}
                onLoad={() => fetchProps(creds.dbTodo, 'todo')}
                onChange={(k, v) => chgField('todo', k, v)}
                t={t}
                ko={ko}
              />
              {creds.dbReport && (
                <PropRows
                  label={t.reportDB}
                  dbId={creds.dbReport}
                  tokenStr={token || creds?.token}
                  fields={[
                    { key: 'review', lbl: reportReviewLabel },
                    { key: 'totalMin', lbl: reportTotalLabel },
                  ]}
                  values={rf}
                  props={rProps}
                  onLoad={() => fetchProps(creds.dbReport, 'report')}
                  onChange={(k, v) => chgField('report', k, v)}
                  t={t}
                  ko={ko}
                />
              )}
            </>
          )}
        </div>
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
  const showWsStatusDot = isOAuth && hasNotionAuth(creds);

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
      <div className="page-header" style={{ padding: '20px 16px 4px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {t.settings}
        </h1>
      </div>
      <div style={{ padding: '8px 16px 36px' }}>
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
                fontSize: 'calc(16px + 2pt)',
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '-0.2px',
                whiteSpace: 'nowrap',
              }}
            >
              {t.notionConnection}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 6,
              minWidth: 0,
              flex: 1,
            }}
          >
            <span
              style={{
                fontSize: 'calc(15px + 2pt)',
                fontWeight: 500,
                color: 'var(--text2)',
                textAlign: 'right',
              }}
              className="truncate"
            >
              {accountLineText}
            </span>
            {showWsStatusDot && (
              <span
                style={{ color: 'var(--green)', fontSize: 10, lineHeight: 1, flexShrink: 0, marginLeft: 2 }}
                aria-hidden
              >
                ●
              </span>
            )}
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
            <span style={{ fontSize: 'calc(16px + 2pt)', fontWeight: 500, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{t.supportSendMail}</span>
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
            <span style={{ fontSize: 'calc(16px + 2pt)', fontWeight: 500, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{t.supportFeedback}</span>
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
            <span style={{ fontSize: 'calc(16px + 2pt)', fontWeight: 500, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{t.newsUpdates}</span>
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
              <span style={{ fontSize: 'calc(16px + 2pt)', fontWeight: 500, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{label}</span>
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
      </div>
    </div>
  );
}

function PropRows({ label, fields, values, props, onLoad, onChange, t, ko }) {
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
        {fields.map(({ key, lbl }) => {
          const val = values[key] || '';
          const bad = loaded && names.length > 0 && !names.includes(val);
          const selectedType = val ? typeMap.get(val) : null;
          return (
            <div key={key} className="list-row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 128, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: bad ? 'var(--red)' : 'var(--text)' }}>
                  {lbl}
                  {bad ? ' ⚠' : ''}
                </span>
                {selectedType && (
                  <span
                    style={{
                      width: 'fit-content',
                      fontSize: 12,
                      color: 'var(--text3)',
                      background: 'var(--bg3)',
                      borderRadius: 999,
                      padding: '2px 8px',
                      lineHeight: 1.2,
                    }}
                  >
                    {formatPropertyType(selectedType, ko)}
                  </span>
                )}
              </div>
              {loaded && names.length > 0 ? (
                <select className="input" style={{ flex: 1, padding: '7px 12px', fontSize: 16, fontWeight: 300 }} value={val} onChange={(e) => onChange(key, e.target.value)}>
                  <option value="">{t.selectProperty}</option>
                  {names.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ flex: 1, fontSize: 16, color: 'var(--text)', cursor: 'pointer', fontWeight: 400, opacity: 0.5 }} onClick={load}>
                  {val || t.selectProperty}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function formatPropertyType(type, ko) {
  const map = {
    title: ko ? '제목' : 'Title',
    rich_text: ko ? '텍스트' : 'Text',
    number: ko ? '숫자' : 'Number',
    select: ko ? '선택' : 'Select',
    multi_select: ko ? '다중 선택' : 'Multi-select',
    status: ko ? '상태' : 'Status',
    date: ko ? '날짜' : 'Date',
    checkbox: ko ? '체크박스' : 'Checkbox',
    relation: ko ? '관계' : 'Relation',
    formula: ko ? '수식' : 'Formula',
    rollup: ko ? '롤업' : 'Rollup',
    people: ko ? '사람' : 'People',
    files: ko ? '파일' : 'Files',
    url: 'URL',
    email: ko ? '이메일' : 'Email',
    phone_number: ko ? '전화번호' : 'Phone',
    created_time: ko ? '생성시각' : 'Created time',
    last_edited_time: ko ? '수정시각' : 'Edited time',
    created_by: ko ? '생성자' : 'Created by',
    last_edited_by: ko ? '수정자' : 'Edited by',
  };
  return map[type] || type || (ko ? '기타' : 'Other');
}
