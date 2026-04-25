'use client';
import { useState, useEffect, useRef } from 'react';
import DbPicker from './DbPicker';
import { resolveApiUrl } from './lib/apiClient';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS } from '@/app/lib/fields';

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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const oauthDbsTried = useRef(false);
  const ko = locale === 'ko';

  const readJsonSafe = async (res) => {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text();
      throw new Error(txt.includes('<!DOCTYPE') ? '서버 라우트 오류(HTML 응답)' : txt || '서버 응답 오류');
    }
    return res.json();
  };

  useEffect(() => {
    if (step !== 1 || !fromOAuth || oauthDbsTried.current) return;
    oauthDbsTried.current = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const res = await fetch(resolveApiUrl('/api/databases'), notionFetchOpts());
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        setDbs(data.databases);
        const list = data.databases;
        const td = list.find((d) => /todo|할.?일/i.test(d.title));
        const rd = list.find((d) => /report|daily|데일리/i.test(d.title));
        if (td) setDbTodo(td.id);
        if (rd) setDbRep(rd.id);
      } catch (e) {
        setErr(e.message);
        oauthDbsTried.current = false;
      } finally {
        setLoading(false);
      }
    })();
  }, [step, fromOAuth]);

  const fetchProps = async () => {
    if (!dbTodo) return;
    setLoading(true);
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
      setLoading(false);
    }
  };

  if (step === 0) {
    return (
      <div className="onboard">
        <div className="onboard-glow" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
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
              fontWeight: 800,
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
          <a className="btn btn-dark btn-lg btn-full" style={{ textAlign: 'center', textDecoration: 'none' }} href={resolveApiUrl('/api/auth/notion')}>
            {t.connectNotion}
          </a>
          <button className="btn btn-muted btn-full" style={{ fontSize: 16, padding: '13px' }} onClick={onDemo}>
            {t.browse}
          </button>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="onboard" style={{ justifyContent: 'space-between', paddingTop: 72 }}>
        <div className="w-full flex-1" style={{ overflowY: 'auto' }}>
          <StepDots max={2} cur={0} />
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 24 }}>{t.selectDatabases}</div>
          <div className="stack">
            <DbPicker
              label={t.todoDB}
              value={dbTodo}
              databases={dbs}
              onChange={setDbTodo}
              placeholder={t.selectDB}
            />
            <DbPicker
              label={t.reportDB}
              value={dbRep}
              databases={dbs}
              onChange={setDbRep}
              placeholder={t.selectDB}
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
          <button className="btn btn-dark btn-lg btn-full" onClick={fetchProps} disabled={!dbTodo || loading}>
            {loading ? <span className="spin" /> : t.next}
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
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>{t.confirmFields}</div>

          <div className="sec-label">{t.todoDB}</div>
          <div className="list-sec mb-16">
            {[
              { key: 'name', lbl: t.fieldName },
              { key: 'date', lbl: t.fieldDate },
              { key: 'done', lbl: t.fieldDone },
              { key: 'accum', lbl: t.fieldAccum },
            ].map(({ key, lbl }) => {
              const val = todoF[key] || '';
              const bad = tNames.length > 0 && !tNames.includes(val);
              const selectedType = val ? tTypeMap.get(val) : null;
              return (
                <div key={key} className="list-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '12px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: bad ? 'var(--red)' : 'var(--text3)' }}>
                      {lbl}
                      {bad ? ' ⚠' : ''}
                    </span>
                    {selectedType && (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--text3)',
                          background: 'var(--bg3)',
                          borderRadius: 999,
                          padding: '2px 8px',
                          lineHeight: 1.2,
                        }}
                      >
                        {formatPropertyType(selectedType, lko)}
                      </span>
                    )}
                  </div>
                  <select
                    className="input"
                    style={{ padding: '8px 12px', fontSize: 14 }}
                    value={val}
                    onChange={(e) => setTodoF((f) => ({ ...f, [key]: e.target.value }))}
                  >
                    <option value="">{t.selectProperty}</option>
                    {tNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {dbRep && rNames.length > 0 && (
            <>
              <div className="sec-label">{t.reportDB}</div>
              <div className="list-sec mb-16">
                {[
                  { key: 'review', lbl: reportReviewLabel },
                  { key: 'totalMin', lbl: reportTotalLabel },
                ].map(({ key, lbl }) => {
                  const val = repF[key] || '';
                  const bad = rNames.length > 0 && !rNames.includes(val);
                  const selectedType = val ? rTypeMap.get(val) : null;
                  return (
                    <div key={key} className="list-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '12px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: bad ? 'var(--red)' : 'var(--text3)' }}>
                          {lbl}
                          {bad ? ' ⚠' : ''}
                        </span>
                        {selectedType && (
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--text3)',
                              background: 'var(--bg3)',
                              borderRadius: 999,
                              padding: '2px 8px',
                              lineHeight: 1.2,
                            }}
                          >
                            {formatPropertyType(selectedType, lko)}
                          </span>
                        )}
                      </div>
                      <select
                        className="input"
                        style={{ padding: '8px 12px', fontSize: 14 }}
                        value={val}
                        onChange={(e) => setRepF((f) => ({ ...f, [key]: e.target.value }))}
                      >
                        <option value="">{t.selectProperty}</option>
                        {rNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
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
            onClick={() => onComplete({ authMode: 'oauth', dbTodo, dbReport: dbRep }, { todoFields: todoF, reportFields: repF })}
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

function formatPropertyType(type, lko) {
  const map = {
    title: lko ? '제목' : 'Title',
    rich_text: lko ? '텍스트' : 'Text',
    number: lko ? '숫자' : 'Number',
    select: lko ? '선택' : 'Select',
    multi_select: lko ? '다중 선택' : 'Multi-select',
    status: lko ? '상태' : 'Status',
    date: lko ? '날짜' : 'Date',
    checkbox: lko ? '체크박스' : 'Checkbox',
    relation: lko ? '관계' : 'Relation',
    formula: lko ? '수식' : 'Formula',
    rollup: lko ? '롤업' : 'Rollup',
    people: lko ? '사람' : 'People',
    files: lko ? '파일' : 'Files',
    url: lko ? 'URL' : 'URL',
    email: lko ? '이메일' : 'Email',
    phone_number: lko ? '전화번호' : 'Phone',
    created_time: lko ? '생성시각' : 'Created time',
    last_edited_time: lko ? '수정시각' : 'Edited time',
    created_by: lko ? '생성자' : 'Created by',
    last_edited_by: lko ? '수정자' : 'Edited by',
  };
  return map[type] || type || (lko ? '기타' : 'Other');
}

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
