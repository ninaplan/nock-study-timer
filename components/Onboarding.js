'use client';
// components/Onboarding.js
import { useState } from 'react';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS } from '@/app/lib/fields';

export default function Onboarding({ t, onComplete, onDemo }) {
  const [step, setStep] = useState(0); // 0=welcome, 1=token, 2=select dbs, 3=confirm fields
  const [token, setToken] = useState('');
  const [databases, setDatabases] = useState([]);
  const [dbTodo, setDbTodo] = useState('');
  const [dbReport, setDbReport] = useState('');
  const [todoProps, setTodoProps] = useState([]);
  const [reportProps, setReportProps] = useState([]);
  const [todoFields, setTodoFields] = useState({ ...DEFAULT_TODO_FIELDS });
  const [reportFields, setReportFields] = useState({ ...DEFAULT_REPORT_FIELDS });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchDbs = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/databases', {
        headers: { 'x-notion-token': token.trim() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDatabases(data.databases);

      // Auto-match
      const todoDb = data.databases.find((d) =>
        d.title.toLowerCase().includes('todo') ||
        d.title.toLowerCase().includes('to-do') ||
        d.title.toLowerCase().includes('할일') ||
        d.title.toLowerCase().includes('할 일')
      );
      const reportDb = data.databases.find((d) =>
        d.title.toLowerCase().includes('report') ||
        d.title.toLowerCase().includes('daily') ||
        d.title.toLowerCase().includes('데일리')
      );
      if (todoDb) setDbTodo(todoDb.id);
      if (reportDb) setDbReport(reportDb.id);

      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async () => {
    if (!dbTodo) return;
    setLoading(true);
    setError('');
    try {
      const [todoRes, reportRes] = await Promise.all([
        fetch(`/api/databases/${dbTodo}/properties`, {
          headers: { 'x-notion-token': token },
        }),
        dbReport
          ? fetch(`/api/databases/${dbReport}/properties`, {
              headers: { 'x-notion-token': token },
            })
          : Promise.resolve(null),
      ]);

      const todoData = await todoRes.json();
      setTodoProps(todoData.properties || []);

      if (reportRes) {
        const reportData = await reportRes.json();
        setReportProps(reportData.properties || []);
      }

      // Auto-match fields
      const autoMatchTodo = { ...DEFAULT_TODO_FIELDS };
      const propNames = (todoData.properties || []).map((p) => p.name);
      Object.keys(autoMatchTodo).forEach((key) => {
        const def = DEFAULT_TODO_FIELDS[key];
        if (propNames.includes(def)) autoMatchTodo[key] = def;
      });
      setTodoFields(autoMatchTodo);

      if (reportRes) {
        const reportData = await (async () => {
          const r = await reportRes;
          return r;
        })();
        const autoMatchReport = { ...DEFAULT_REPORT_FIELDS };
        setReportFields(autoMatchReport);
      }

      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onComplete(
      { token: token.trim(), dbTodo, dbReport },
      { todoFields, reportFields }
    );
  };

  if (step === 0) {
    return (
      <div className="onboarding">
        <div className="onboarding-blob" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <div className="onboarding-icon">⏱️</div>
          <h1 className="onboarding-title">{t.appName}</h1>
          <p className="onboarding-slogan">{t.slogan}</p>
        </div>
        <div className="w-full stack">
          <button className="btn btn-primary btn-full btn-lg" onClick={() => setStep(1)}>
            {t.connectNotion}
          </button>
          <button className="btn btn-ghost btn-full" onClick={onDemo}>
            {t.browse}
          </button>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="onboarding" style={{ justifyContent: 'space-between', paddingTop: 80 }}>
        <div className="w-full">
          <StepDots current={0} total={4} />
          <h2 className="onboarding-title" style={{ textAlign: 'left', fontSize: 24 }}>
            {t.connectNotionTitle}
          </h2>
          <p className="onboarding-slogan" style={{ textAlign: 'left', marginBottom: 24 }}>
            {t.tokenHelp}
          </p>

          <label className="input-label">{t.tokenLabel}</label>
          <input
            className="input"
            type="password"
            placeholder={t.tokenPlaceholder}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
          />

          <a
            href="https://www.notion.so/my-integrations"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', color: 'var(--accent)', fontSize: 14, marginTop: 8 }}
          >
            {t.howToGetToken} →
          </a>

          {error && <p style={{ color: 'var(--red)', fontSize: 14, marginTop: 8 }}>{error}</p>}
        </div>

        <div className="w-full stack-sm">
          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={fetchDbs}
            disabled={!token.trim() || loading}
          >
            {loading ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : t.next}
          </button>
          <button className="btn btn-ghost btn-full" onClick={() => setStep(0)}>
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="onboarding" style={{ justifyContent: 'space-between', paddingTop: 80 }}>
        <div className="w-full" style={{ flex: 1 }}>
          <StepDots current={1} total={4} />
          <h2 className="onboarding-title" style={{ textAlign: 'left', fontSize: 24 }}>
            {t.selectDatabases}
          </h2>
          <div className="stack mt-24">
            <div>
              <label className="input-label">{t.todoDB}</label>
              <select
                className="input"
                value={dbTodo}
                onChange={(e) => setDbTodo(e.target.value)}
              >
                <option value="">{t.selectDB}</option>
                {databases.map((db) => (
                  <option key={db.id} value={db.id}>{db.path || db.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">{t.reportDB}</label>
              <select
                className="input"
                value={dbReport}
                onChange={(e) => setDbReport(e.target.value)}
              >
                <option value="">{t.selectDB}</option>
                {databases.map((db) => (
                  <option key={db.id} value={db.id}>{db.path || db.title}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p style={{ color: 'var(--red)', fontSize: 14, marginTop: 8 }}>{error}</p>}
        </div>

        <div className="w-full stack-sm">
          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={fetchProperties}
            disabled={!dbTodo || loading}
          >
            {loading ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : t.next}
          </button>
          <button className="btn btn-ghost btn-full" onClick={() => setStep(1)}>
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  if (step === 3) {
    const allTodoNames = todoProps.map((p) => p.name);
    const allReportNames = reportProps.map((p) => p.name);

    const FieldRow = ({ label, fieldKey, value, onChange, options, required }) => {
      const missing = required && !options.includes(value);
      return (
        <div className="list-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span style={{ fontSize: 13, color: missing ? 'var(--red)' : 'var(--text3)', fontWeight: 600 }}>
            {label} {missing && '⚠️'}
          </span>
          <select
            className="input"
            value={value}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            style={{ background: 'var(--bg3)' }}
          >
            <option value="">{t.selectProperty}</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    };

    return (
      <div className="onboarding" style={{ justifyContent: 'space-between', paddingTop: 60 }}>
        <div className="w-full" style={{ flex: 1, overflowY: 'auto' }}>
          <StepDots current={2} total={4} />
          <h2 className="onboarding-title" style={{ textAlign: 'left', fontSize: 24, marginBottom: 16 }}>
            {t.confirmFields}
          </h2>

          <p className="input-label" style={{ marginBottom: 4 }}>{t.todoDB}</p>
          <div className="list-section mb-12">
            <FieldRow label={t.fieldName} fieldKey="name" value={todoFields.name} onChange={(k, v) => setTodoFields(f => ({...f, [k]: v}))} options={allTodoNames} required />
            <FieldRow label={t.fieldDate} fieldKey="date" value={todoFields.date} onChange={(k, v) => setTodoFields(f => ({...f, [k]: v}))} options={allTodoNames} required />
            <FieldRow label={t.fieldDone} fieldKey="done" value={todoFields.done} onChange={(k, v) => setTodoFields(f => ({...f, [k]: v}))} options={allTodoNames} />
            <FieldRow label={t.fieldAccum} fieldKey="accum" value={todoFields.accum} onChange={(k, v) => setTodoFields(f => ({...f, [k]: v}))} options={allTodoNames} required />
          </div>

          {dbReport && reportProps.length > 0 && (
            <>
              <p className="input-label" style={{ marginBottom: 4 }}>{t.reportDB}</p>
              <div className="list-section mb-12">
                <FieldRow label={t.fieldReview} fieldKey="review" value={reportFields.review} onChange={(k, v) => setReportFields(f => ({...f, [k]: v}))} options={allReportNames} />
                <FieldRow label={t.fieldTotalMin} fieldKey="totalMin" value={reportFields.totalMin} onChange={(k, v) => setReportFields(f => ({...f, [k]: v}))} options={allReportNames} />
              </div>
            </>
          )}
        </div>

        <div className="w-full stack-sm" style={{ paddingTop: 16 }}>
          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleComplete}
          >
            {t.finish} 🎉
          </button>
          <button className="btn btn-ghost btn-full" onClick={() => setStep(2)}>
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function StepDots({ current, total }) {
  return (
    <div className="step-dots" style={{ marginBottom: 20 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`step-dot ${i === current ? 'active' : ''}`} />
      ))}
    </div>
  );
}
