'use client';
// components/SettingsTab.js
import { useState, useCallback } from 'react';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS } from '@/app/lib/fields';

export default function SettingsTab({ t, creds, settings, onSaveSettings, onSaveCreds, onDisconnect, locale }) {
  const [showReconnect, setShowReconnect] = useState(false);
  const [token, setToken] = useState(creds?.token || '');
  const [dbTodo, setDbTodo] = useState(creds?.dbTodo || '');
  const [dbReport, setDbReport] = useState(creds?.dbReport || '');
  const [databases, setDatabases] = useState([]);
  const [todoProps, setTodoProps] = useState([]);
  const [reportProps, setReportProps] = useState([]);
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [loadingProps, setLoadingProps] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const todoFields = { ...DEFAULT_TODO_FIELDS, ...(settings?.todoFields || {}) };
  const reportFields = { ...DEFAULT_REPORT_FIELDS, ...(settings?.reportFields || {}) };

  const fetchDbs = async () => {
    if (!token.trim()) return;
    setLoadingDbs(true);
    setError('');
    try {
      const res = await fetch('/api/databases', {
        headers: { 'x-notion-token': token.trim() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDatabases(data.databases || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingDbs(false);
    }
  };

  const fetchProps = async (dbId, type) => {
    if (!dbId) return;
    setLoadingProps(true);
    try {
      const res = await fetch(`/api/databases/${dbId}/properties`, {
        headers: { 'x-notion-token': token || creds?.token },
      });
      const data = await res.json();
      if (type === 'todo') setTodoProps(data.properties || []);
      else setReportProps(data.properties || []);
    } catch {}
    setLoadingProps(false);
  };

  const handleLangChange = (lang) => {
    onSaveSettings({ ...settings, lang: lang === 'system' ? null : lang });
  };

  const handleReconnect = async () => {
    if (!token.trim() || !dbTodo) return;
    onSaveCreds({ token: token.trim(), dbTodo, dbReport });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setShowReconnect(false);
  };

  const handleFieldChange = (type, key, value) => {
    if (type === 'todo') {
      onSaveSettings({
        ...settings,
        todoFields: { ...todoFields, [key]: value },
      });
    } else {
      onSaveSettings({
        ...settings,
        reportFields: { ...reportFields, [key]: value },
      });
    }
  };

  return (
    <div style={{ minHeight: '100%' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-title">{t.settings}</div>
      </div>

      <div style={{ padding: '16px' }}>

        {/* Language */}
        <div className="list-section-header">{t.language}</div>
        <div className="list-section" style={{ marginBottom: 24 }}>
          {[
            { value: 'system', label: t.system },
            { value: 'ko', label: t.korean },
            { value: 'en', label: t.english },
          ].map(({ value, label }) => (
            <button
              key={value}
              className="list-row"
              style={{
                width: '100%',
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
                fontFamily: 'var(--font)',
              }}
              onClick={() => handleLangChange(value)}
            >
              <span style={{ flex: 1, textAlign: 'left', fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>
                {label}
              </span>
              {(settings?.lang || 'system') === value && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Notion Connection */}
        <div className="list-section-header">{t.notionConnection}</div>
        <div className="list-section" style={{ marginBottom: 16 }}>
          <div className="list-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                {creds?.token ? t.connected : t.notConnected}
              </div>
              {creds?.token && (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {creds.token.slice(0, 12)}...
                </div>
              )}
            </div>
            <div style={{
              width: 10, height: 10, borderRadius: 5,
              background: creds?.token ? 'var(--green)' : 'var(--red)',
            }} />
          </div>
        </div>

        {/* Reconnect toggle */}
        {!showReconnect ? (
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            <button
              className="btn btn-secondary flex-1 btn-sm"
              onClick={() => setShowReconnect(true)}
            >
              {t.reconnect}
            </button>
            {creds?.token && (
              <button
                className="btn btn-danger flex-1 btn-sm"
                onClick={onDisconnect}
              >
                {t.disconnect}
              </button>
            )}
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="stack">
              <div>
                <label className="input-label">{t.tokenLabel}</label>
                <input
                  className="input"
                  type="password"
                  placeholder={t.tokenPlaceholder}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary btn-sm"
                onClick={fetchDbs}
                disabled={!token.trim() || loadingDbs}
                style={{ alignSelf: 'flex-start' }}
              >
                {loadingDbs ? <span className="spinner" style={{ borderTopColor: 'white', width: 14, height: 14 }} /> : locale === 'ko' ? 'DB 조회' : 'Load DBs'}
              </button>

              {error && <div style={{ fontSize: 13, color: 'var(--red)' }}>{error}</div>}

              {databases.length > 0 && (
                <>
                  <div>
                    <label className="input-label">{t.todoDB}</label>
                    <select
                      className="input"
                      value={dbTodo}
                      onChange={(e) => {
                        setDbTodo(e.target.value);
                        fetchProps(e.target.value, 'todo');
                      }}
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
                      onChange={(e) => {
                        setDbReport(e.target.value);
                        fetchProps(e.target.value, 'report');
                      }}
                    >
                      <option value="">{t.selectDB}</option>
                      {databases.map((db) => (
                        <option key={db.id} value={db.id}>{db.path || db.title}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-secondary flex-1 btn-sm"
                  onClick={() => setShowReconnect(false)}
                >
                  {t.cancel}
                </button>
                <button
                  className="btn btn-primary flex-1 btn-sm"
                  onClick={handleReconnect}
                  disabled={!token.trim() || !dbTodo}
                >
                  {saved ? `✓ ${t.saved}` : t.save}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DB Properties */}
        {creds?.token && (
          <>
            <div className="list-section-header">{t.dbProperties}</div>

            {/* Todo fields */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, padding: '8px 4px 4px' }}>
                {t.todoDB}
              </div>
              <FieldEditor
                fields={[
                  { key: 'name', label: t.fieldName },
                  { key: 'date', label: t.fieldDate },
                  { key: 'done', label: t.fieldDone },
                  { key: 'accum', label: t.fieldAccum },
                ]}
                values={todoFields}
                props={todoProps}
                onLoadProps={() => {
                  if (creds?.dbTodo) fetchProps(creds.dbTodo, 'todo');
                }}
                onChange={(key, val) => handleFieldChange('todo', key, val)}
                t={t}
              />
            </div>

            {creds?.dbReport && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, padding: '8px 4px 4px' }}>
                  {t.reportDB}
                </div>
                <FieldEditor
                  fields={[
                    { key: 'review', label: t.fieldReview },
                    { key: 'totalMin', label: t.fieldTotalMin },
                  ]}
                  values={reportFields}
                  props={reportProps}
                  onLoadProps={() => {
                    if (creds?.dbReport) fetchProps(creds.dbReport, 'report');
                  }}
                  onChange={(key, val) => handleFieldChange('report', key, val)}
                  t={t}
                />
              </div>
            )}
          </>
        )}

        {/* App version */}
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text4)', fontSize: 12 }}>
          노크 순공타이머 v1.0.0
        </div>
      </div>
    </div>
  );
}

function FieldEditor({ fields, values, props, onLoadProps, onChange, t }) {
  const [loaded, setLoaded] = useState(props.length > 0);

  const handleLoad = async () => {
    await onLoadProps();
    setLoaded(true);
  };

  const propNames = props.map((p) => p.name);

  return (
    <div className="list-section" style={{ marginBottom: 0 }}>
      {fields.map(({ key, label }) => {
        const val = values[key] || '';
        const missing = loaded && propNames.length > 0 && !propNames.includes(val);
        return (
          <div key={key} className="list-row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: missing ? 'var(--red)' : 'var(--text)',
              minWidth: 90,
            }}>
              {label}
            </span>
            {loaded && props.length > 0 ? (
              <select
                className="input"
                style={{ flex: 1, padding: '7px 10px', fontSize: 14 }}
                value={val}
                onChange={(e) => onChange(key, e.target.value)}
              >
                <option value="">{t.selectProperty}</option>
                {propNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            ) : (
              <span
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: 'var(--text3)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
                onClick={handleLoad}
              >
                {val || t.selectProperty}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
