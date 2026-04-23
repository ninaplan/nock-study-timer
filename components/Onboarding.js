'use client';
import { useState } from 'react';
import { Timer } from 'lucide-react';
import DbPicker from './DbPicker';
import { DEFAULT_TODO_FIELDS, DEFAULT_REPORT_FIELDS } from '@/app/lib/fields';

export default function Onboarding({ t, locale, onComplete, onDemo }) {
  const [step, setStep]     = useState(0);
  const [token, setToken]   = useState('');
  const [dbs, setDbs]       = useState([]);
  const [dbTodo, setDbTodo] = useState('');
  const [dbRep, setDbRep]   = useState('');
  const [todoProps, setTodoProps] = useState([]);
  const [repProps,  setRepProps]  = useState([]);
  const [todoF, setTodoF] = useState({ ...DEFAULT_TODO_FIELDS });
  const [repF,  setRepF]  = useState({ ...DEFAULT_REPORT_FIELDS });
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const ko = locale === 'ko';

  const fetchDbs = async () => {
    if (!token.trim()) return;
    setLoading(true); setErr('');
    try {
      const res  = await fetch('/api/databases', { headers: { 'x-notion-token': token.trim() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDbs(data.databases);
      // auto-match
      const td = data.databases.find(d => /todo|할.?일/i.test(d.title));
      const rd = data.databases.find(d => /report|daily|데일리/i.test(d.title));
      if (td) setDbTodo(td.id);
      if (rd) setDbRep(rd.id);
      setStep(2);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const readJsonSafe = async (res) => {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text();
      throw new Error(txt.includes('<!DOCTYPE') ? '서버 라우트 오류(HTML 응답)' : txt || '서버 응답 오류');
    }
    return res.json();
  };

  const fetchProps = async () => {
    if (!dbTodo) return;
    setLoading(true); setErr('');
    try {
      const [tr, rr] = await Promise.all([
        fetch(`/api/databases/properties?dbId=${encodeURIComponent(dbTodo)}`, { headers: { 'x-notion-token': token } }),
        dbRep ? fetch(`/api/databases/properties?dbId=${encodeURIComponent(dbRep)}`, { headers: { 'x-notion-token': token } }) : null,
      ]);
      const td = await readJsonSafe(tr);
      if (!tr.ok) throw new Error(td?.error || 'Failed to load todo properties');
      setTodoProps(td.properties || []);
      if (rr) {
        const rd = await readJsonSafe(rr);
        if (!rr.ok) throw new Error(rd?.error || 'Failed to load report properties');
        setRepProps(rd.properties || []);
      }
      setStep(3);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  if (step === 0) return (
    <div className="onboard">
      <div className="onboard-glow"/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <div style={{ marginBottom:20, display:'flex', justifyContent:'center' }}>
          <Timer size={72} strokeWidth={1.9} color="var(--text)" />
        </div>
        <div style={{ fontSize:34, fontWeight:800, color:'var(--text)', letterSpacing:'-0.5px', textAlign:'center', lineHeight:1.2 }}>
          {t.appName}
        </div>
        <div style={{ fontSize:16, color:'var(--text3)', marginTop:10, textAlign:'center' }}>{t.slogan}</div>
      </div>
      <div className="w-full stack-sm">
        <button className="btn btn-dark btn-lg btn-full" onClick={()=>setStep(1)}>{t.connectNotion}</button>
        <button className="btn btn-muted btn-full" style={{fontSize:16,padding:'13px'}} onClick={onDemo}>{t.browse}</button>
      </div>
    </div>
  );

  if (step === 1) return (
    <div className="onboard" style={{ justifyContent:'space-between', paddingTop:72 }}>
      <div className="w-full flex-1">
        <StepDots cur={0}/>
        <div style={{ fontSize:26, fontWeight:800, color:'var(--text)', marginBottom:6 }}>{t.connectNotionTitle}</div>
        <div style={{ fontSize:14, color:'var(--text3)', marginBottom:28 }}>{t.tokenHelp}</div>
        <label className="input-label">{t.tokenLabel}</label>
        <input className="input" type="password" placeholder={t.tokenPlaceholder}
          value={token} onChange={e=>setToken(e.target.value)} autoFocus/>
        <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer"
          style={{ display:'block', color:'var(--text)', fontSize:14, marginTop:10, fontWeight:600 }}>
          {t.howToGetToken} →
        </a>
        {err && <div style={{ color:'var(--red)', fontSize:14, marginTop:10, fontWeight:600 }}>{err}</div>}
      </div>
      <div
        className="w-full stack-sm"
        style={{
          position:'sticky',
          bottom:0,
          background:'var(--bg)',
          paddingTop:10,
          paddingBottom:'max(28px, env(safe-area-inset-bottom))',
          zIndex:2,
        }}
      >
        <button className="btn btn-dark btn-lg btn-full" onClick={fetchDbs} disabled={!token.trim()||loading}>
          {loading ? <span className="spin"/> : t.next}
        </button>
        <button className="btn btn-muted btn-lg btn-full" style={{fontSize:15}} onClick={()=>setStep(0)}>{t.back}</button>
      </div>
    </div>
  );

  if (step === 2) return (
    <div className="onboard" style={{ justifyContent:'space-between', paddingTop:72 }}>
      <div className="w-full flex-1" style={{ overflowY:'auto' }}>
        <StepDots cur={1}/>
        <div style={{ fontSize:26, fontWeight:800, color:'var(--text)', marginBottom:24 }}>{t.selectDatabases}</div>
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
        {err && <div style={{ color:'var(--red)', fontSize:14, marginTop:10 }}>{err}</div>}
      </div>
      <div
        className="w-full stack-sm"
        style={{
          position:'sticky',
          bottom:0,
          background:'var(--bg)',
          paddingTop:10,
          paddingBottom:'max(28px, env(safe-area-inset-bottom))',
          zIndex:2,
        }}
      >
        <button className="btn btn-dark btn-lg btn-full" onClick={fetchProps} disabled={!dbTodo||loading}>
          {loading ? <span className="spin"/> : t.next}
        </button>
        <button className="btn btn-muted btn-lg btn-full" style={{fontSize:15}} onClick={()=>setStep(1)}>{t.back}</button>
      </div>
    </div>
  );

  if (step === 3) {
    const tNames = todoProps.map(p=>p.name);
    const rNames = repProps.map(p=>p.name);
    const tTypeMap = new Map(todoProps.map((p) => [p.name, p.type]));
    const rTypeMap = new Map(repProps.map((p) => [p.name, p.type]));
    const ko = (locale || 'ko') === 'ko';
    return (
      <div className="onboard" style={{ justifyContent:'space-between', paddingTop:60 }}>
        <div className="w-full flex-1" style={{ overflowY:'auto' }}>
          <StepDots cur={2}/>
          <div style={{ fontSize:26, fontWeight:800, color:'var(--text)', marginBottom:20 }}>{t.confirmFields}</div>

          <div className="sec-label">{t.todoDB}</div>
          <div className="list-sec mb-16">
            {[
              { key:'name',  lbl:t.fieldName },
              { key:'date',  lbl:t.fieldDate },
              { key:'done',  lbl:t.fieldDone },
              { key:'accum', lbl:t.fieldAccum },
            ].map(({key,lbl}) => {
              const val = todoF[key]||'';
              const bad = tNames.length>0 && !tNames.includes(val);
              const selectedType = val ? tTypeMap.get(val) : null;
              return (
                <div key={key} className="list-row" style={{flexDirection:'column',alignItems:'flex-start',gap:6,padding:'12px 18px'}}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{fontSize:13,fontWeight:700,color:bad?'var(--red)':'var(--text3)'}}>{lbl}{bad?' ⚠':''}</span>
                    {selectedType && (
                      <span style={{ fontSize:11, color:'var(--text3)', background:'var(--bg3)', borderRadius:999, padding:'2px 8px', lineHeight:1.2 }}>
                        {formatPropertyType(selectedType, ko)}
                      </span>
                    )}
                  </div>
                  <select className="input" style={{padding:'8px 12px',fontSize:14}} value={val}
                    onChange={e=>setTodoF(f=>({...f,[key]:e.target.value}))}>
                    <option value="">{t.selectProperty}</option>
                    {tNames.map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              );
            })}
          </div>

          {dbRep && rNames.length>0 && (
            <>
              <div className="sec-label">{t.reportDB}</div>
              <div className="list-sec mb-16">
                {[
                  { key:'review',   lbl:t.fieldReview },
                  { key:'totalMin', lbl:t.fieldTotalMin },
                ].map(({key,lbl}) => {
                  const val = repF[key]||'';
                  const bad = rNames.length>0 && !rNames.includes(val);
                  const selectedType = val ? rTypeMap.get(val) : null;
                  return (
                    <div key={key} className="list-row" style={{flexDirection:'column',alignItems:'flex-start',gap:6,padding:'12px 18px'}}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{fontSize:13,fontWeight:700,color:bad?'var(--red)':'var(--text3)'}}>{lbl}{bad?' ⚠':''}</span>
                        {selectedType && (
                          <span style={{ fontSize:11, color:'var(--text3)', background:'var(--bg3)', borderRadius:999, padding:'2px 8px', lineHeight:1.2 }}>
                            {formatPropertyType(selectedType, ko)}
                          </span>
                        )}
                      </div>
                      <select className="input" style={{padding:'8px 12px',fontSize:14}} value={val}
                        onChange={e=>setRepF(f=>({...f,[key]:e.target.value}))}>
                        <option value="">{t.selectProperty}</option>
                        {rNames.map(n=><option key={n} value={n}>{n}</option>)}
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
            position:'sticky',
            bottom:0,
            background:'var(--bg)',
            paddingTop:16,
            paddingBottom:'max(28px, env(safe-area-inset-bottom))',
            zIndex:2,
          }}
        >
          <button className="btn btn-dark btn-lg btn-full"
            onClick={()=>onComplete({token:token.trim(),dbTodo,dbReport:dbRep},{todoFields:todoF,reportFields:repF})}>
            {t.finish}
          </button>
          <button className="btn btn-muted btn-lg btn-full" style={{fontSize:15}} onClick={()=>setStep(2)}>{t.back}</button>
        </div>
      </div>
    );
  }
  return null;
}

const StepDots = ({ cur }) => (
  <div className="dots" style={{marginBottom:20}}>
    {[0,1,2,3].map(i=><div key={i} className={`dot ${i===cur?'on':''}`}/>)}
  </div>
);

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
    url: ko ? 'URL' : 'URL',
    email: ko ? '이메일' : 'Email',
    phone_number: ko ? '전화번호' : 'Phone',
    created_time: ko ? '생성시각' : 'Created time',
    last_edited_time: ko ? '수정시각' : 'Edited time',
    created_by: ko ? '생성자' : 'Created by',
    last_edited_by: ko ? '수정자' : 'Edited by',
  };
  return map[type] || type || (ko ? '기타' : 'Other');
}
