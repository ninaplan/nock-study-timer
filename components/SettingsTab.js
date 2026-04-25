'use client';
import { useState, useEffect, useCallback } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveApiUrl } from './lib/apiClient';
import { hasNotionAuth } from '@/app/lib/hasNotionAuth';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS } from '@/app/lib/fields';
import DbPicker from './DbPicker';

function notionFetchOpts(token) {
  return {
    credentials: 'include',
    headers: { ...(String(token || '').trim() ? { 'x-notion-token': String(token).trim() } : {}) },
  };
}

export default function SettingsTab({ t, creds, settings, onSaveSettings, onSaveCreds, onDisconnect, locale }) {
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

  if (notionDetail) {
    return (
      <div style={{ minHeight: '100%' }}>
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
          <div className="page-title" style={{ fontSize: 26, margin: 0, flex: 1, letterSpacing: '-0.3px' }}>
            {t.notionConnection}
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
              <div className="card card-p" style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, marginBottom: 6 }}>
                  {isOAuth ? (ko ? '워크스페이스' : 'Workspace') : t.tokenLabel}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: 'var(--text)',
                    letterSpacing: '-0.3px',
                    wordBreak: 'break-word',
                    lineHeight: 1.3,
                  }}
                >
                  {isOAuth
                    ? (creds.workspaceName || t.connectedOAuth)
                    : (creds.token ? `${creds.token.slice(0, 12)}…` : t.connected)}
                </div>
              </div>

              {isOAuth && (
                <div className="list-sec mb-20">
                  <button
                    type="button"
                    className="list-row"
                    style={{ width: '100%', border: 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'var(--font)' }}
                    onClick={startNotionOAuth}
                    disabled={oauthBusy}
                  >
                    <span style={{ flex: 1, textAlign: 'left', fontSize: 16, color: 'var(--text)', fontWeight: 600 }}>{t.switchNotionAccount}</span>
                    {oauthBusy ? <span className="spin spin-dark" style={{ width: 16, height: 16 }} /> : <ChevronRight size={18} strokeWidth={2.1} color="var(--text3)" />}
                  </button>
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <button type="button" className="btn btn-red btn-md btn-full" style={{ borderRadius: 12 }} onClick={onDisconnect}>
                  {t.disconnect}
                </button>
              </div>
            </>
          )}

          {hasNotionAuth(creds) && (
            <>
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
                  <button
                    className="btn btn-muted btn-sm"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={fetchDbs}
                    disabled={!canLoadDbs || loading}
                  >
                    {loading ? <span className="spin spin-dark" style={{ width: 14, height: 14 }} /> : ko ? 'DB 조회' : 'Load DBs'}
                  </button>
                  {err && <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>{err}</div>}
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

              <div className="sec-label">{t.dbProperties}</div>
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

  return (
    <div style={{ minHeight: '100%' }}>
      <div className="page-header">
        <div className="page-title">{t.settings}</div>
      </div>

      <div style={{ padding: '0 16px 48px' }}>
        <div className="sec-label">{t.language}</div>
        <div className="list-sec mb-20">
          {[
            ['system', t.system],
            ['ko', t.korean],
            ['en', t.english],
          ].map(([v, lbl]) => (
            <button
              key={v}
              className="list-row"
              style={{ width: '100%', border: 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'var(--font)' }}
              onClick={() => onSaveSettings({ ...settings, lang: v === 'system' ? null : v })}
            >
              <span style={{ flex: 1, textAlign: 'left', fontSize: 16, color: 'var(--text)', fontWeight: 500 }}>{lbl}</span>
              {(settings?.lang || 'system') === v && <Check size={18} strokeWidth={2.1} />}
            </button>
          ))}
        </div>

        <div className="sec-label">{t.weekStart}</div>
        <div className="list-sec mb-20">
          {[
            ['monday', t.weekStartMonday],
            ['sunday', t.weekStartSunday],
          ].map(([v, lbl]) => (
            <button
              key={v}
              className="list-row"
              style={{ width: '100%', border: 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'var(--font)' }}
              onClick={() => onSaveSettings({ ...settings, weekStart: v })}
            >
              <span style={{ flex: 1, textAlign: 'left', fontSize: 16, color: 'var(--text)', fontWeight: 500 }}>{lbl}</span>
              {(settings?.weekStart || 'monday') === v && <Check size={18} strokeWidth={2.1} />}
            </button>
          ))}
        </div>

        <div className="sec-label">{t.notionConnection}</div>
        <div className="list-sec mb-20" style={{ padding: 0, overflow: 'hidden', borderRadius: 12 }}>
          <button
            type="button"
            onClick={() => setNotionDetail(true)}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            <div className="list-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left', flex: 1, minWidth: 0, padding: '2px 0' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }} className="truncate">
                  {hasNotionAuth(creds)
                    ? creds.workspaceName || (creds.authMode === 'oauth' ? t.connectedOAuth : t.connected)
                    : t.notConnected}
                </div>
                {hasNotionAuth(creds) && (
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4, fontWeight: 500 }}>{t.notionManageHint}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ width: 9, height: 9, borderRadius: 5, background: hasNotionAuth(creds) ? 'var(--green)' : 'var(--red)' }} />
                <ChevronRight size={20} strokeWidth={2.1} color="var(--text3)" />
              </div>
            </div>
          </button>
        </div>

        <div style={{ textAlign: 'center', padding: '32px 0 8px', color: 'var(--text4)', fontSize: 12, fontWeight: 700 }}>노크 순공타이머 v1.0.0</div>
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
      <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, padding: '12px 2px 6px' }}>{label}</div>
      <div className="list-sec mb-16">
        {fields.map(({ key, lbl }) => {
          const val = values[key] || '';
          const bad = loaded && names.length > 0 && !names.includes(val);
          const selectedType = val ? typeMap.get(val) : null;
          return (
            <div key={key} className="list-row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 128, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: bad ? 'var(--red)' : 'var(--text)' }}>
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
                <select className="input" style={{ flex: 1, padding: '7px 12px', fontSize: 16, fontWeight: 400 }} value={val} onChange={(e) => onChange(key, e.target.value)}>
                  <option value="">{t.selectProperty}</option>
                  {names.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ flex: 1, fontSize: 16, color: 'var(--text)', cursor: 'pointer', fontWeight: 500, opacity: 0.5 }} onClick={load}>
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
