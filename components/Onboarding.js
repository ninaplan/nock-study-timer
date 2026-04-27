'use client';
import { useState, useEffect, useRef } from 'react';
import DbPicker from './DbPicker';
import NotionLoadingOverlay from './NotionLoadingOverlay';
import { resolveApiUrl } from './lib/apiClient';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS } from '@/app/lib/fields';
import NotionFieldMapRow from './NotionFieldMapRow';
import { hapticLight } from './lib/haptics';

function notionFetchOpts() {
  return {
    credentials: 'include',
    headers: {},
  };
}

export default function Onboarding({ t, locale, onComplete, onDemo, initialStep = 0, fromOAuth = false }) {
  const [step, setStep] = useState(initialStep);
  const [dbs, setDbs] = useState([]);
  const [dbTodo, setDbTodo] = useState('');
  const [dbRep, setDbRep] = useState('');
  const [todoProps, setTodoProps] = useState([]);
  const [repProps, setRepProps] = useState([]);
  const [todoF, setTodoF] = useState({ ...DEFAULT_TODO_FIELDS });
  const [repF, setRepF] = useState({ ...DEFAULT_REPORT_FIELDS });
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
  const ko = locale === 'ko';

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

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        setHasNotionSession(!!j?.authenticated);
        if (j?.workspace_name) setNotionAccountName(String(j.workspace_name).trim() || null);
        else setNotionAccountName(null);
      } catch { /* */ } finally {
        setSessionInfoReady(true);
      }
    })();
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
    let cancelled = false;
    const ac = new AbortController();
    setDbsListLoading(true);
    setErr('');
    (async () => {
      try {
        const res = await fetch(resolveApiUrl('/api/databases'), {
          ...notionFetchOpts(),
          signal: ac.signal,
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Failed');
        const list = data.databases || [];
        setDbs(list);
        const td = list.find((d) => /todo|할.?일/i.test(d.title));
        const rd = list.find((d) => /report|daily|데일리/i.test(d.title));
        if (td) setDbTodo(td.id);
        if (rd) setDbRep(rd.id);
      } catch (e) {
        if (cancelled || e?.name === 'AbortError') return;
        setErr(e.message);
      } finally {
        if (!cancelled) setDbsListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [step, fromOAuth, dbsListRetryKey]);

  const fetchProps = async () => {
    if (!dbTodo) return;
    setPropsLoading(true);
    setErr('');
    try {
      const [tr, rr] = await Promise.all([
        fetch(resolveApiUrl(`/api/databases/properties?dbId=${encodeURIComponent(dbTodo)}`), notionFetchOpts()),
        dbRep
          ? fetch(resolveApiUrl(`/api/databases/properties?dbId=${encodeURIComponent(dbRep)}`), notionFetchOpts())
          : null,
      ]);
      const td = await readJsonSafe(tr);
      if (!tr.ok) throw new Error(td?.error || 'Failed to load todo properties');
      const todoProperties = td.properties || [];
      setTodoProps(todoProperties);
      setTodoF((prev) =>
        autoMatchFields(prev, todoProperties, {
          name: { aliases: ['이름', 'Name', prev.name], types: ['title', 'rich_text'] },
          date: { aliases: ['날짜', 'Date', prev.date], types: ['date'] },
          done: { aliases: ['완료', 'Done', prev.done], types: ['checkbox', 'status'] },
          accum: {
            aliases: ['Focus min', 'Min', '누적(분)', '누적분', 'Accumulated (min)', prev.accum],
            types: ['number', 'formula', 'rollup'],
          },
        })
      );
      if (rr) {
        const rd = await readJsonSafe(rr);
        if (!rr.ok) throw new Error(rd?.error || 'Failed to load report properties');
        const reportProperties = rd.properties || [];
        setRepProps(reportProperties);
        setRepF((prev) =>
          autoMatchFields(prev, reportProperties, {
            review: {
              aliases: ['하루 리뷰', '한줄리뷰', '한줄 리뷰', 'One-line Review', 'Daily Review', prev.review],
              types: ['rich_text', 'title'],
            },
            totalMin: {
              aliases: ['집중 합계', '오늘 순공시간(분)', '오늘순공시간(분)', 'Today Focus (min)', prev.totalMin],
              types: ['number', 'formula', 'rollup'],
            },
            todoList: { aliases: ['To-do List', '할일 목록', prev.todoList], types: ['relation'] },
            date: { aliases: ['날짜', 'Date', prev.date], types: ['date'] },
          })
        );
      }
      setStep(2);
    } catch (e) {
      setErr(e.message);
    } finally {
      setPropsLoading(false);
    }
  };

  if (step === 0) {
    return (
      <>
        <div className="onboard">
          <div className="onboard-glow" />
          <div
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          >
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
              <img
                src="/onboarding-logo.png?v=2"
                alt="Nock Study Timer logo"
                width={84}
                height={84}
                style={{ borderRadius: 0 }}
              />
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                color: 'var(--text)',
                letterSpacing: '-0.5px',
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {t.appName}
            </div>
            <div style={{ fontSize: 16, color: 'var(--text3)', marginTop: 10, textAlign: 'center' }}>{t.slogan}</div>
          </div>
          <div className="w-full stack-sm">
            <button
              type="button"
              className="btn btn-dark btn-lg btn-full"
              onClick={startNotionOAuth}
              disabled={oauthStarting}
            >
              {t.connectNotion}
            </button>
            {err ? (
              <div style={{ color: 'var(--red)', fontSize: 14, fontWeight: 500, textAlign: 'center' }}>{err}</div>
            ) : null}
            <button
              className="btn btn-muted btn-full"
              style={{ fontSize: 16, padding: '13px' }}
              onClick={onDemo}
              disabled={oauthStarting}
            >
              {t.browse}
            </button>
          </div>
        </div>
        <NotionLoadingOverlay
          open={oauthStarting}
          message={t.notionOAuthOverlayMessage}
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <div className="onboard" style={{ justifyContent: 'space-between', paddingTop: 72 }}>
        <NotionLoadingOverlay open={dbsBlockerVisible} message={null} />
        <div className="w-full flex-1" style={{ overflowY: 'auto' }}>
          <StepDots max={2} cur={0} />
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
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>{t.selectDatabases}</div>
          {fromOAuth && !dbsListLoading && dbs.length === 0 && (
            <div className="stack" style={{ gap: 12, marginBottom: 20 }}>
              <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>
                {t.dbsEmptyHintSettings}
              </p>
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
          <div className="stack">
            <DbPicker
              label={t.todoDB}
              value={dbTodo}
              databases={dbs}
              onChange={setDbTodo}
              placeholder={t.selectDB}
              showDescription={false}
              nameFontSize={18}
            />
            <DbPicker
              label={t.reportDB}
              value={dbRep}
              databases={dbs}
              onChange={setDbRep}
              placeholder={t.selectDB}
              showDescription={false}
              nameFontSize={18}
            />
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 14, marginTop: 10 }}>{err}</div>}
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
          <button className="btn btn-muted btn-lg btn-full" style={{ fontSize: 15 }} onClick={() => setStep(0)}>
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    const tNames = todoProps.map((p) => p.name);
    const rNames = repProps.map((p) => p.name);
    const tTypeMap = new Map(todoProps.map((p) => [p.name, p.type]));
    const rTypeMap = new Map(repProps.map((p) => [p.name, p.type]));
    const lko = (locale || 'ko') === 'ko';
    const reportReviewLabel = lko ? '하루 리뷰' : 'Daily Review';
    const reportTotalLabel = lko ? '집중 합계' : 'Focus Total';
    return (
      <div className="onboard" style={{ justifyContent: 'space-between', paddingTop: 60 }}>
        <div className="w-full flex-1" style={{ overflowY: 'auto' }}>
          <StepDots max={2} cur={1} />
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>{t.confirmFields}</div>

          <div className="sec-label">{t.todoDB}</div>
          <div className="list-sec mb-16">
            {[
              { key: 'name', lbl: t.fieldName },
              { key: 'date', lbl: t.fieldDate },
              { key: 'done', lbl: t.fieldDone },
              { key: 'accum', lbl: t.fieldAccum },
            ].map(({ key, lbl }) => (
              <NotionFieldMapRow
                key={key}
                variant="onboarding"
                mapSection="todo"
                fieldKey={key}
                lbl={lbl}
                val={todoF[key] || ''}
                names={tNames}
                typeMap={tTypeMap}
                loaded
                t={t}
                tSelectProperty={t.selectProperty}
                titleMissing={t.fieldMapNameMissing}
                titleMismatch={t.fieldMapTypeMismatch}
                onChange={(v) => setTodoF((f) => ({ ...f, [key]: v }))}
              />
            ))}
          </div>

          {dbRep && rNames.length > 0 && (
            <>
              <div className="sec-label">{t.reportDB}</div>
              <div className="list-sec mb-16">
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
                    names={rNames}
                    typeMap={rTypeMap}
                    loaded
                    t={t}
                    tSelectProperty={t.selectProperty}
                    titleMissing={t.fieldMapNameMissing}
                    titleMismatch={t.fieldMapTypeMismatch}
                    onChange={(v) => setRepF((f) => ({ ...f, [key]: v }))}
                  />
                ))}
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
                { authMode: 'oauth', dbTodo, dbReport: dbRep, ...(name ? { workspaceName: name } : {}) },
                { todoFields: todoF, reportFields: repF }
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
      <button type="button" className="btn btn-dark btn-lg btn-full" onClick={() => setStep(0)}>
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
